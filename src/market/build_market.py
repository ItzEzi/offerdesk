#!/usr/bin/env python3
"""OfferDesk market data job.

Downloads Redfin's public Data Center files and writes small JSON files OfferDesk reads:
  index.json      what's available and when Redfin last updated it
  zips-XX.json    every ZIP in state XX: last ~2 years of single-family stats + latest snapshot
  metros.json     every metro: last 26 weeks (Redfin's weekly, 4-week rolling data)
Redfin publishes ZIP data monthly (rolling 3 months) and metro data weekly.
Usage: python build_market.py OUT_DIR   (set MARKET_LOCAL_DIR to read local copies instead of downloading)
"""
import csv, io, json, os, re, sys, gzip, datetime, urllib.request

S3 = 'https://redfin-public-data.s3.us-west-2.amazonaws.com/redfin_data_center/'
OUT = sys.argv[1] if len(sys.argv) > 1 else 'market'
LOCAL = os.environ.get('MARKET_LOCAL_DIR')
MONTHS = int(os.environ.get('MARKET_MONTHS', '25'))
WEEKS = int(os.environ.get('MARKET_WEEKS', '26'))
PTYPE = os.environ.get('MARKET_PROPERTY_TYPE', 'Single Family Residential')
ZIP_FILE = os.environ.get('MARKET_ZIP_FILE', 'property_types/monthly/all_zips.csv')
DROPS_FILE = os.environ.get('MARKET_DROPS_FILE', 'price_drops/monthly/all_zips.csv')
METRO_FILE = os.environ.get('MARKET_METRO_FILE', 'housing_market/weekly/all_metros.csv')
csv.field_size_limit(10 ** 7)

# first three digits of a ZIP -> state (USPS prefixes)
ZIP3 = [(5, 5, 'NY'), (6, 9, 'PR'), (10, 27, 'MA'), (28, 29, 'RI'), (30, 38, 'NH'), (39, 49, 'ME'), (50, 54, 'VT'), (55, 55, 'MA'), (56, 59, 'VT'),
        (60, 69, 'CT'), (70, 89, 'NJ'), (100, 149, 'NY'), (150, 196, 'PA'), (197, 199, 'DE'), (200, 200, 'DC'), (201, 201, 'VA'), (202, 205, 'DC'),
        (206, 219, 'MD'), (220, 246, 'VA'), (247, 268, 'WV'), (270, 289, 'NC'), (290, 299, 'SC'), (300, 319, 'GA'), (320, 349, 'FL'), (350, 369, 'AL'),
        (370, 385, 'TN'), (386, 397, 'MS'), (398, 399, 'GA'), (400, 427, 'KY'), (430, 458, 'OH'), (460, 479, 'IN'), (480, 499, 'MI'), (500, 528, 'IA'),
        (530, 549, 'WI'), (550, 567, 'MN'), (569, 569, 'DC'), (570, 577, 'SD'), (580, 588, 'ND'), (590, 599, 'MT'), (600, 629, 'IL'), (630, 658, 'MO'),
        (660, 679, 'KS'), (680, 693, 'NE'), (700, 714, 'LA'), (716, 729, 'AR'), (730, 732, 'OK'), (733, 733, 'TX'), (734, 749, 'OK'), (750, 799, 'TX'),
        (800, 816, 'CO'), (820, 831, 'WY'), (832, 838, 'ID'), (840, 847, 'UT'), (850, 865, 'AZ'), (870, 884, 'NM'), (885, 885, 'TX'), (889, 898, 'NV'),
        (900, 961, 'CA'), (967, 968, 'HI'), (970, 979, 'OR'), (980, 994, 'WA'), (995, 999, 'AK')]

def zip_state(z):
    try:
        p = int(str(z)[:3])
    except ValueError:
        return None
    for a, b, s in ZIP3:
        if a <= p <= b:
            return s
    return None

def fetch(url, timeout=600):
    """Raw bytes stream for a full URL (or a local copy named after the file when MARKET_LOCAL_DIR is set)."""
    if LOCAL:
        return open(os.path.join(LOCAL, url.split('?')[0].rsplit('/', 1)[-1]), 'rb')
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (OfferDesk market job; github.com/ItzEzi/offerdesk)'})
    return urllib.request.urlopen(req, timeout=timeout)

def rows(path):
    if LOCAL:
        f = open(os.path.join(LOCAL, path.replace('/', '__')), 'rb')
        raw = gzip.GzipFile(fileobj=f) if path.endswith('.gz') else f
    else:
        req = urllib.request.Request(S3 + path, headers={'User-Agent': 'OfferDesk market job (github.com/ItzEzi/offerdesk)', 'Accept-Encoding': 'gzip'})
        r = urllib.request.urlopen(req, timeout=1800)
        raw = gzip.GzipFile(fileobj=r) if (r.headers.get('Content-Encoding') == 'gzip' or path.endswith('.gz')) else r
    rd = csv.reader(io.TextIOWrapper(raw, encoding='utf-8-sig', newline=''))
    head = [h.strip().upper() for h in next(rd)]
    print(path, 'columns:', len(head))
    return head, rd

def num(v):
    if v is None:
        return None
    v = v.strip()
    if v in ('', 'NA', 'NAN', 'NaN', 'null', 'None'):
        return None
    try:
        x = float(v)
    except ValueError:
        return None
    return x if x == x else None

def rnd(x, d=0):
    if x is None:
        return None
    return int(round(x)) if d == 0 else round(x, d)

def pick(head, *names):
    for n in names:
        if n in head:
            return head.index(n)
    return None

def month(s):
    return (s or '')[:7]

def cutoff_month(n):
    t = datetime.date.today().replace(day=1)
    y, m = t.year, t.month - n - 2
    while m <= 0:
        m += 12
        y -= 1
    return '%04d-%02d' % (y, m)

def build_zips():
    head, rd = rows(ZIP_FILE)
    I = {k: pick(head, *v) for k, v in {
        'upd': ['LAST UPDATED'], 'end': ['PERIOD END'], 'zip': ['REGION NAME'], 'ptype': ['PROPERTY TYPE'], 'metro': ['METRO'],
        'sold': ['HOMES SOLD'], 'price': ['MEDIAN SALE PRICE NSA ($)', 'MEDIAN SALE PRICE ($)'], 'priceYoy': ['MEDIAN SALE PRICE NSA YOY (%)', 'MEDIAN SALE PRICE YOY (%)'],
        'dom': ['MEDIAN DAYS ON MARKET (DAYS)'], 'stl': ['AVERAGE SALE TO LIST RATIO (%)'], 'above': ['SHARE SOLD ABOVE ORIGINAL LIST (%)'],
        'newl': ['NEW LISTINGS'], 'active': ['ACTIVE LISTINGS'], 'inv': ['INVENTORY'], 'pend': ['PENDING SALES'],
        'listp': ['MEDIAN NEW LISTING PRICE ($)'], 'listppsf': ['MEDIAN NEW LISTING PRICE PER SQ.FT. ($)'],
        'ppsf': ['MEDIAN SALE PRICE PER SQ.FT. ($)'], 'ppsfYoy': ['MEDIAN SALE PRICE PER SQ.FT. YOY (%)'],
        'mos': ['MONTHS OF SUPPLY'], 'off2w': ['PERCENT OFF MARKET IN TWO WEEKS (%)']}.items()}
    assert I['zip'] is not None and I['end'] is not None, 'unexpected ZIP file columns: %s' % head[:12]
    cut = cutoff_month(MONTHS)
    data, metro, upd = {}, {}, ''
    seen_recent, old_run, n = False, 0, 0
    fields = [k for k in I if k not in ('upd', 'end', 'zip', 'ptype', 'metro')]
    for r in rd:
        n += 1
        if len(r) <= I['end']:
            continue
        m = month(r[I['end']])
        # Redfin sorts this file newest period first, so a long run of old rows means we're done
        if m < cut:
            old_run += 1
            if seen_recent and old_run > 250000:
                print('stopping early: the rest of the file is older than', cut)
                break
            continue
        seen_recent, old_run = True, 0
        if I['ptype'] is not None and r[I['ptype']] != PTYPE:
            continue
        z = (r[I['zip']] or '').strip()
        z = re.sub(r'\D', '', z)[:5].zfill(5) if z else ''
        if len(z) != 5:
            continue
        rec = {k: num(r[I[k]]) for k in fields if I[k] is not None}
        data.setdefault(z, {})[m] = rec
        if I['metro'] is not None and r[I['metro']] and r[I['metro']] != 'NA':
            metro[z] = r[I['metro']]
        if I['upd'] is not None and r[I['upd']] > upd:
            upd = r[I['upd']]
    print('ZIP rows read:', n, 'ZIPs kept:', len(data))
    return data, metro, upd

def build_drops():
    try:
        head, rd = rows(DROPS_FILE)
    except Exception as e:
        print('price drops skipped:', e)
        return {}
    iz, ie = pick(head, 'REGION NAME'), pick(head, 'PERIOD END')
    ip, isz = pick(head, 'PERCENT ACTIVE WITH PRICE DROPS (%)'), pick(head, 'AVERAGE SIZE OF PRICE DROP (%)')
    best, top, old_run = {}, '', 0
    for r in rd:
        if len(r) <= max(iz, ie):
            continue
        z = re.sub(r'\D', '', r[iz] or '')[:5].zfill(5)
        m = month(r[ie])
        top = max(top, m)
        old_run = old_run + 1 if m < top else 0
        if old_run > 150000:   # newest period first: every ZIP's latest row is already in
            break
        if len(z) == 5 and (z not in best or m > best[z][0]):
            best[z] = (m, num(r[ip]) if ip is not None else None, num(r[isz]) if isz is not None else None)
    return {z: {'pdPct': rnd(v[1], 1), 'pdSize': rnd(v[2], 1)} for z, v in best.items()}

def build_metros():
    head, rd = rows(METRO_FILE)
    I = {k: pick(head, *v) for k, v in {
        'end': ['PERIOD END'], 'name': ['REGION NAME'], 'price': ['MEDIAN SALE PRICE NSA ($)', 'MEDIAN SALE PRICE ($)'], 'priceYoy': ['MEDIAN SALE PRICE NSA YOY (%)'],
        'dom': ['MEDIAN DAYS ON MARKET NSA (DAYS)', 'MEDIAN DAYS ON MARKET (DAYS)'], 'stl': ['AVERAGE SALE TO LIST RATIO NSA (%)'], 'mos': ['MONTHS OF SUPPLY NSA'],
        'ppsf': ['MEDIAN SALE PRICE PER SQ.FT. NSA ($)'], 'newl': ['NEW LISTINGS NSA'], 'newYoy': ['NEW LISTINGS NSA YOY (%)'],
        'active': ['ACTIVE LISTINGS NSA'], 'activeYoy': ['ACTIVE LISTINGS NSA YOY (%)'], 'pend': ['PENDING SALES NSA'], 'pendYoy': ['PENDING SALES NSA YOY (%)']}.items()}
    per = {}
    for r in rd:
        nm = r[I['name']]
        per.setdefault(nm, {})[r[I['end']]] = {k: num(r[I[k]]) for k in I if k not in ('end', 'name') and I[k] is not None}
    out, last = {}, ''
    for nm, by in per.items():
        ends = sorted(by)[-WEEKS:]
        if not ends:
            continue
        L = by[ends[-1]]
        last = max(last, ends[-1])
        out[nm] = {'periodEnd': ends[-1], 'w': ends,
                   'l': {'price': rnd(L.get('price')), 'priceYoy': rnd(L.get('priceYoy'), 1), 'dom': rnd(L.get('dom')), 'stl': rnd(L.get('stl'), 1), 'mos': rnd(L.get('mos'), 1),
                         'ppsf': rnd(L.get('ppsf')), 'newYoy': rnd(L.get('newYoy'), 1), 'activeYoy': rnd(L.get('activeYoy'), 1), 'pendYoy': rnd(L.get('pendYoy'), 1)},
                   's': {k: [rnd(by[e].get(k)) for e in ends] for k in ('price', 'dom', 'pend', 'newl', 'active')}}
    return out, last

ZORI_URL = 'https://files.zillowstatic.com/research/public_csvs/zori/Zip_zori_uc_sfrcondomfr_sm_month.csv'
SAFMR_URLS = ['https://www.huduser.gov/portal/datasets/fmr/fmr%d/fy%d_safmrs.xlsx', 'https://www.huduser.gov/portal/datasets/fmr/fmr%d/fy%d_safmrs_revised.xlsx']
GEO_URL = 'https://download.geonames.org/export/zip/US.zip'
SOURCES = {}

def latest_zip(path, cols):
    """Latest row per ZIP from a Redfin ZIP file sorted newest period first. cols: {key: [header names]}."""
    head, rd = rows(path)
    iz, ie = pick(head, 'REGION NAME'), pick(head, 'PERIOD END')
    I = {k: pick(head, *v) for k, v in cols.items()}
    best, top, old = {}, '', 0
    for r in rd:
        if len(r) <= max(iz, ie):
            continue
        m = month(r[ie]); top = max(top, m)
        old = old + 1 if m < top else 0
        if old > 150000:
            break
        z = re.sub(r'\D', '', r[iz] or '')[:5].zfill(5)
        if len(z) == 5 and (z not in best or m > best[z][0]):
            best[z] = (m, {k: num(r[i]) for k, i in I.items() if i is not None})
    return {z: v[1] for z, v in best.items()}, top

def zori():
    """Zillow Observed Rent Index by ZIP: latest typical rent and its change over 12 months."""
    raw = fetch(ZORI_URL)
    rd = csv.reader(io.TextIOWrapper(raw, encoding='utf-8-sig', newline=''))
    head = next(rd)
    iz = head.index('RegionName'); dates = [i for i, h in enumerate(head) if re.match(r'\d{4}-\d{2}-\d{2}$', h)]
    out, last = {}, ''
    for r in rd:
        vals = [(head[i], num(r[i])) for i in dates if i < len(r) and num(r[i]) is not None]
        if not vals:
            continue
        d, v = vals[-1]
        prev = [x for dd, x in vals if dd[:7] <= '%04d-%s' % (int(d[:4]) - 1, d[5:7])]
        out[r[iz].zfill(5)] = (rnd(v), rnd((v / prev[-1] - 1) * 100, 1) if prev and prev[-1] else None)
        last = max(last, d[:7])
    return out, last

def safmr():
    """HUD Small Area Fair Market Rents (3-bedroom) by ZIP; tries this fiscal year and next."""
    import openpyxl
    y = datetime.date.today().year
    for fy in (y + 1, y):
        for tpl in SAFMR_URLS:
            url = tpl % (fy, fy)
            try:
                data = fetch(url, 300).read()
            except Exception as e:
                print('SAFMR not at', url, e)
                continue
            wb = openpyxl.load_workbook(io.BytesIO(data), read_only=True, data_only=True)
            ws = wb.worksheets[0]
            it = ws.iter_rows(values_only=True)
            head = None
            for row in it:
                cells = [re.sub(r'\s+', ' ', str(c or '')).strip().upper() for c in row]
                if any(c.startswith('ZIP') for c in cells):
                    head = cells; break
            if not head:
                continue
            iz = next(i for i, c in enumerate(head) if c.startswith('ZIP'))
            i3 = next((i for i, c in enumerate(head) if '3BR' in c and 'PAYMENT' not in c and '%' not in c), None)
            if i3 is None:
                continue
            out = {}
            for row in it:
                z = re.sub(r'\D', '', str(row[iz] or ''))[:5].zfill(5)
                v = num(str(row[i3])) if row[i3] is not None else None
                if len(z) == 5 and v:
                    out[z] = rnd(v)
            print('SAFMR FY%d: %d ZIPs from %s' % (fy, len(out), url))
            return out, 'FY%d' % fy
    return {}, None

def geonames():
    """GeoNames postal codes: ZIP -> city, state, county, lat, lng (CC-BY 4.0)."""
    import zipfile
    data = fetch(GEO_URL, 300).read()
    out = {}
    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        for line in io.TextIOWrapper(zf.open('US.txt'), encoding='utf-8'):
            p = line.rstrip('\n').split('\t')
            if len(p) < 11:
                continue
            try:
                out[p[1].zfill(5)] = (p[2], p[4], p[5], round(float(p[9]), 3), round(float(p[10]), 3))
            except ValueError:
                pass
    return out

def investors():
    """Redfin investor purchases by metro, latest quarter."""
    head, rd = rows('investors/by_metro/all_metros.csv')
    ie, inm = pick(head, 'PERIOD END'), pick(head, 'REGION NAME')
    ip, iy, ish = pick(head, 'INVESTOR HOME PURCHASES'), pick(head, 'INVESTOR HOME PURCHASES YOY (%)'), pick(head, 'INVESTOR MARKET SHARE (%)')
    best = {}
    for r in rd:
        nm = re.sub(r'\s+metro area$', '', r[inm] or '').strip()
        if nm and (nm not in best or r[ie] > best[nm][0]):
            best[nm] = (r[ie], rnd(num(r[ish]), 1), rnd(num(r[iy]), 1), rnd(num(r[ip])))
    return {k: {'share': v[1], 'yoy': v[2], 'buys': v[3], 'q': v[0][:7]} for k, v in best.items()}

def optional(name, fn, default):
    try:
        res = fn()
        SOURCES[name] = 'ok'
        return res
    except Exception as e:
        print(name, 'skipped:', e)
        SOURCES[name] = 'failed: %s' % str(e)[:120]
        return default

DCOLS = ['z', 'st', 'city', 'county', 'lat', 'lng', 'mi', 'price', 'ppsf', 'dom', 'mos', 'sold', 'active', 'priceYoy', 'ppsfYoy',
         'stl', 'off2w', 'pdPct', 'cancel', 'delist', 'relist', 'zori', 'zoriYoy', 'fmr3', 'above', 'ppsf2y', 'newl', 'end']

def build_discover(data, metro, latest, now, period_end):
    """One national table (every ZIP, single-family) for the Markets page."""
    geo = optional('geonames', geonames, {})
    zr, zori_end = optional('zori', zori, ({}, None))
    fm, fmr_year = optional('safmr', safmr, ({}, None))
    canc, _ = optional('cancellations', lambda: latest_zip('contract_cancellations/monthly/all_zips.csv', {'cancel': ['PERCENT OF PENDING SALES (%)']}), ({}, ''))
    dl, _ = optional('delistings', lambda: latest_zip('delistings_relistings/monthly/all_zips.csv', {'delist': ['SHARE OF LISTINGS DELISTED (%)'], 'relist': ['SHARE OF LISTINGS RELISTED (%)']}), ({}, ''))
    inv = optional('investors', investors, {})
    mlist, mix, out = [], {}, []
    for z, L in latest.items():
        g = geo.get(z)
        st = (g[1] if g and g[1] else None) or zip_state(z)
        if not st:
            continue
        mname = metro.get(z) or ''
        if mname not in mix:
            mix[mname] = len(mlist); mlist.append(mname)
        rz = zr.get(z, (None, None))
        c, d = canc.get(z, {}), dl.get(z, {})
        out.append([z, st, g[0] if g else '', g[2] if g else '', g[3] if g else None, g[4] if g else None, mix[mname],
                    L['price'], L['ppsf'], L['dom'], L['mos'], L['sold'], L['active'], L['priceYoy'], L['ppsfYoy'],
                    L['stl'], L['off2w'], L.get('pdPct'), rnd(c.get('cancel'), 1), rnd(d.get('delist'), 1), rnd(d.get('relist'), 1),
                    rz[0], rz[1], fm.get(z), L.get('above'), L.get('ppsf2y'), L.get('newl'), L['end']])
    minv = {}
    for nm in mlist:
        k = re.sub(r'\s+metro area$', '', nm)
        if k in inv:
            minv[nm] = inv[k]
    return {'updated': now, 'periodEnd': period_end, 'propertyType': PTYPE, 'cols': DCOLS, 'rows': out, 'metros': mlist, 'investors': minv,
            'sources': {'redfin': period_end, 'zori': zori_end, 'safmr': fmr_year, 'geonames': bool(geo), 'cancellations': bool(canc), 'delistings': bool(dl),
                        'investors': max([v['q'] for v in inv.values()], default=None), 'status': SOURCES}}

def main():
    os.makedirs(OUT, exist_ok=True)
    data, metro, upd = build_zips()
    drops = build_drops()
    all_months = sorted({m for z in data.values() for m in z})[-MONTHS:]
    by_state, latest_all = {}, {}
    for z, per in data.items():
        st = zip_state(z)
        if not st:
            continue
        ms = [m for m in all_months if m in per]
        if not ms:
            continue
        L = per[ms[-1]]
        latest = {'end': ms[-1], 'price': rnd(L.get('price')), 'priceYoy': rnd(L.get('priceYoy'), 1), 'ppsf': rnd(L.get('ppsf')), 'ppsfYoy': rnd(L.get('ppsfYoy'), 1),
                  'dom': rnd(L.get('dom')), 'stl': rnd(L.get('stl'), 1), 'above': rnd(L.get('above'), 1), 'sold': rnd(L.get('sold')), 'newl': rnd(L.get('newl')),
                  'active': rnd(L.get('active')), 'inv': rnd(L.get('inv')), 'pend': rnd(L.get('pend')), 'listp': rnd(L.get('listp')), 'listppsf': rnd(L.get('listppsf')),
                  'mos': rnd(L.get('mos'), 1), 'off2w': rnd(L.get('off2w'), 1)}
        # $/sqft change over ~2 years (same month two years back, else the oldest month we kept)
        old = [m for m in ms if m <= '%04d-%s' % (int(ms[-1][:4]) - 2, ms[-1][5:7])] or ms[:1]
        p0, p1 = (per[old[-1]].get('ppsf') if old and old[-1] != ms[-1] else None), L.get('ppsf')
        latest['ppsf2y'] = rnd((p1 / p0 - 1) * 100, 1) if p0 and p1 and old[-1] <= '%04d-%s' % (int(ms[-1][:4]) - 1, ms[-1][5:7]) else None
        latest.update(drops.get(z, {}))
        latest_all[z] = latest
        series = {k: [rnd(per[m].get(k), 1 if k == 'mos' else 0) if m in per else None for m in all_months] for k in ('price', 'ppsf', 'dom', 'mos', 'sold')}
        by_state.setdefault(st, {})[z] = {'metro': metro.get(z, ''), 'l': latest, 's': series}
    period_end = all_months[-1] if all_months else ''
    now = datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    files = {}
    for st, zs in sorted(by_state.items()):
        name = 'zips-%s.json' % st
        with open(os.path.join(OUT, name), 'w') as f:
            json.dump({'state': st, 'updated': now, 'redfinUpdated': upd, 'periodEnd': period_end, 'propertyType': PTYPE, 'months': all_months, 'zips': zs}, f, separators=(',', ':'))
        files[st] = {'zips': name, 'metros': 'metros.json', 'count': len(zs)}
    try:
        metros, wk = build_metros()
        with open(os.path.join(OUT, 'metros.json'), 'w') as f:
            json.dump({'updated': now, 'periodEnd': wk, 'metros': metros}, f, separators=(',', ':'))
    except Exception as e:
        print('metro weekly data skipped:', e)
        wk = ''
        for v in files.values():
            v.pop('metros', None)
    disc = build_discover(data, metro, latest_all, now, period_end)
    with open(os.path.join(OUT, 'discover.json'), 'w') as f:
        json.dump(disc, f, separators=(',', ':'))
    print('discover.json:', len(disc['rows']), 'ZIPs, sources:', json.dumps(disc['sources']))
    # who already owns the houses, housing age, owners' age, population and jobs (Census + BLS): the competition lens
    census = None
    try:
        import build_census
        c = build_census.main(OUT, zips=set(latest_all))
        census = {'file': 'census.json', 'rows': len(c['rows']), 'counties': len(c['counties']), 'acsYear': c['acsYear'], 'baseYear': c['baseYear'],
                  'popVintage': c['popVintage'], 'qcew': c['qcew'], 'status': c['status']}
    except Exception as e:
        print('census data skipped:', e)
        census = {'failed': str(e)[:900]}
    with open(os.path.join(OUT, 'index.json'), 'w') as f:
        json.dump({'updated': now, 'redfinUpdated': upd, 'periodEnd': period_end, 'metroWeekEnd': wk, 'propertyType': PTYPE, 'source': 'Redfin Data Center',
                   'zipCount': sum(v['count'] for v in files.values()), 'files': files,
                   'discover': {'file': 'discover.json', 'rows': len(disc['rows']), 'sources': disc['sources']}, 'census': census}, f, separators=(',', ':'))
    print('states:', len(files), 'zips:', sum(v['count'] for v in files.values()), 'period end:', period_end, 'redfin updated:', upd, 'metro week end:', wk)

if __name__ == '__main__':
    main()
