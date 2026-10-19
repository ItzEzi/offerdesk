import glob, os, sys, time, json
d=os.path.dirname(os.path.abspath(__file__))
css=open(d+'/styles.css').read()
APP_V=time.strftime('%Y%m%d-%H%M')
js='\n'.join(open(f).read() for f in sorted(glob.glob(d+'/js/*.js'))).replace('__APP_V__',APP_V)
gs=open(d+'/bridge.gs').read()
vendor='\n'.join(open(f).read() for f in sorted(glob.glob(d+'/vendor/*.js')))
assert '</script' not in js and '</script' not in gs and '</script' not in vendor
html=f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>OfferDesk</title>
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="OfferDesk">
<meta name="theme-color" content="#3E5BF6">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap">
<style>
{css}
</style>
</head>
<body>
<header class="topbar" id="topbar"></header>
<div id="alertbar"></div>
<main id="main"></main>
<div id="modal-root"></div>
<div id="toast" class="toast" role="status" hidden></div>
<script type="text/plain" id="bridge-src">
{gs}</script>
<script>
{vendor}
</script>
<script>
{js}
</script>
</body>
</html>
'''

# Maya 24/7: the Gmail script loads this bundle (the app's own logic, no screens) and runs it on a timer
WORKER_FILES=['00-core','10-math','20-ai','30-connect','35-cloud','40-ops','76-research','77-market','79-brief','84-campaigns']
wjs='\n'.join(open(f'{d}/js/{n}.js').read() for n in WORKER_FILES).replace('__APP_V__',APP_V)
prelude=open(d+'/worker/prelude.js').read();wmain=open(d+'/worker/main.js').read()
worker=f"/* OfferDesk worker {APP_V}: the same code the app runs, loaded by your Gmail script for Maya 24/7. */\nfunction OD_WORKER(host){{\n{prelude}\n{wjs}\n{wmain}\nreturn {{run:workerRun,version:APP_V}};\n}}\n"

out=sys.argv[1] if len(sys.argv)>1 else os.path.dirname(d)
if out:
    open(out+'/worker.js','w').write(worker)
    open(out+'/index.html','w').write(html)
    open(out+'/version.json','w').write(json.dumps({'v':APP_V})+'\n')
    print('published to',out,APP_V)

print(len(html)//1024,'KB')
