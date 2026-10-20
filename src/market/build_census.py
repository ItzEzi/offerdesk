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
    own1/rent1   the raw counts behind sfr (owner- and renter-occupied single-family detached homes, table B25032)
    cty          county FIPS (largest land overlap, Census ZCTA-county relationship file)
  per county:
    Census population estimates: growth since 2020, net domestic migration since 2020, last-year growth
    BLS QCEW: total jobs, change over 1 and 2 years
Usage: python build_census.py OUT_DIR
"""
import csv, io, json, os, re, sys, datetime, urllib.request, urllib.error

UA = {'User-Agent': 'Mozilla/5.0 (OfferDesk market job; github.com/ItzEzi/offerdesk)'}
ACS = 'https://api.census.gov/data/%d/acs/acs5'
REL = 'https://www2.census.gov/geo/docs/maps-data/data/rel2020/zcta520/tab20_zcta520_county20_natl.txt'
PEP = 'https://www2.census.gov/programs-surveys/popest/datasets/2020-%d/counties/totals/co-est%d-alldata.csv'
QCEW = 'https://data.bls.gov/cew/data/api/%d/%d/industry/10.csv'
STATUS = {}
LABELS = {}

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

SF = 'https://www2.census.gov/programs-surveys/acs/summary_file/%d/'
KEY = os.environ.get('CENSUS_KEY', '').strip()   # optional: with a key the job uses the Census API instead of the bulk files

def code_tb(code):
    """B25032_014E -> (B25032, B25032_E014): the column name in the bulk (table-based) summary file."""
    t, n = code[:-1].split('_')
    return t, '%s_E%s' % (t, n)

def links(url):
    html = get(url, 120).decode('utf-8', 'replace')
    return re.findall(r'href="([^"?#]+)"', html)

def find_dir(year):
    """Folder holding one .dat file per table for the 5-year release (table-based format, 2018+)."""
    tried = []
    for sub in ('table-based-SF/data/5YRData/', 'table-based-SF/data/5YRData', 'prototype/'):
        url = SF % year + sub
        try:
            L = links(url)
        except Exception as e:
            tried.append('%s: %s' % (sub, err_text(e)[:60]))
            continue
        dats = [h for h in L if h.lower().endswith('.dat')]
        if dats:
            return url if url.endswith('/') else url + '/', dats
        # the prototype folders (2018-2020) nest the 5-year files a level or two down
        for h in L:
            hl = h.lower().rstrip('/')
            if h.endswith('/') and ('5yr' in hl or '5-year' in hl or '5_year' in hl or hl.endswith('data')) and not h.startswith('/') and '..' not in h:
                u2 = url + h
                try:
                    L2 = links(u2)
                except Exception:
                    continue
                d2 = [x for x in L2 if x.lower().endswith('.dat')]
                if d2:
                    return u2, d2
                for h3 in L2:
                    if h3.endswith('/') and '5' in h3 and not h3.startswith('/') and '..' not in h3:
                        try:
                            d3 = [x for x in links(u2 + h3) if x.lower().endswith('.dat')]
                        except Exception:
                            continue
                        if d3:
                            return u2 + h3, d3
        tried.append(sub + ': no .dat files')
    raise RuntimeError('ACS %d bulk files not found (%s)' % (year, '; '.join(tried)))

def bulk(year, keys):
    folder, dats = find_dir(year)
    by_t = {}
    for k in keys:
        t, col = code_tb(V[k][0])
        by_t.setdefault(t, []).append((k, col))
    out = {}
    for t, cols in by_t.items():
        name = next((d for d in dats if re.search(r'[-_]%s\.dat$' % t.lower(), d.lower())), None)
        if not name:
            raise RuntimeError('ACS %d: no file for table %s in %s' % (year, t, folder))
        url = name if name.startswith('http') else (folder + name.rsplit('/', 1)[-1])
        req = urllib.request.Request(url, headers=UA)
        r = urllib.request.urlopen(req, timeout=1800)
        rd = io.TextIOWrapper(r, encoding='utf-8-sig', errors='replace', newline='')
        head = rd.readline().rstrip('\r\n').split('|')
        hu = [h.strip().upper() for h in head]
        ig = hu.index('GEO_ID')
        idx = []
        for k, col in cols:
            if col.upper() not in hu:
                raise RuntimeError('ACS %d %s: column %s missing' % (year, t, col))
            idx.append((k, hu.index(col.upper())))
        n = 0
        for line in rd:
            if not (line.startswith('860') if ig == 0 else '|860' in line[:80]):   # ZCTA rows (summary level 860)
                continue
            p = line.rstrip('\r\n').split('|')
            geo = p[ig]
            z = geo[-5:]
            if not z.isdigit():
                continue
            rec = out.setdefault(z, {})
            for k, i in idx:
                rec[k] = num(p[i]) if i < len(p) else None
            n += 1
        r.close()
        print('ACS %d %s: %d ZCTAs from %s' % (year, t, n, url))
    for rec in out.values():
        for k in keys:
            rec.setdefault(k, None)
    return out

def check_labels(year):
    """Check the line numbers against the Census table shells (labels) for that year."""
    bad, labs = [], {}
    try:
        folder = SF % year + 'table-based-SF/documentation/'
        shell = next(h for h in links(folder) if 'table_shells' in h.lower() and '5yr' in h.lower())
        raw = get(folder + shell.rsplit('/', 1)[-1], 300).decode('utf-8', 'replace')
        for line in raw.splitlines():
            p = line.split('\t') if '\t' in line else line.split('|')
            if len(p) >= 4:
                for i, c in enumerate(p):
                    c = c.strip()
                    if re.match(r'^[BC]\d{5}_\d{3}$', c):
                        labs[c] = (p[i + 1] if i + 1 < len(p) else '').strip()   # the label follows the unique ID
                        break
    except Exception as e:
        print('label check skipped:', err_text(e))
        return []
    for k, (code, words) in V.items():
        lab = labs.get(code[:-1], '')
        LABELS[code] = lab
        low = lab.lower()
        ok = bool(lab) and all(w.split(',')[0].strip() in low or w in low for w in words[-1:])
        print('ACS %d %s %s: %s%s' % (year, code, k, lab, '' if ok else '   <-- CHECK'))
        if not ok:
            bad.append('%s=%s' % (code, lab[:40]))
    return bad

def acs(year, keys):
    if not KEY:
        return bulk(year, keys)
    codes = [V[k][0] for k in keys]
    url = '%s?get=%s&for=zip%%20code%%20tabulation%%20area:*&key=%s' % (ACS % year, ','.join(codes), KEY)
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

def base_acs(year):
    """The same numbers about 5 years earlier (falls back to the oldest table-based year we can find)."""
    errs = []
    for b in range(year - 5, year - 2):
        try:
            d = acs(b, BASE_V)
            if len(d) > 20000:
                return b, d
            errs.append('%d: only %d rows' % (b, len(d)))
        except Exception as e:
            errs.append('%d: %s' % (b, err_text(e)[:120]))
    raise RuntimeError(' | '.join(errs))

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
    raise RuntimeError('no county population estimates file found')

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
    errs = []
    for _ in range(8):
        q -= 1
        if q == 0:
            y, q = y - 1, 4
        try:
            now = qcew_file(y, q)
        except Exception as e:
            print('QCEW %dQ%d not available: %s' % (y, q, e))
            errs.append('%dQ%d: %s' % (y, q, err_text(e)[:100]))
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
    raise RuntimeError('no QCEW county file found: ' + ' | '.join(errs[-3:]))

def optional(name, fn, default):
    try:
        res = fn()
        STATUS[name] = 'ok'
        return res
    except Exception as e:
        print(name, 'skipped:', e)
        STATUS[name] = 'failed: %s' % err_text(e)
        return default

COLS = ['z', 'sfr', 'sfr0', 'yb', 'own65', 'own75', 'ovac', 'inc', 'inc0', 'pop', 'pop0', 'cty', 'own1', 'rent1']
CCOLS = ['popG', 'popYoy', 'mig', 'pop', 'jobYoy', 'job2y', 'jobs', 'name']

def build(zips=None):
    year, cur = latest_acs()
    STATUS['acs'] = 'ok'
    bad = optional('labels', lambda: check_labels(year), [])
    base_year, base = optional('acsBase', lambda: base_acs(year), (None, {}))
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
                     cty.get(z),
                     int(c['ownDet']) if c['ownDet'] is not None else None, int(c['rentDet']) if c['rentDet'] is not None else None])
    used = {r[-1] for r in rows if r[-1]}
    counties = {}
    for f in used:
        p, j = pe.get(f, {}), jb.get(f, {})
        if not p and not j:
            continue
        counties[f] = [p.get('popG'), p.get('popYoy'), p.get('mig'), p.get('pop'), j.get('jobYoy'), j.get('job2y'), j.get('jobs'), p.get('name')]
    now = datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat().replace('+00:00', 'Z')
    return {'updated': now, 'acsYear': year, 'baseYear': base_year if base else None, 'popVintage': vint, 'qcew': qtr,
            'labelWarnings': bad, 'labels': LABELS, 'status': STATUS, 'cols': COLS, 'rows': rows, 'ccols': CCOLS, 'counties': counties}

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
