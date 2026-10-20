#!/usr/bin/env python3
"""OfferDesk competition + future data: who already owns the houses, how old they are, who's moving in.

Writes census.json for the Markets page "Room at the table" lens:
  per ZIP (Census ACS 5-year, by ZCTA):
    sfr / sfr0   share of single-family detached homes that are rented out, now and 5 years earlier
                 (rented single-family homes are mostly investor-owned: a high or fast-rising share
                 means investors are already crowding in)
    yb           median year the homes were built (older stock = more houses that need work)
    own65/own75  share of owner-occupied homes whose owner is 65+ / 75+ (estates and downsizing ahead)
    ovac         "other vacant" homes as a share of all homes (neglected / stuck properties)
    inc / inc0   median household income, now and 5 years earlier
    pop / pop0   population, now and 5 years earlier
    cty          county FIPS (largest land overlap, Census ZCTA-county relationship file)
  per county:
    Census population estimates: growth since 2020, net domestic migration since 2020, last-year growth
    BLS QCEW: total jobs, change over 1 and 2 years
Usage: python build_census.py OUT_DIR
"""
import csv, io, json, os, sys, datetime, urllib.request, urllib.error

UA = {'User-Agent': 'Mozilla/5.0 (OfferDesk market job; github.com/ItzEzi/offerdesk)'}
ACS = 'https://api.census.gov/data/%d/acs/acs5'
REL = 'https://www2.census.gov/geo/docs/maps-data/data/rel2020/zcta520/tab20_zcta520_county20_natl.txt'
PEP = 'https://www2.census.gov/programs-surveys/popest/datasets/2020-%d/counties/totals/co-est%d-alldata.csv'
QCEW = 'https://data.bls.gov/cew/data/api/%d/%d/industry/10.csv'
STATUS = {}

# ACS variables, with words their labels must contain (checked against the Census variable list)
V = {
    'ownDet': ('B25032_003E', ['owner', '1, detached']),
    'rentDet': ('B25032_014E', ['renter', '1, detached']),
    'yb': ('B25035_001E', ['median year']),
    'own': ('B25007_002E', ['owner']),
    'o65': ('B25007_009E', ['owner', '65 to 74']),
    'o75': ('B25007_010E', ['owner', '75 to 84']),
    'o85': ('B25007_011E', ['owner', '85 years']),
    'units': ('B25001_001E', ['total']),
    'ovac': ('B25004_008E', ['other vacant']),
    'inc': ('B19013_001E', ['median household income']),
    'pop': ('B01003_001E', ['total']),
}
BASE_V = ['ownDet', 'rentDet', 'inc', 'pop']

def get(url, timeout=300):
    req = urllib.request.Request(url, headers=UA)
    return urllib.request.urlopen(req, timeout=timeout).read()

def num(v):
    try:
        x = float(v)
    except (TypeError, ValueError):
        return None
    return None if x != x or x <= -555555555 else x   # Census uses -666666666 etc. for "no estimate"

def r1(x):
    return None if x is None else round(x, 1)

def check_labels(year):
    bad = []
    for k, (code, words) in V.items():
        try:
            lab = json.loads(get('%s/variables/%s.json' % (ACS % year, code), 60)).get('label', '')
        except Exception as e:
            print('label check failed for', code, e)
            continue
        low = lab.lower()
        ok = all(w in low for w in words)
        print('ACS %d %s %s: %s%s' % (year, code, k, lab, '' if ok else '   <-- UNEXPECTED'))
        if not ok:
            bad.append(code)
    return bad

def acs(year, keys):
    codes = [V[k][0] for k in keys]
    url = '%s?get=%s&for=zip%%20code%%20tabulation%%20area:*' % (ACS % year, ','.join(codes))
    raw = get(url, 600)
    try:
        data = json.loads(raw)
    except ValueError:
        raise RuntimeError('not JSON: ' + raw[:200].decode('utf-8', 'replace'))
    head = data[0]
    iz = head.index('zip code tabulation area')
    idx = {k: head.index(V[k][0]) for k in keys}
    out = {}
    for r in data[1:]:
        out[r[iz]] = {k: num(r[i]) for k, i in idx.items()}
    print('ACS %d: %d ZCTAs' % (year, len(out)))
    return out

def err_text(e):
    t = str(e)
    if isinstance(e, urllib.error.HTTPError):
        try:
            t += ' ' + e.read()[:200].decode('utf-8', 'replace')
        except Exception:
            pass
    return t.replace('\n', ' ')[:240]

def latest_acs():
    y = datetime.date.today().year
    errs = []
    for year in range(y - 1, y - 5, -1):
        try:
            d = acs(year, list(V))
            if len(d) > 20000:
                return year, d
            errs.append('%d: only %d rows' % (year, len(d)))
        except Exception as e:
            print('ACS %d not available: %s' % (year, e))
            errs.append('%d: %s' % (year, err_text(e)))
    raise RuntimeError('no ACS 5-year data found. ' + ' | '.join(errs))

def zcta_county():
    raw = get(REL, 300).decode('utf-8-sig')
    rd = csv.reader(io.StringIO(raw), delimiter='|')
    head = next(rd)
    iz, ic, ia = head.index('GEOID_ZCTA5_20'), head.index('GEOID_COUNTY_20'), head.index('AREALAND_PART')
    best = {}
    for r in rd:
        z, c = r[iz], r[ic]
        if not z or not c:
            continue
        a = num(r[ia]) or 0
        if z not in best or a > best[z][1]:
            best[z] = (c, a)
    print('ZCTA -> county: %d ZCTAs' % len(best))
    return {z: v[0] for z, v in best.items()}

def pep():
    y = datetime.date.today().year
    for v in range(y, y - 3, -1):
        url = PEP % (v, v)
        try:
            raw = get(url, 300).decode('latin-1')
        except Exception as e:
            print('population estimates not at', url, e)
            continue
        rd = csv.DictReader(io.StringIO(raw))
        out = {}
        for r in rd:
            if r.get('SUMLEV') != '050':
                continue
            f = r['STATE'].zfill(2) + r['COUNTY'].zfill(3)
            p20 = num(r.get('POPESTIMATE2020')) or num(r.get('ESTIMATESBASE2020'))
            pl, pp = num(r.get('POPESTIMATE%d' % v)), num(r.get('POPESTIMATE%d' % (v - 1)))
            dm = sum(num(r.get('DOMESTICMIG%d' % yy)) or 0 for yy in range(2021, v + 1))
            if not p20 or not pl:
                continue
            out[f] = {'name': '%s, %s' % (r.get('CTYNAME', ''), r.get('STNAME', '')), 'pop': int(pl),
                      'popG': r1((pl / p20 - 1) * 100), 'popYoy': r1((pl / pp - 1) * 100) if pp else None, 'mig': r1(dm / p20 * 100)}
        print('Population estimates vintage %d: %d counties' % (v, len(out)))
        return out, v
    return {}, None

def qcew_file(y, q):
    raw = get(QCEW % (y, q), 300).decode('utf-8-sig')
    out = {}
    for r in csv.DictReader(io.StringIO(raw)):
        if r.get('own_code') == '0' and r.get('agglvl_code') == '70':
            emp, chg = num(r.get('month3_emplvl')), num(r.get('oty_month3_emplvl_pct_chg'))
            if emp:
                out[r['area_fips']] = (emp, chg)
    return out

def qcew():
    t = datetime.date.today()
    y, q = t.year, (t.month - 1) // 3 + 1
    for _ in range(8):
        q -= 1
        if q == 0:
            y, q = y - 1, 4
        try:
            now = qcew_file(y, q)
        except Exception as e:
            print('QCEW %dQ%d not available: %s' % (y, q, e))
            continue
        if len(now) < 2500:
            print('QCEW %dQ%d only %d counties, trying earlier' % (y, q, len(now)))
            continue
        try:
            prev = qcew_file(y - 1, q)
        except Exception as e:
            print('QCEW %dQ%d (a year earlier) failed: %s' % (y - 1, q, e))
            prev = {}
        out = {}
        for f, (emp, chg) in now.items():
            c2 = None
            if chg is not None and f in prev and prev[f][1] is not None:
                c2 = ((1 + chg / 100) * (1 + prev[f][1] / 100) - 1) * 100
            out[f] = {'jobs': int(emp), 'jobYoy': r1(chg), 'job2y': r1(c2)}
        print('QCEW %dQ%d: %d counties' % (y, q, len(out)))
        return out, '%dQ%d' % (y, q)
    return {}, None

def optional(name, fn, default):
    try:
        res = fn()
        STATUS[name] = 'ok'
        return res
    except Exception as e:
        print(name, 'skipped:', e)
        STATUS[name] = 'failed: %s' % err_text(e)
        return default

COLS = ['z', 'sfr', 'sfr0', 'yb', 'own65', 'own75', 'ovac', 'inc', 'inc0', 'pop', 'pop0', 'cty']
CCOLS = ['popG', 'popYoy', 'mig', 'pop', 'jobYoy', 'job2y', 'jobs', 'name']

def build(zips=None):
    year, cur = latest_acs()
    STATUS['acs'] = 'ok'
    bad = optional('labels', lambda: check_labels(year), [])
    base_year = year - 5
    base = optional('acsBase', lambda: acs(base_year, BASE_V), {})
    cty = optional('zctaCounty', zcta_county, {})
    pe, vint = optional('popEstimates', pep, ({}, None))
    jb, qtr = optional('qcew', qcew, ({}, None))

    def share(a, b):
        return r1(a / b * 100) if a is not None and b else None

    rows = []
    for z, c in cur.items():
        if zips is not None and z not in zips:
            continue
        b = base.get(z, {})
        det = (c['ownDet'] or 0) + (c['rentDet'] or 0)
        det0 = (b.get('ownDet') or 0) + (b.get('rentDet') or 0)
        o = c['own']
        rows.append([z,
                     share(c['rentDet'], det) if det >= 30 else None,
                     share(b.get('rentDet'), det0) if det0 >= 30 else None,
                     int(c['yb']) if c['yb'] and 1900 < c['yb'] < 2030 else None,
                     share((c['o65'] or 0) + (c['o75'] or 0) + (c['o85'] or 0), o) if o and o >= 30 else None,
                     share((c['o75'] or 0) + (c['o85'] or 0), o) if o and o >= 30 else None,
                     share(c['ovac'], c['units']) if c['units'] and c['units'] >= 30 else None,
                     int(c['inc']) if c['inc'] else None, int(b['inc']) if b.get('inc') else None,
                     int(c['pop']) if c['pop'] is not None else None, int(b['pop']) if b.get('pop') is not None else None,
                     cty.get(z)])
    used = {r[-1] for r in rows if r[-1]}
    counties = {}
    for f in used:
        p, j = pe.get(f, {}), jb.get(f, {})
        if not p and not j:
            continue
        counties[f] = [p.get('popG'), p.get('popYoy'), p.get('mig'), p.get('pop'), j.get('jobYoy'), j.get('job2y'), j.get('jobs'), p.get('name')]
    now = datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat().replace('+00:00', 'Z')
    return {'updated': now, 'acsYear': year, 'baseYear': base_year if base else None, 'popVintage': vint, 'qcew': qtr,
            'labelWarnings': bad, 'status': STATUS, 'cols': COLS, 'rows': rows, 'ccols': CCOLS, 'counties': counties}

def main(out_dir, zips=None):
    os.makedirs(out_dir, exist_ok=True)
    d = build(zips)
    with open(os.path.join(out_dir, 'census.json'), 'w') as f:
        json.dump(d, f, separators=(',', ':'))
    print('census.json: %d ZIPs, %d counties, ACS %s vs %s, population %s, jobs %s, status %s' % (
        len(d['rows']), len(d['counties']), d['acsYear'], d['baseYear'], d['popVintage'], d['qcew'], json.dumps(d['status'])))
    return d

if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'market')
