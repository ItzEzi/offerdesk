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

def main():
    os.makedirs(OUT, exist_ok=True)
    data, metro, upd = build_zips()
    drops = build_drops()
    all_months = sorted({m for z in data.values() for m in z})[-MONTHS:]
    by_state = {}
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
        latest.update(drops.get(z, {}))
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
    with open(os.path.join(OUT, 'index.json'), 'w') as f:
        json.dump({'updated': now, 'redfinUpdated': upd, 'periodEnd': period_end, 'metroWeekEnd': wk, 'propertyType': PTYPE, 'source': 'Redfin Data Center',
                   'zipCount': sum(v['count'] for v in files.values()), 'files': files}, f, separators=(',', ':'))
    print('states:', len(files), 'zips:', sum(v['count'] for v in files.values()), 'period end:', period_end, 'redfin updated:', upd, 'metro week end:', wk)

if __name__ == '__main__':
    main()
