#!/usr/bin/env python3
"""Research-only data jobs (not used by the app). Each job pulls public data, summarizes it,
and writes JSON into OUT/<job>/. Run by .github/workflows/research-data.yml.
Usage: python research/run.py <job> OUT_DIR
Jobs: probe, wprdc, philly, fhfa, oews, indiana
"""
import csv, io, json, os, sys, datetime, statistics, urllib.request, urllib.parse, zipfile, collections, traceback

UA = {'User-Agent': 'Mozilla/5.0 (OfferDesk research job; github.com/ItzEzi/offerdesk)'}
LOG = []

def log(*a):
    s = ' '.join(str(x) for x in a)
    print(s, flush=True)
    LOG.append(s)

def get(url, timeout=600):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout)

def get_json(url):
    with get(url) as r:
        return json.loads(r.read().decode('utf-8'))

def num(v):
    try:
        x = float(str(v).replace(',', '').replace('$', '').strip())
    except (TypeError, ValueError):
        return None
    return None if x != x else x

def pdate(s):
    s = (s or '').strip()[:10]
    for f in ('%Y-%m-%d', '%m/%d/%Y', '%m-%d-%Y'):
        try:
            return datetime.datetime.strptime(s, f).date()
        except ValueError:
            pass
    return None

def med(v):
    v = [x for x in v if x is not None]
    return statistics.median(v) if v else None

def flips_from_sales(sales, group_key, min_price=10000, max_days=548, min_gain=0.0, since=None):
    """sales: list of dicts with parcel, date, price, group. A flip = the same parcel sold again within max_days,
    second price above first by more than min_gain, first sale >= min_price. Counts flips by the RESALE's date (since)."""
    byp = collections.defaultdict(list)
    for s in sales:
        byp[s['parcel']].append(s)
    groups = collections.defaultdict(lambda: {'sales': 0, 'flips': 0, 'buy': [], 'sell': [], 'days': [], 'margin': [], 'gain': []})
    for s in sales:
        if since and s['date'] < since:
            continue
        if not s.get('market', True):
            continue
        groups[s[group_key]]['sales'] += 1
    for p, ss in byp.items():
        ss.sort(key=lambda s: s['date'])
        for a, b in zip(ss, ss[1:]):
            if since and b['date'] < since:
                continue
            if not b.get('market', True):
                continue
            d = (b['date'] - a['date']).days
            if d < 30 or d > max_days or a['price'] < min_price:
                continue
            m = b['price'] / a['price'] - 1
            if m <= min_gain:
                continue
            g = groups[b[group_key]]
            g['flips'] += 1; g['buy'].append(a['price']); g['sell'].append(b['price']); g['days'].append(d); g['margin'].append(m); g['gain'].append(b['price'] - a['price'])
    out = {}
    for k, g in groups.items():
        out[k] = {'sales': g['sales'], 'flips': g['flips'], 'flipRate': round(100 * g['flips'] / g['sales'], 1) if g['sales'] else None,
                  'medBuy': med(g['buy']), 'medSell': med(g['sell']), 'medDays': med(g['days']),
                  'medMargin': round(100 * med(g['margin']), 1) if g['margin'] else None, 'medGain': med(g['gain'])}
    return out

# ---------------- jobs ----------------

def job_probe(out):
    """Find dataset ids and column names for the other jobs."""
    res = {}
    for q in ('property sale transactions', 'property assessments'):
        try:
            j = get_json('https://data.wprdc.org/api/3/action/package_search?' + urllib.parse.urlencode({'q': q, 'rows': 5}))
            res['wprdc:' + q] = [{'name': p['name'], 'title': p['title'], 'resources': [{'id': r['id'], 'name': r.get('name'), 'format': r.get('format'), 'url': r.get('url'), 'datastore': r.get('datastore_active')} for r in p['resources']]} for p in j['result']['results']]
        except Exception as e:
            res['wprdc:' + q] = 'error: %s' % e
    try:
        j = get_json('https://phl.carto.com/api/v2/sql?' + urllib.parse.urlencode({'q': 'select * from rtt_summary limit 2'}))
        res['philly:rtt_summary'] = {'fields': list(j.get('fields', {}).keys()), 'sample': j.get('rows')}
    except Exception as e:
        res['philly:rtt_summary'] = 'error: %s' % e
    json.dump(res, open(os.path.join(out, 'probe.json'), 'w'), indent=1, default=str)

def wprdc_resource(name_hint, pkg):
    j = get_json('https://data.wprdc.org/api/3/action/package_show?id=' + pkg)
    for r in j['result']['resources']:
        if (r.get('format') or '').upper() == 'CSV' or r.get('datastore_active'):
            if name_hint.lower() in (r.get('name') or '').lower() or not name_hint:
                return r
    return j['result']['resources'][0]

WPRDC_SALES_IDS = ['5bbe6c55-bce6-4edb-9d04-68edeb6bf7b1']

def open_retry(urls, tries=4):
    import time
    err = []
    for i in range(tries):
        for u in urls:
            try:
                return u, get(u, 1800)
            except Exception as e:
                err.append('%s: %s' % (u, e))
        time.sleep(20 * (i + 1))
    raise RuntimeError('; '.join(err[-6:]))

def job_wprdc(out):
    """Allegheny County deed records: real flips by municipality, 2024-01 onward."""
    urls = ['https://data.wprdc.org/datastore/dump/%s' % i for i in WPRDC_SALES_IDS]
    try:
        r = wprdc_resource('', os.environ.get('WPRDC_SALES_PKG', 'real-estate-sales'))
        urls.insert(0, 'https://data.wprdc.org/datastore/dump/%s' % r['id'] if r.get('datastore_active') else r['url'])
    except Exception as e:
        log('package_show failed, using known resource id:', e)
    url, fh = open_retry(urls)
    log('sales url', url)
    rd = csv.DictReader(io.TextIOWrapper(fh, encoding='utf-8-sig', newline=''))
    head = rd.fieldnames; log('columns', head)
    sales, codes = [], collections.Counter()
    since_load = datetime.date(2021, 1, 1)
    # purchase side: anything that changed hands for money (sheriff, bank, estate, not-yet-analyzed included);
    # resale side: market sales only. Gifts, quit claims, corrective deeds, multi-parcel and corporate transfers are out.
    NOT_SALE = {'3', '36', '99', 'H', '35', '13', '27', '16'}
    MARKET = {'0', 'AA', '14', 'U', 'UR', 'Z', '28', 'ND', 'DT', '37', 'BK', 'N', '9'}
    for row in rd:
        code = (row.get('SALECODE') or '').strip().upper()
        codes[code + '|' + (row.get('SALEDESC') or '').strip()] += 1
        d = pdate(row.get('SALEDATE')); p = num(row.get('PRICE'))
        if not d or not p or d < since_load or p < 1000 or code in NOT_SALE:
            continue
        sales.append({'parcel': row.get('PARID'), 'date': d, 'price': p, 'muni': (row.get('MUNIDESC') or '').strip(), 'zip': (row.get('PROPERTYZIP') or '').strip()[:5],
                      'school': (row.get('SCHOOLDESC') or '').strip(), 'market': code in MARKET, 'code': code})
    log('sales kept', len(sales))
    since = datetime.date(2024, 1, 1)
    res = {'source': url, 'columns': head, 'saleCodes': codes.most_common(40), 'since': str(since),
           'byMuni': flips_from_sales(sales, 'muni', since=since), 'byZip': flips_from_sales(sales, 'zip', since=since)}
    allc = flips_from_sales([dict(s, all='Allegheny County') for s in sales], 'all', since=since)
    res['county'] = allc
    # price bands of the first sale
    for s in sales:
        s['band'] = 'under 50K' if s['price'] < 50000 else '50-100K' if s['price'] < 100000 else '100-150K' if s['price'] < 150000 else '150-250K' if s['price'] < 250000 else '250K+'
    res['byResaleBand'] = flips_from_sales(sales, 'band', since=since)
    for s in sales:
        s['area'] = 'Pittsburgh city' if 'PITTSBURGH' in s['muni'].upper() else 'Suburbs'
    res['cityVsSuburbs'] = flips_from_sales(sales, 'area', since=since)
    json.dump(res, open(os.path.join(out, 'allegheny_flips.json'), 'w'), default=str)

def carto(q):
    return get_json('https://phl.carto.com/api/v2/sql?' + urllib.parse.urlencode({'q': q}))

def job_philly(out):
    """Philadelphia deed transfers (OpenDataPhilly RTT summary): real flips by ZIP since 2024."""
    q = ("select opa_account_num, display_date, total_consideration, zip_code, document_type, grantees from rtt_summary "
         "where display_date >= '2021-01-01' and document_type = 'DEED' and total_consideration >= 1000 and opa_account_num is not null")
    url = 'https://phl.carto.com/api/v2/sql?' + urllib.parse.urlencode({'q': q, 'format': 'csv'})
    rows = list(csv.DictReader(io.TextIOWrapper(get(url, 1800), encoding='utf-8-sig', newline='')))
    log('rows', len(rows))
    sales = []
    for r in rows:
        d = pdate(str(r.get('display_date'))); p = num(r.get('total_consideration'))
        if d and p:
            g = (r.get('grantees') or '').upper()
            sales.append({'parcel': r['opa_account_num'], 'date': d, 'price': p, 'zip': str(r.get('zip_code') or '')[:5],
                          'company': any(w in g for w in (' LLC', ' INC', ' L L C', 'CORP', ' LP', 'HOLDINGS', 'PROPERTIES', 'INVESTMENT', 'TRUST', 'REALTY', 'CAPITAL', 'HOMES'))})
    since = datetime.date(2024, 1, 1)
    comp = collections.defaultdict(lambda: [0, 0])
    for s_ in sales:
        if s_['date'] >= since:
            comp[s_['zip']][0] += 1; comp[s_['zip']][1] += s_['company']
    companyShare = {z: {'sales': a, 'companyBuyers': b, 'share': round(100 * b / a, 1)} for z, (a, b) in comp.items() if a >= 20}
    res = {'rows': len(rows), 'since': str(since), 'byZip': flips_from_sales(sales, 'zip', since=since), 'companyBuyersByZip': companyShare,
           'city': flips_from_sales([dict(s, all='Philadelphia') for s in sales], 'all', since=since)}
    json.dump(res, open(os.path.join(out, 'philly_flips.json'), 'w'), default=str)

FHFA_URLS = ['https://www.fhfa.gov/hpi/download/quarterly_datasets/hpi_at_metro.csv',
             'https://www.fhfa.gov/HPI_AT_metro.csv']
CBSA = {'Pittsburgh': '38300', 'Scranton': '42540', 'Philadelphia (division)': '37964', 'Indianapolis': '26900', 'South Bend': '43780',
        'Buffalo': '15380', 'Rochester': '40380', 'Dallas (division)': '19124', 'Tampa': '45300', 'Oklahoma City': '36420',
        'Cleveland': '17410', 'Baltimore': '12580', 'Richmond': '40060', 'Detroit suburbs (Warren division)': '47664', 'St. Louis': '41180',
        'Kansas City': '28140', 'Columbus OH': '18140', 'Louisville': '31140'}

def job_fhfa(out):
    err = []
    for url in FHFA_URLS:
        try:
            txt = get(url).read().decode('utf-8', 'replace')
            break
        except Exception as e:
            err.append('%s: %s' % (url, e)); txt = None
    if not txt:
        raise RuntimeError('; '.join(err))
    rows = list(csv.reader(io.StringIO(txt)))
    log('fhfa rows', len(rows), rows[:2])
    series = collections.defaultdict(dict)
    for r in rows:
        if len(r) < 5:
            continue
        name, code, yr, qtr, idx = r[0], r[1], r[2], r[3], r[4]
        v = num(idx)
        if v is None or not yr.isdigit():
            continue
        series[code][(int(yr), int(qtr))] = (name, v)
    res = {}
    for label, code in CBSA.items():
        s = series.get(code)
        if not s:
            res[label] = None; continue
        keys = sorted(s); last = keys[-1]
        def chg(years):
            k = (last[0] - years, last[1])
            return round((s[last][1] / s[k][1] - 1) * 100, 1) if k in s else None
        # largest drop from a peak (peak to trough) since 2005
        peak, dd = 0, 0
        for k in keys:
            if k[0] < 2005:
                continue
            v = s[k][1]; peak = max(peak, v); dd = min(dd, v / peak - 1)
        res[label] = {'name': s[last][0], 'latest': '%dQ%d' % last, 'chg1y': chg(1), 'chg5y': chg(5), 'chg10y': chg(10), 'maxDrawdownSince2005': round(dd * 100, 1)}
    json.dump(res, open(os.path.join(out, 'fhfa.json'), 'w'), indent=1)

OEWS_URLS = ['https://www.bls.gov/oes/special-requests/oesm24ma.zip', 'https://www.bls.gov/oes/special.requests/oesm24ma.zip']
TRADES = {'47-2031': 'Carpenters', '47-2111': 'Electricians', '47-2152': 'Plumbers', '47-2141': 'Painters', '47-2061': 'Construction laborers', '47-2181': 'Roofers', '47-1011': 'Construction supervisors'}

def job_oews(out):
    err, data = [], None
    for url in OEWS_URLS:
        try:
            data = get(url, 900).read(); break
        except Exception as e:
            err.append('%s: %s' % (url, e))
    if data is None:
        raise RuntimeError('; '.join(err))
    z = zipfile.ZipFile(io.BytesIO(data))
    log('oews files', z.namelist())
    import openpyxl
    res = collections.defaultdict(dict)
    for n in z.namelist():
        if not n.lower().endswith('.xlsx'):
            continue
        wb = openpyxl.load_workbook(io.BytesIO(z.read(n)), read_only=True)
        ws = wb.active
        it = ws.iter_rows(values_only=True); head = [str(h).strip().upper() if h else '' for h in next(it)]
        ia, ina, io_, ih = head.index('AREA'), head.index('AREA_TITLE'), head.index('OCC_CODE'), head.index('H_MEDIAN')
        codes = set(CBSA.values())
        for r in it:
            if str(r[ia]) in codes and r[io_] in TRADES:
                res[r[ina]][TRADES[r[io_]]] = r[ih]
    json.dump(res, open(os.path.join(out, 'oews.json'), 'w'), indent=1, default=str)

def job_indiana_probe(out):
    """Find the Indiana Sales Disclosure bulk files and record their layout."""
    import re
    html = get('https://www.stats.indiana.edu/topic/sdf.asp').read().decode('utf-8', 'replace')
    links = sorted(set(re.findall(r'href=["\']([^"\']+\.zip)["\']', html, re.I)))
    log('zip links', links)
    res = {'links': links, 'files': {}}
    base = 'https://www.stats.indiana.edu'
    pick = [l for l in links if any(y in l for y in ('2024', '2025'))][:2] or links[-2:]
    for l in pick:
        u = l if l.startswith('http') else base + (l if l.startswith('/') else '/topic/' + l)
        try:
            z = zipfile.ZipFile(io.BytesIO(get(u, 1800).read()))
        except Exception as e:
            res['files'][u] = 'error %s' % e; continue
        info = {}
        for n in z.namelist():
            if n.lower().endswith(('.txt', '.tsv', '.csv')):
                with z.open(n) as f:
                    lines = [f.readline().decode('utf-8', 'replace').rstrip('\r\n') for _ in range(3)]
                info[n] = {'size': z.getinfo(n).file_size, 'head': lines}
            else:
                info[n] = {'size': z.getinfo(n).file_size}
        res['files'][u] = info
    json.dump(res, open(os.path.join(out, 'indiana_probe.json'), 'w'), indent=1)

def main():
    job, out = sys.argv[1], sys.argv[2]
    d = os.path.join(out, job); os.makedirs(d, exist_ok=True)
    status = {'job': job, 'at': datetime.datetime.utcnow().isoformat() + 'Z'}
    try:
        globals()['job_' + job](d); status['ok'] = True
    except Exception as e:
        status['ok'] = False; status['error'] = '%s: %s' % (type(e).__name__, e); status['trace'] = traceback.format_exc()[-3000:]
        log('FAILED', status['error'])
    status['log'] = LOG[-200:]
    json.dump(status, open(os.path.join(d, 'status.json'), 'w'), indent=1)

if __name__ == '__main__':
    main()
