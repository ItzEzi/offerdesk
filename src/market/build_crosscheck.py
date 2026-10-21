#!/usr/bin/env python3
"""Second opinions on Redfin's ZIP numbers, from two other public sources:
  Zillow Home Value Index (single-family, middle tier) by ZIP: what a typical house is worth
  Realtor.com monthly inventory by ZIP (all home types): listings, new listings, price cuts, pending, days on market
Writes crosscheck.json. Usage: python build_crosscheck.py OUT_DIR
"""
import csv, io, json, os, sys, datetime, urllib.request

UA = {'User-Agent': 'Mozilla/5.0 (OfferDesk market job; github.com/ItzEzi/offerdesk)'}
ZHVI = ['https://files.zillowstatic.com/research/public_csvs/zhvi/Zip_zhvi_uc_sfr_tier_0.33_0.67_sm_sa_month.csv',
        'https://files.zillowstatic.com/research/public_csvs/zhvi/Zip_zhvi_uc_sfr_tier_0.33_0.67_month.csv']
RDC = ['https://econdata.s3-us-west-2.amazonaws.com/Reports/Core/RDC_Inventory_Core_Metrics_Zip.csv']
STATUS = {}

def get(url, timeout=600):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout)

def num(v):
    try:
        x = float(str(v).replace(',', ''))
    except (TypeError, ValueError):
        return None
    return None if x != x else x

def zhvi():
    errs = []
    for url in ZHVI:
        try:
            rd = csv.reader(io.TextIOWrapper(get(url), encoding='utf-8-sig', newline=''))
            head = next(rd)
            iz = head.index('RegionName')
            dates = [i for i, h in enumerate(head) if len(h) == 10 and h[4] == '-' and h[7] == '-']
            out = {}
            for r in rd:
                for k in range(len(dates) - 1, -1, -1):
                    i = dates[k]
                    if i < len(r) and num(r[i]):
                        v = num(r[i]); j = dates[k - 12] if k >= 12 else None
                        v0 = num(r[j]) if j is not None and j < len(r) else None
                        # change in Zillow's typical home value over 12 months: not skewed by which houses happened to sell
                        out[r[iz].zfill(5)] = (round(v), head[i][:7], round((v / v0 - 1) * 100, 1) if v0 else None)
                        break
            print('ZHVI: %d ZIPs from %s' % (len(out), url))
            return out
        except Exception as e:
            errs.append('%s: %s' % (url.rsplit('/', 1)[-1], str(e)[:80]))
    raise RuntimeError('; '.join(errs))

def rdc():
    errs = []
    for url in RDC:
        try:
            rd = csv.DictReader(io.TextIOWrapper(get(url), encoding='utf-8-sig', newline=''))
            out, month = {}, ''
            for r in rd:
                z = str(r.get('postal_code') or '').strip().zfill(5)
                m = str(r.get('month_date_yyyymm') or '').strip()
                if len(z) != 5 or not m.isdigit():
                    continue
                if z in out and out[z]['m'] >= m:
                    continue
                out[z] = {'m': m, 'listPrice': num(r.get('median_listing_price')), 'active': num(r.get('active_listing_count')),
                          'new': num(r.get('new_listing_count')), 'reduced': num(r.get('price_reduced_count')),
                          'pending': num(r.get('pending_listing_count')), 'dom': num(r.get('median_days_on_market')),
                          'ppsf': num(r.get('median_listing_price_per_square_foot'))}
                month = max(month, m)
            print('Realtor.com: %d ZIPs, latest month %s' % (len(out), month))
            return out, month
        except Exception as e:
            errs.append('%s: %s' % (url.rsplit('/', 1)[-1], str(e)[:80]))
    raise RuntimeError('; '.join(errs))

def optional(name, fn, default):
    try:
        res = fn()
        STATUS[name] = 'ok'
        return res
    except Exception as e:
        print(name, 'skipped:', e)
        STATUS[name] = 'failed: %s' % str(e)[:200]
        return default

COLS = ['z', 'zhvi', 'zhviYoy', 'rdcList', 'rdcActive', 'rdcNew', 'rdcReduced', 'rdcPending', 'rdcDom', 'rdcPpsf']

def main(out_dir, zips=None):
    zv = optional('zhvi', zhvi, {})
    rc, month = optional('realtor', rdc, ({}, ''))
    keys = set(zv) | set(rc)
    if zips is not None:
        keys &= set(zips)
    rows = []
    for z in sorted(keys):
        a, b = zv.get(z), rc.get(z, {})
        rows.append([z, a[0] if a else None, a[2] if a else None, b.get('listPrice'), b.get('active'), b.get('new'), b.get('reduced'), b.get('pending'), b.get('dom'), b.get('ppsf')])
    zmonth = max((v[1] for v in zv.values()), default=None)
    now = datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat().replace('+00:00', 'Z')
    d = {'updated': now, 'zhviMonth': zmonth, 'realtorMonth': (month[:4] + '-' + month[4:]) if month else None, 'status': STATUS, 'cols': COLS, 'rows': rows}
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, 'crosscheck.json'), 'w') as f:
        json.dump(d, f, separators=(',', ':'))
    print('crosscheck.json: %d ZIPs, Zillow %s, Realtor.com %s, %s' % (len(rows), zmonth, d['realtorMonth'], json.dumps(STATUS)))
    return d

if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'market')
