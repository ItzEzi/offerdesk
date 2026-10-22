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
    groups = collections.defaultdict(lambda: {'sales': 0, 'flips': 0, 'loss': 0, 'buy': [], 'sell': [], 'days': [], 'margin': [], 'gain': []})
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
                groups[b[group_key]]['loss'] += 1   # bought and resold quickly for less: a losing (or non-flip) resale
                continue
            g = groups[b[group_key]]
            g['flips'] += 1; g['buy'].append(a['price']); g['sell'].append(b['price']); g['days'].append(d); g['margin'].append(m); g['gain'].append(b['price'] - a['price'])
    out = {}
    for k, g in groups.items():
        out[k] = {'sales': g['sales'], 'flips': g['flips'], 'flipRate': round(100 * g['flips'] / g['sales'], 1) if g['sales'] else None,
                  'medBuy': med(g['buy']), 'medSell': med(g['sell']), 'medDays': med(g['days']),
                  'medMargin': round(100 * med(g['margin']), 1) if g['margin'] else None, 'medGain': med(g['gain']),
                  'quickLosses': g['loss'], 'lossShare': round(100 * g['loss'] / (g['loss'] + g['flips']), 1) if g['loss'] + g['flips'] else None,
                  'p25Margin': round(100 * sorted(g['margin'])[len(g['margin']) // 4], 1) if len(g['margin']) >= 8 else None}
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
        sales.append({'parcel': row.get('PARID'), 'date': d, 'rdate': pdate(row.get('RECORDDATE')), 'price': p, 'muni': (row.get('MUNIDESC') or '').strip(), 'zip': (row.get('PROPERTYZIP') or '').strip()[:5],
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
    res.update(extras(sales, since))
    res['areaBand'] = {a: with_bands([s_ for s_ in sales if s_['area'] == a], since) for a in ('Pittsburgh city', 'Suburbs')}
    res['speedByRecordDate'] = day_stats(flip_days(sales, since, key='rdate'))
    res['speedByMuni'] = {m: day_stats(flip_days([s_ for s_ in sales if s_['muni'] == m], since)) for m in set(s_['muni'] for s_ in sales)}
    res['speedByMuni'] = {m: v for m, v in res['speedByMuni'].items() if v and v['n'] >= 12}
    res['speedByZip'] = {z: day_stats(flip_days([s_ for s_ in sales if s_['zip'] == z], since)) for z in set(s_['zip'] for s_ in sales)}
    res['speedByZip'] = {z: v for z, v in res['speedByZip'].items() if v and v['n'] >= 12}
    res['speedByMarketBuy'] = day_stats(flip_days(sales, since, keep=lambda a, b: a.get('market')))
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
           'city': flips_from_sales([dict(s, all='Philadelphia') for s in sales], 'all', since=since), 'byBand': with_bands(sales, since)}
    res.update(extras(sales, since))
    json.dump(res, open(os.path.join(out, 'philly_flips.json'), 'w'), default=str)

FHFA_URLS = ['https://www.fhfa.gov/hpi/download/quarterly_datasets/hpi_at_metro.csv',
             'https://www.fhfa.gov/HPI_AT_metro.csv']
CBSA = {'Pittsburgh': '38300', 'Scranton': '42540', 'Philadelphia (division)': '37964', 'Indianapolis': '26900', 'South Bend': '43780',
        'Buffalo': '15380', 'Rochester': '40380', 'Dallas (division)': '19124', 'Tampa': '45300', 'Oklahoma City': '36420',
        'Cleveland': '17410', 'Baltimore': '12580', 'Richmond': '40060', 'Detroit suburbs (Warren division)': '47664', 'St. Louis': '41180',
        'Kansas City': '28140', 'Columbus OH': '18140', 'Louisville': '31140', 'Milwaukee': '33340', 'Cincinnati': '17140',
        'Chicago (division)': '16984', 'Atlanta': '12060', 'Memphis': '32820', 'Albany NY': '10580', 'Syracuse': '45060', 'Waterbury CT (new)': '47930',
        'New Haven': '35300', 'Hartford': '25540', 'Hartford (new)': '25540', 'Tampa (new)': '45300', 'Detroit (division)': '19804', 'Baltimore city area': '12580',
        'Allentown': '10900', 'Harrisburg': '25420', 'Akron': '10420', 'Dayton': '19430', 'Toledo': '45780', 'Birmingham': '13820', 'Omaha': '36540'}

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
    res['_index'] = {code: list(v.values())[-1][0] for code, v in series.items()}
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

IN_COUNTIES = {'49': 'Marion (Indianapolis)', '71': 'St. Joseph (South Bend)', '45': 'Lake (Gary)', '02': 'Allen (Fort Wayne)', '20': 'Elkhart'}

def utf16_rows(z, name):
    with z.open(name) as f:
        head = f.read(4)
    if head[:2] in (b'\xff\xfe', b'\xfe\xff'):
        enc = 'utf-16'
    elif len(head) >= 4 and head[1] == 0 and head[3] == 0:
        enc = 'utf-16-le'
    elif len(head) >= 4 and head[0] == 0 and head[2] == 0:
        enc = 'utf-16-be'
    else:
        enc = 'utf-8-sig'
    log(name, 'encoding', enc)
    with z.open(name) as f:
        txt = io.TextIOWrapper(f, encoding=enc, errors='replace', newline='')
        yield from csv.reader(txt, delimiter='\t', quotechar='"')

def job_indiana(out):
    """Indiana sales disclosures 2022-2026: real flips (resold within 18 months) in Indianapolis, South Bend and neighbours."""
    base = 'https://www.stats.indiana.edu/sdfdata/SDF_%d.zip'
    sales, heads = [], {}
    for yr in range(2022, 2027):
        try:
            z = zipfile.ZipFile(io.BytesIO(get(base % yr, 1800).read()))
        except Exception as e:
            log('year', yr, 'failed', e); continue
        try:
            in_year(z, yr, sales, heads)
        except Exception as e:
            log('year', yr, 'failed while reading', repr(e))
    finish_indiana(out, sales, heads)

def in_year(z, yr, sales, heads):
    if True:
        it = utf16_rows(z, 'SALEDISC.txt'); h = [c.strip() for c in next(it)]; heads['SALEDISC'] = h
        def col(*words):
            for i, c in enumerate(h):
                if all(w.lower() in c.lower() for w in words):
                    return i
            return None
        i_id, i_cty = h.index('SDF_ID'), h.index('County_ID')
        i_date = col('conveyance', 'date')
        if i_date is None:
            i_date = col('sale', 'date')
        i_price = col('sales', 'price')
        if i_price is None:
            i_price = col('price')
        i_val = col('valuable')
        flags = {n: (h.index(n) if n in h else None) for n in ('C1_Sheriff_Sale', 'C3_Quitclaim', 'B8_Court_Order', 'E4_Relationship_Discount', 'G11_Special_Relationship', 'B9_Partition', 'B6_Partial_Interest')}
        i_valid = h.index('P2_16_Valid_Trending') if 'P2_16_Valid_Trending' in h else None
        vt = collections.Counter()
        log(yr, 'date col', h[i_date] if i_date is not None else None, 'price col', h[i_price] if i_price is not None else None)
        disc = {}
        for r in it:
            if len(r) <= max(i_id, i_cty, i_date or 0, i_price or 0):
                continue
            cty = r[i_cty].strip().zfill(2)
            if cty not in IN_COUNTIES:
                continue
            if i_val is not None and r[i_val].strip().upper() != 'Y':
                continue
            d = pdate(r[i_date]); p = num(r[i_price])
            if not d or not p:
                continue
            v = r[i_valid].strip().upper() if i_valid is not None and len(r) > i_valid else ''
            vt[v] += 1
            odd = any(i is not None and len(r) > i and r[i].strip().upper() in ('Y', 'YES', '1', 'TRUE') for i in flags.values())
            disc[r[i_id]] = (cty, d, p, (v == 'Y') if v in ('Y', 'N') else not odd)
        it = utf16_rows(z, 'SALEPARCEL.txt'); h2 = [c.strip() for c in next(it)]; heads['SALEPARCEL'] = h2
        j_id = h2.index('SDF_ID'); j_par = h2.index('A1_Parcel_Number')
        j_zip = next((i for i, c in enumerate(h2) if c.lower() == 'a5_zipcode'), None)
        j_cls = next((i for i, c in enumerate(h2) if 'class' in c.lower()), None)
        par = collections.defaultdict(list)
        for r in it:
            if len(r) > j_id and r[j_id] in disc:
                par[r[j_id]].append((r[j_par].strip(), r[j_zip].strip()[:5] if j_zip is not None and len(r) > j_zip else '', r[j_cls].strip() if j_cls is not None and len(r) > j_cls else ''))
        kept = 0
        log(yr, 'valid-for-trending values', vt.most_common(5))
        for sid, (cty, d, p, mk) in disc.items():
            ps = par.get(sid, [])
            if len(ps) != 1:
                continue
            pn, zp, cls = ps[0]
            if cls and cls[:3] not in ('510', '511', '520'):
                continue
            pr = p / 100 if p > 5_000_000 and p % 100 == 0 else p   # some years give cents
            sales.append({'parcel': cty + ':' + pn, 'date': d, 'price': pr, 'county': IN_COUNTIES[cty], 'zip': zp, 'market': mk}); kept += 1
        log(yr, 'disclosures in counties', len(disc), 'single-parcel homes kept', kept, 'class col', h2[j_cls] if j_cls is not None else None)

def finish_indiana(out, sales, heads):
    since = datetime.date(2024, 1, 1)
    res = {'heads': heads, 'since': str(since), 'byCounty': flips_from_sales(sales, 'county', since=since), 'byZip': flips_from_sales(sales, 'zip', since=since)}
    prices = collections.defaultdict(list)
    for s_ in sales:
        if s_['date'] >= since:
            prices[s_['county']].append(s_['price'])
    res['medianSale'] = {k: med(v) for k, v in prices.items()}
    def band(p):
        return 'under 50K' if p < 50000 else '50-100K' if p < 100000 else '100-150K' if p < 150000 else '150-250K' if p < 250000 else '250K+'
    res['byCountyBand'] = {}
    for c in set(s_['county'] for s_ in sales):
        sub = [dict(s_, band=band(s_['price'])) for s_ in sales if s_['county'] == c]
        res['byCountyBand'][c] = flips_from_sales(sub, 'band', since=since)
        res.setdefault('byCountyExtras', {})[c] = extras([s_ for s_ in sales if s_['county'] == c], since)
    json.dump(res, open(os.path.join(out, 'indiana_flips.json'), 'w'), default=str)

def band_of(p):
    return 'under 50K' if p < 50000 else '50-100K' if p < 100000 else '100-150K' if p < 150000 else '150-250K' if p < 250000 else '250K+'

def with_bands(sales, since):
    return flips_from_sales([dict(s_, band=band_of(s_['price'])) for s_ in sales], 'band', since=since)

def socrata_all(base, select, where, order, page=50000, cap=2000000):
    rows, off = [], 0
    while off < cap:
        q = urllib.parse.urlencode({'$select': select, '$where': where, '$order': order, '$limit': page, '$offset': off})
        chunk = json.loads(open_retry([base + '?' + q])[1].read().decode('utf-8'))
        rows += chunk; log('socrata', base.split('/')[2], 'offset', off, 'got', len(chunk))
        if len(chunk) < page:
            break
        off += page
    return rows

def flips_by_buy_band(sales, since, max_days=548, min_price=10000, keyfn=None):
    """Group real flips by what the flipper PAID (his budget is a buy price). Also count losing quick resales."""
    byp = collections.defaultdict(list)
    for s_ in sales:
        byp[s_['parcel']].append(s_)
    g = collections.defaultdict(lambda: {'flips': 0, 'loss': 0, 'sell': [], 'days': [], 'margin': [], 'gain': []})
    for p_, ss in byp.items():
        ss.sort(key=lambda x: x['date'])
        for a, b in zip(ss, ss[1:]):
            if b['date'] < since or not b.get('market', True):
                continue
            d = (b['date'] - a['date']).days
            if d < 30 or d > max_days or a['price'] < min_price:
                continue
            k = keyfn(a) if keyfn else band_of(a['price']); m = b['price'] / a['price'] - 1
            if m <= 0:
                g[k]['loss'] += 1; continue
            g[k]['flips'] += 1; g[k]['sell'].append(b['price']); g[k]['days'].append(d); g[k]['margin'].append(m); g[k]['gain'].append(b['price'] - a['price'])
    return {k: {'flips': v['flips'], 'lossShare': round(100 * v['loss'] / (v['loss'] + v['flips']), 1) if v['loss'] + v['flips'] else None,
                'medSell': med(v['sell']), 'medDays': med(v['days']), 'medMargin': round(100 * med(v['margin']), 1) if v['margin'] else None,
                'p25Margin': round(100 * sorted(v['margin'])[len(v['margin']) // 4], 1) if len(v['margin']) >= 8 else None, 'medGain': med(v['gain'])}
            for k, v in g.items()}

def flip_days(sales, since, max_days=548, key='date', keep=None):
    """Days from purchase to resale for every real flip (resale on/after since, market resale, gain > 0)."""
    byp = collections.defaultdict(list)
    for s_ in sales:
        if s_.get(key):
            byp[s_['parcel']].append(s_)
    out = []
    for p_, ss in byp.items():
        ss.sort(key=lambda x: x[key])
        for a, b in zip(ss, ss[1:]):
            if b['date'] < since or not b.get('market', True) or a['price'] < 10000 or b['price'] <= a['price']:
                continue
            d = (b[key] - a[key]).days
            if 30 <= d <= max_days and (keep is None or keep(a, b)):
                out.append(d)
    return out

def day_stats(v):
    if not v:
        return None
    v = sorted(v); n = len(v)
    return {'n': n, 'p25': v[n // 4], 'p50': v[n // 2], 'p75': v[(3 * n) // 4], 'within6mo': round(100 * sum(x <= 183 for x in v) / n, 1),
            'within8mo': round(100 * sum(x <= 244 for x in v) / n, 1), 'within12mo': round(100 * sum(x <= 365 for x in v) / n, 1)}

def extras(sales, since):
    return {'byYear': flips_from_sales([dict(s_, yr=str(s_['date'].year)) for s_ in sales], 'yr', since=datetime.date(2022, 1, 1)),
            'byBuyBand': flips_by_buy_band(sales, since),
            'byBuyType': flips_by_buy_band(sales, since, keyfn=lambda a: ('market buy ' if a.get('market', True) else 'other buy ') + band_of(a['price'])),
            'within12': flips_from_sales([dict(s_, all='all', band=band_of(s_['price'])) for s_ in sales], 'all', since=since, max_days=365),
            'within12Band': flips_from_sales([dict(s_, band=band_of(s_['price'])) for s_ in sales], 'band', since=since, max_days=365),
            'within6': flips_from_sales([dict(s_, all='all') for s_ in sales], 'all', since=since, max_days=183),
            'speed': {'all': day_stats(flip_days(sales, since)), 'yourRange': day_stats(flip_days(sales, since, keep=lambda a, b: 150000 <= b['price'] < 250000)),
                      'buy50to150': day_stats(flip_days(sales, since, keep=lambda a, b: 50000 <= a['price'] < 150000))}}

# ---------------- Cook County (Chicago) ----------------
COOK_TWP = {'10': 'Barrington', '11': 'Berwyn', '12': 'Bloom', '13': 'Bremen', '14': 'Calumet', '15': 'Cicero', '16': 'Elk Grove', '17': 'Evanston',
            '18': 'Hanover', '19': 'Lemont', '20': 'Leyden', '21': 'Lyons', '22': 'Maine', '23': 'New Trier', '24': 'Niles', '25': 'Northfield',
            '26': 'Norwood Park', '27': 'Oak Park', '28': 'Orland', '29': 'Palatine', '30': 'Palos', '31': 'Proviso', '32': 'Rich', '33': 'River Forest',
            '34': 'Riverside', '35': 'Schaumburg', '36': 'Stickney', '37': 'Thornton', '38': 'Wheeling', '39': 'Worth', '70': 'Chicago: Hyde Park',
            '71': 'Chicago: Jefferson', '72': 'Chicago: Lake', '73': 'Chicago: Lake View', '74': 'Chicago: North', '75': 'Chicago: Rogers Park',
            '76': 'Chicago: South', '77': 'Chicago: West'}
COMPANY = (' LLC', ' INC', ' L L C', 'CORP', ' LP', 'HOLDINGS', 'PROPERTIES', 'INVESTMENT', 'REALTY', 'CAPITAL', 'HOMES', 'VENTURES', 'GROUP')

def job_cook(out):
    """Cook County Assessor parcel sales (Socrata wvhk-k5uv): real flips of houses (class 2xx) since 2024, by township."""
    base = 'https://datacatalog.cookcountyil.gov/resource/wvhk-k5uv.json'
    sample = json.loads(open_retry([base + '?$limit=3'])[1].read().decode('utf-8'))
    cols = sorted(sample[0].keys()) if sample else []
    log('cook columns', cols)
    want = [c for c in ('pin', 'township_code', 'class', 'sale_date', 'sale_price', 'deed_type', 'buyer_name', 'is_multisale', 'num_parcels_sale',
                        'sale_filter_less_than_10k', 'sale_filter_deed_type') if c in cols]
    rows = socrata_all(base, ','.join(want), "sale_date >= '2022-01-01T00:00:00' AND sale_price >= 10000 AND class between '202' and '299'", 'sale_date,pin')
    sales = []
    for r in rows:
        if str(r.get('is_multisale', 'false')).lower() in ('true', '1') or (num(r.get('num_parcels_sale')) or 1) > 1:
            continue
        d = pdate(str(r.get('sale_date', ''))[:10]); pr = num(r.get('sale_price'))
        if not d or not pr:
            continue
        dt = (r.get('deed_type') or '').lower()
        tw = COOK_TWP.get(str(r.get('township_code', '')).zfill(2), str(r.get('township_code')))
        sales.append({'parcel': r['pin'], 'date': d, 'price': pr, 'twp': tw, 'all': 'Cook County', 'city': 'Chicago city' if tw.startswith('Chicago') else 'Suburban Cook',
                      'market': 'warranty' in dt or dt in ('', 'other', 'trustee', 'deed'), 'company': any(w in (r.get('buyer_name') or '').upper() for w in COMPANY)})
    since = datetime.date(2024, 1, 1)
    comp = collections.defaultdict(lambda: [0, 0])
    for s_ in sales:
        if s_['date'] >= since:
            comp[s_['twp']][0] += 1; comp[s_['twp']][1] += s_['company']
    res = {'rows': len(rows), 'kept': len(sales), 'columns': cols, 'deedTypes': collections.Counter((r.get('deed_type') or '') for r in rows).most_common(15),
           'county': flips_from_sales(sales, 'all', since=since), 'cityVsSuburbs': flips_from_sales(sales, 'city', since=since),
           'byTownship': flips_from_sales(sales, 'twp', since=since), 'byBand': with_bands(sales, since),
           'companyBuyersByTownship': {k: {'sales': a, 'share': round(100 * b / a, 1)} for k, (a, b) in comp.items() if a >= 50}}
    res.update(extras(sales, since))
    json.dump(res, open(os.path.join(out, 'cook_flips.json'), 'w'), default=str)

# ---------------- Milwaukee (city arm's-length sales) ----------------
MKE = 'https://data.milwaukee.gov/dataset/7a8b81f6-d750-4f62-aee8-30ffce1c64ce/resource/%s/download/%s'
MKE_FILES = [('060179e8-0d9d-4071-aa54-fd62223842b6', 'armslengthsales_2022_valid_20230404.csv'),
             ('26d0ca6e-0a70-41fc-8e60-8c1a32343877', 'armslengthsales_2023_valid.csv'),
             ('01651dab-2be7-40c6-a9d6-31254fe02e29', 'armslengthsales_2024_valid_20250917.csv'),
             ('1f2dbf65-3ff9-49a2-a9ef-eb0b6c503017', 'armslengthsales_2025_valid_20261019.csv'),
             ('f4b2cf5c-8a7d-4299-bc3b-b2d976c80fc5', 'armslengthsales_2026_valid_20261019.csv')]

def job_milwaukee(out):
    """City of Milwaukee arm's-length (valid) sales 2022-2026: resold within 18 months. Distressed purchases are NOT in this file, so flips are undercounted."""
    sales, heads = [], None
    for rid, fn in MKE_FILES:
        try:
            rows = list(csv.DictReader(io.TextIOWrapper(open_retry([MKE % (rid, fn)])[1], encoding='utf-8-sig', errors='replace', newline='')))
        except Exception as e:
            log(fn, 'failed', e); continue
        if not rows:
            continue
        heads = list(rows[0].keys()); low = {k.lower().replace(' ', '').replace('_', ''): k for k in heads}
        k_id = low.get('taxkey'); k_d = low.get('saledate'); k_p = low.get('saleprice'); k_t = low.get('proptype') or low.get('propertytype'); k_n = low.get('nbhd') or low.get('neighborhood'); k_u = low.get('units'); k_di = low.get('district')
        log(fn, 'rows', len(rows), 'cols', heads[:25])
        for r in rows:
            d = pdate(r.get(k_d, '')); pr = num(r.get(k_p))
            if not d or not pr:
                continue
            t = (r.get(k_t) or '').lower()
            if t and 'resid' not in t and 'condo' not in t:
                continue
            sales.append({'parcel': r.get(k_id), 'date': d, 'price': pr, 'all': 'Milwaukee city', 'district': r.get(k_di) or '', 'type': t,
                          'units': r.get(k_u) or ''})
    since = datetime.date(2024, 1, 1)
    res = {'heads': heads, 'kept': len(sales), 'city': flips_from_sales(sales, 'all', since=since), 'byBand': with_bands(sales, since),
           'byDistrict': flips_from_sales(sales, 'district', since=since),
           'types': collections.Counter(s_['type'] for s_ in sales).most_common(10)}
    json.dump(res, open(os.path.join(out, 'milwaukee_flips.json'), 'w'), default=str)

# ---------------- Connecticut statewide sales (Waterbury, New Haven, Hartford...) ----------------
CT_TOWNS = ('Waterbury', 'New Haven', 'Hartford', 'West Hartford', 'Bridgeport', 'New Britain', 'Meriden', 'Stamford', 'Norwalk', 'East Haven', 'Hamden', 'Naugatuck', 'Bloomfield', 'Fairfield', 'Stratford')

def job_ct(out):
    """Connecticut OPM real estate sales (data.ct.gov 5mzw-sjtu). No parcel id, so the same house = same town + normalised address."""
    base = 'https://data.ct.gov/resource/5mzw-sjtu.json'
    sample = json.loads(open_retry([base + '?$limit=3'])[1].read().decode('utf-8'))
    cols = sorted(sample[0].keys()) if sample else []
    log('ct columns', cols)
    dcol = 'daterecorded' if 'daterecorded' in cols else next(c for c in cols if 'date' in c)
    pcol = 'saleamount' if 'saleamount' in cols else next(c for c in cols if 'amount' in c or 'price' in c)
    towns = ','.join("'%s'" % t for t in CT_TOWNS)
    rows = socrata_all(base, '*', "%s >= '2020-01-01T00:00:00' AND town in(%s)" % (dcol, towns), dcol)
    import re
    def norm(a):
        a = re.sub(r'[^A-Z0-9 ]', ' ', (a or '').upper()); a = re.sub(r'\b(UNIT|APT|#)\b.*', '', a)
        rep = {'STREET': 'ST', 'AVENUE': 'AVE', 'ROAD': 'RD', 'DRIVE': 'DR', 'PLACE': 'PL', 'COURT': 'CT', 'LANE': 'LN', 'TERRACE': 'TER', 'BOULEVARD': 'BLVD'}
        return ' '.join(rep.get(w, w) for w in a.split())
    sales = []
    for r in rows:
        pt = (r.get('propertytype') or '').lower(); rt = (r.get('residentialtype') or '').lower()
        if pt and pt not in ('residential', 'single family', 'two family', 'three family', 'four family', 'condo'):
            continue
        if rt and rt not in ('single family', 'two family', 'three family', 'four family', 'condo'):
            continue
        d = pdate(str(r.get(dcol, ''))[:10]); pr = num(r.get(pcol))
        if not d or not pr:
            continue
        nu = (r.get('nonusecode') or '').strip()
        sales.append({'parcel': r.get('town', '') + '|' + norm(r.get('address')), 'date': d, 'price': pr, 'town': r.get('town', ''), 'kind': rt or pt,
                      'market': nu in ('', '0', 'nan')})
    since = datetime.date(2023, 1, 1)
    res = {'rows': len(rows), 'kept': len(sales), 'columns': cols, 'lastDate': str(max((s_['date'] for s_ in sales), default=None)),
           'nonuse': collections.Counter((r.get('nonusecode') or '') for r in rows).most_common(12),
           'byTown': flips_from_sales(sales, 'town', since=since),
           'byTownBand': {t: with_bands([s_ for s_ in sales if s_['town'] == t], since) for t in ('Waterbury', 'New Haven', 'Hartford')}}
    json.dump(res, open(os.path.join(out, 'ct_flips.json'), 'w'), default=str)

# ---------------- Socrata catalogue search (find more open sale datasets) ----------------
def job_catalog(out):
    res = {}
    for dom, q in (('opendata.maryland.gov', 'real property'), ('data.cincinnati-oh.gov', 'sales'), ('data.ny.gov', 'property sales'),
                   ('data.cityofnewyork.us', 'rolling sales'), ('data.wprdc.org', 'sales'), ('data.detroitmi.gov', 'sales'),
                   ('data.cuyahogacounty.us', 'sales'), ('www.dallasopendata.com', 'sales')):
        try:
            u = 'https://api.us.socrata.com/api/catalog/v1?' + urllib.parse.urlencode({'domains': dom, 'q': q, 'limit': 12})
            d = json.loads(get(u, 120).read().decode('utf-8'))
            res[dom] = [{'id': x['resource']['id'], 'name': x['resource']['name'], 'cols': x['resource'].get('columns_field_name', [])[:40],
                         'updated': x['resource'].get('data_updated_at')} for x in d.get('results', [])]
        except Exception as e:
            res[dom] = 'error %s' % e
    json.dump(res, open(os.path.join(out, 'catalog.json'), 'w'), indent=1)

# ---------------- Maryland SDAT (Baltimore City): last two transfers per property ----------------
def job_maryland(out):
    """Maryland assessments keep each property's last transfers (date, price, arm's-length code). A flip = latest transfer
    within 18 months of the previous one, for more money. Baltimore City only (jurisdiction BACI)."""
    meta = json.loads(open_retry(['https://opendata.maryland.gov/api/views/ed4q-f8tm/columns.json'])[1].read().decode('utf-8'))
    names = [c['fieldName'] for c in meta]
    def f(*parts):
        for n in names:
            if all(p in n for p in parts):
                return n
        return None
    C = {'acct': f('account_id'), 'jur': f('jurisdiction_code'), 'zip': f('premise_address_zip_code'), 'use': f('land_use_code'),
         'd1': f('sales_segment_1_transfer_date'), 'p1': f('sales_segment_1_consideration'), 'h1': f('sales_segment_1_how_conveyed'),
         'd2': f('sales_segment_2_transfer_date'), 'p2': f('sales_segment_2_consideration'), 'h2': f('sales_segment_2_how_conveyed')}
    log('maryland columns', C)
    base = 'https://opendata.maryland.gov/resource/ed4q-f8tm.json'
    sel = ','.join(v for v in C.values() if v)
    rows = socrata_all(base, sel, "%s = 'BACI'" % C['jur'], C['acct'])
    log('rows', len(rows), 'sample', rows[:2])
    sales = []
    hows = collections.Counter()
    for r in rows:
        zp = str(r.get(C['zip']) or '')[:5]
        for d, p_, h in (('d1', 'p1', 'h1'), ('d2', 'p2', 'h2')):
            dt = pdate(str(r.get(C[d]) or '').replace('.', '-')[:10]); pr = num(r.get(C[p_]))
            if not dt or not pr:
                continue
            hw = str(r.get(C[h]) or '').strip(); hows[hw] += 1
            code = hw[hw.rfind('(') + 1:hw.rfind(')')] if '(' in hw else hw[:1]
            sales.append({'parcel': r.get(C['acct']), 'date': dt, 'price': pr, 'zip': zp, 'all': 'Baltimore City', 'market': code in ('1', '3')})
    since = datetime.date(2024, 1, 1)
    res = {'rows': len(rows), 'sales': len(sales), 'columns': C, 'howConveyed': hows.most_common(12),
           'note': 'Only the last two transfers per property are kept by SDAT, so older sales are missing; recent flips are complete.',
           'city': flips_from_sales(sales, 'all', since=since), 'byBand': with_bands(sales, since), 'byZip': flips_from_sales(sales, 'zip', since=since)}
    res.update(extras(sales, since))
    json.dump(res, open(os.path.join(out, 'maryland_flips.json'), 'w'), default=str)

# ---------------- Detroit (city assessor sales, 2018-) ----------------
def job_detroit(out):
    """City of Detroit assessor property sales (ArcGIS Hub d26fda1e...). Flips by ZIP; NW Detroit borders the Oak Park / Southfield Orthodox community."""
    url = 'https://data.detroitmi.gov/api/download/v1/items/d26fda1e80b04630a6e56627e6fbceb8/csv?layers=0'
    rows = list(csv.DictReader(io.TextIOWrapper(open_retry([url])[1], encoding='utf-8-sig', errors='replace', newline='')))
    heads = list(rows[0].keys()) if rows else []
    log('rows', len(rows), 'cols', heads)
    low = {h.lower(): h for h in heads}
    def pick(*cands):
        for c in cands:
            for h in heads:
                if c.replace('_', '') in h.lower().replace(' ', '').replace('_', ''):
                    return h
        return None
    k_id = pick('parcel_id', 'parcel_number', 'parcel'); k_d = pick('sale_date', 'saledate'); k_p = pick('sale_price', 'saleprice')
    k_m = pick('multi_parcel'); k_g = pick('grantee'); k_cd = pick('property_class_description')
    k_t = pick('sale_terms', 'terms'); k_i = pick('sale_instrument', 'instrument'); k_z = pick('zip'); k_c = pick('property_class', 'class', 'use_code')
    log('using', k_id, k_d, k_p, k_t, k_i, k_z, k_c)
    terms = collections.Counter(); sales = []
    for r in rows:
        d = pdate(str(r.get(k_d) or '')[:10]); pr = num(r.get(k_p))
        if not d or not pr or pr < 1000:
            continue
        cls = str(r.get(k_c) or '')
        if cls and not cls.startswith('4'):
            continue
        if str(r.get(k_m) or '').strip().lower() in ('y', 'yes', 'true', '1'):
            continue
        t = (r.get(k_t) or '').upper(); terms[t] += 1
        g = (r.get(k_g) or '').upper()
        sales.append({'parcel': r.get(k_id), 'date': d, 'price': pr, 'zip': str(r.get(k_z) or '')[:5], 'all': 'Detroit city',
                      'market': ('ARM' in t and 'NOT' not in t and 'NON' not in t) if t else True, 'company': any(w in g for w in COMPANY)})
    since = datetime.date(2024, 1, 1)
    comp = collections.defaultdict(lambda: [0, 0])
    for s_ in sales:
        if s_['date'] >= datetime.date(2024, 1, 1) and s_['market']:
            comp[s_['zip']][0] += 1; comp[s_['zip']][1] += s_['company']
    res = {'rows': len(rows), 'kept': len(sales), 'heads': heads, 'fields': [k_id, k_d, k_p, k_t, k_i, k_z, k_c], 'terms': terms.most_common(20),
           'companyBuyersByZip': {z: {'sales': a, 'share': round(100 * b / a, 1)} for z, (a, b) in comp.items() if a >= 50},
           'city': flips_from_sales(sales, 'all', since=since), 'byBand': with_bands(sales, since), 'byZip': flips_from_sales(sales, 'zip', since=since)}
    res.update(extras(sales, since))
    json.dump(res, open(os.path.join(out, 'detroit_flips.json'), 'w'), default=str)

# ---------------- BatchData flip reports (probe) ----------------
def job_batchprobe(out):
    """Save the raw HTML of BatchData's flip-activity report pages to see whether they carry county data (Lackawanna = Scranton)."""
    urls = ['https://reports.batchdata.io/market-reports/flip-activity/2026-07/state/mi/',
            'https://reports.batchdata.io/market-reports/flip-activity/2026-07/state/pa/',
            'https://reports.batchdata.io/market-reports/flip-activity/2026-07/county/pa/lackawanna/',
            'https://reports.batchdata.io/market-reports/flip-activity/2026-07/county/pa/lackawanna-county/',
            'https://reports.batchdata.io/market-reports/flip-activity/2026-07/county/42069/',
            'https://reports.batchdata.io/sitemap.xml', 'https://reports.batchdata.io/robots.txt']
    res = {}
    for i, u in enumerate(urls):
        try:
            b = get(u, 120).read()
            fn = 'page%d.html' % i
            open(os.path.join(out, fn), 'wb').write(b)
            res[u] = {'file': fn, 'bytes': len(b)}
        except Exception as e:
            res[u] = {'error': str(e)}
    json.dump(res, open(os.path.join(out, 'batchprobe.json'), 'w'), indent=1)

# ---------------- BatchData county flip reports ----------------
BD_COUNTIES = ['pa-allegheny', 'pa-lackawanna', 'pa-luzerne', 'pa-philadelphia', 'pa-delaware', 'pa-montgomery', 'in-st-joseph', 'in-marion', 'in-lake',
               'md-baltimore-city', 'md-baltimore', 'mi-wayne', 'mi-oakland', 'oh-cuyahoga', 'ny-erie', 'ny-monroe', 'il-cook', 'ok-oklahoma', 'tx-dallas', 'fl-hillsborough']

def job_batchdata(out):
    """BatchData's free monthly flip-activity pages: homes flipped (12 months), average gross profit, ROI and days to flip, per county.
    Same yardstick for every county, including Lackawanna and Luzerne (Scranton metro), which have no open deed data."""
    import re, html as H
    res = {}
    for month in ('2026-09', '2026-08', '2026-07'):
        for c in BD_COUNTIES + ['state:pa', 'state:in', 'state:md', 'state:mi']:
            key = c
            if c.startswith('state:'):
                u = 'https://reports.batchdata.io/market-reports/flip-activity/%s/state/%s/' % (month, c[6:])
            else:
                u = 'https://reports.batchdata.io/market-reports/flip-activity/%s/county/%s/' % (month, c)
            if res.get(key, {}).get('month'):
                continue
            try:
                t = get(u, 120).read().decode('utf-8', 'replace')
            except Exception as e:
                res.setdefault(key, {})['err_' + month] = str(e)[:80]; continue
            body = re.sub(r'<script.*?</script>|<style.*?</style>', ' ', t, flags=re.S)
            txt = re.sub(r'\s+', ' ', H.unescape(re.sub(r'<[^>]+>', ' ', body)))
            m = re.search(r'([\d,]+) Homes Flipped \(12 mo\.\) \$([\d.,]+)([KM]?) Avg Gross Profit ([\d.\-]+)% Avg ROI ([\d,]+) days Avg Days to Flip', txt)
            i = txt.find('Homes Flipped (12 mo.)')
            snippet = txt[max(0, i - 200): i + 2500] if i >= 0 else txt[:600]
            r = {'month': month, 'url': u, 'snippet': snippet}
            if m:
                r.update(flips=int(m.group(1).replace(',', '')), grossProfit=m.group(2) + m.group(3), roi=float(m.group(4)), days=int(m.group(5).replace(',', '')))
            res[key] = r
            log(key, month, r.get('flips'), r.get('roi'))
    json.dump(res, open(os.path.join(out, 'batchdata.json'), 'w'), indent=1)

def job_batchdata3(out):
    """More counties with Orthodox communities, same BatchData yardstick: flips, ROI, days, total sales, off-MLS share, corporate-owned."""
    import re, html as H
    res = {}
    for c in ['oh-hamilton', 'wi-milwaukee', 'ga-dekalb', 'tn-shelby', 'ny-albany', 'ct-new-haven', 'mo-st-louis', 'mo-st-louis-city', 'ky-jefferson',
              'oh-franklin', 'va-richmond-city', 'va-henrico', 'la-orleans', 'pa-dauphin', 'pa-lehigh', 'nj-camden', 'oh-summit', 'oh-montgomery', 'ny-onondaga', 'md-baltimore-city', 'in-st-joseph']:
        r = {}
        for rtype in ('flip-activity', 'on-market-off-market', 'property-ownership'):
            u = 'https://reports.batchdata.io/market-reports/%s/2026-07/county/%s/' % (rtype, c)
            try:
                t = get(u, 120).read().decode('utf-8', 'replace')
            except Exception as e:
                r[rtype] = 'error ' + str(e)[:40]; continue
            body = re.sub(r'<script.*?</script>|<style.*?</style>', ' ', t, flags=re.S)
            txt = re.sub(r'\s+', ' ', H.unescape(re.sub(r'<[^>]+>', ' ', body)))
            i = txt.find('Report July 2026')
            r[rtype] = txt[i: i + 400] if i >= 0 else txt[:300]
        res[c] = r
    json.dump(res, open(os.path.join(out, 'batchdata3.json'), 'w'), indent=1)

def job_batchdata2(out):
    """BatchData's other county pages (sales on/off market, ownership) to put flips on one yardstick: flips per sale and investor ownership."""
    import re, html as H
    res = {}
    for rtype in ('on-market-off-market', 'property-ownership'):
        for c in ['pa-allegheny', 'pa-lackawanna', 'pa-luzerne', 'pa-philadelphia', 'in-marion', 'in-lake', 'mi-wayne', 'il-cook', 'oh-cuyahoga', 'ny-erie', 'ny-monroe', 'md-baltimore']:
            u = 'https://reports.batchdata.io/market-reports/%s/2026-07/county/%s/' % (rtype, c)
            try:
                t = get(u, 120).read().decode('utf-8', 'replace')
            except Exception as e:
                res['%s|%s' % (rtype, c)] = {'error': str(e)[:80]}; continue
            body = re.sub(r'<script.*?</script>|<style.*?</style>', ' ', t, flags=re.S)
            txt = re.sub(r'\s+', ' ', H.unescape(re.sub(r'<[^>]+>', ' ', body)))
            i = txt.find('Report July 2026')
            res['%s|%s' % (rtype, c)] = {'url': u, 'text': txt[max(0, i - 100): i + 3500]}
    json.dump(res, open(os.path.join(out, 'batchdata2.json'), 'w'), indent=1)

# ---------------- PASDA (Pennsylvania spatial data) probe: do Luzerne / Lackawanna parcels carry sale prices? ----------------
def job_pasda(out):
    res = {}
    for host in ('https://services.pasda.psu.edu/server/rest/services/pasda/', 'https://mapservices.pasda.psu.edu/server/rest/services/pasda/'):
        for svc in ('LuzerneCounty', 'LackawannaCounty', 'Lackawanna', 'WayneCounty'):
            u = host + svc + '/MapServer?f=pjson'
            try:
                d = json.loads(get(u, 60).read().decode('utf-8', 'replace'))
            except Exception as e:
                res[u] = 'error ' + str(e)[:60]; continue
            layers = {}
            for L in d.get('layers', []):
                try:
                    ld = json.loads(get(host + svc + '/MapServer/%d?f=pjson' % L['id'], 60).read().decode('utf-8', 'replace'))
                    layers[L['name']] = {'id': L['id'], 'fields': [f['name'] for f in ld.get('fields') or []][:80]}
                except Exception as e:
                    layers[L['name']] = 'error ' + str(e)[:60]
            res[u] = {'description': (d.get('serviceDescription') or '')[:300], 'layers': layers}
        if any(isinstance(v, dict) for v in res.values()):
            break
    try:
        d = json.loads(get('https://services.pasda.psu.edu/server/rest/services/pasda?f=pjson', 60).read().decode('utf-8', 'replace'))
        res['_services'] = [x['name'] for x in d.get('services', []) if any(w in x['name'].lower() for w in ('lack', 'luzern', 'allegh', 'philad', 'parcel'))]
    except Exception as e:
        res['_services'] = 'error ' + str(e)[:60]
    json.dump(res, open(os.path.join(out, 'pasda.json'), 'w'), indent=1)

def job_bdagents(out):
    """BatchData's top-agents pages (public): who sells the most homes in Allegheny and Philadelphia counties."""
    import re, html as H
    res = {}
    for c in ('pa-allegheny', 'pa-philadelphia', 'pa-lackawanna'):
        u = 'https://reports.batchdata.io/market-reports/top-agents/2026-07/county/%s/' % c
        try:
            t = get(u, 120).read().decode('utf-8', 'replace')
        except Exception as e:
            res[c] = 'error ' + str(e)[:60]; continue
        body = re.sub(r'<script.*?</script>|<style.*?</style>', ' ', t, flags=re.S)
        txt = re.sub(r'\s+', ' ', H.unescape(re.sub(r'<[^>]+>', ' ', body)))
        i = txt.find('Report July 2026')
        res[c] = {'url': u, 'text': txt[max(0, i - 100): i + 6000]}
    json.dump(res, open(os.path.join(out, 'bdagents.json'), 'w'), indent=1)

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
