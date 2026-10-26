/**
 * OfferDesk Bridge v4
 * Connects OfferDesk to your Gmail, optionally to a Twilio number for texts,
 * and saves your OfferDesk data (deals, photos, settings) to a Google Drive
 * folder called "OfferDesk Cloud" so every device you use sees the same desk.
 * It can also open links that come with a deal (Google Drive photo folders, deal pages),
 * email you Maya's morning brief every day, and run Maya 24/7: every 5 minutes it checks
 * for work and, when no device has OfferDesk open, runs OfferDesk's own code (loaded from
 * your OfferDesk site) to answer agents, follow up and send campaign emails.
 * It runs inside your own Google account. Nothing is stored anywhere else.
 * Deploy: Deploy > New deployment > Web app > Execute as: Me > Who has access: Anyone.
 */
var SECRET = 'PASTE-SECRET-HERE';

function doGet(e) {
  return json_({ ok: true, service: 'offerdesk-bridge', version: 7 });
}

function doPost(e) {
  try {
    var p = (e && e.parameter) || {};
    // Twilio posts incoming texts here. The webhook URL carries ?key=SECRET.
    if (p.MessageSid && p.From) {
      if (p.key !== SECRET) return ContentService.createTextOutput('');
      saveSms_({ sid: p.MessageSid, from: p.From, to: p.To || '', body: p.Body || '', at: new Date().toISOString() });
      return ContentService.createTextOutput('<Response></Response>').setMimeType(ContentService.MimeType.XML);
    }
    var req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (req.key !== SECRET) return json_({ ok: false, error: 'wrong_secret' });
    return json_(handle_(req));
  } catch (err) {
    return json_({ ok: false, error: String((err && err.message) || err) });
  }
}

/* every action, as plain objects (Maya 24/7 calls this directly, without a web request) */
function handle_(req) {
  try {
    switch (req.action) {
      case 'ping': return { ok: true, version: 7, cloud: true, worker: true, email: Session.getEffectiveUser().getEmail(), twilio: !!prop_('TWILIO_SID'), twilioFrom: prop_('TWILIO_FROM') || '', left: quotaLeft_() };
      case 'cloud_meta': return cloudMeta_();
      case 'cloud_get': return cloudGet_(req.names || []);
      case 'cloud_put': return cloudPut_(req.parts || {});
      case 'lease': return lease_(req);
      case 'photo_list': return photoList_();
      case 'photo_put': return photoPut_(req);
      case 'photo_get': return photoGet_(String(req.id || ''));
      case 'photo_del': return photoDel_(req.ids || []);
      case 'fetch_url': return fetchUrl_(String(req.url || ''));
      case 'drive_image': return driveImage_(String(req.id || ''));
      case 'brief_setup': return briefSetup_(req);
      case 'brief_test': return morningBrief();
      case 'worker_setup': return workerSetup_(req);
      case 'worker_status': return workerStatus_();
      case 'attachments': return attachments_(String(req.id || ''), Number(req.max) || 6, Number(req.start) || 0, String(req.kind || ''));
      case 'search': return { ok: true, messages: search_(String(req.query || ''), Number(req.max) || 30) };
      case 'message': return message_(String(req.id || ''));
      case 'send': return send_(req);
      case 'twilio_save': return twilioSave_(req);
      case 'sms_send': return smsSend_(String(req.to || ''), String(req.body || ''));
      case 'sms_inbox': return { ok: true, messages: smsInbox_(String(req.since || '')) };
      default: return { ok: false, error: 'unknown_action' };
    }
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) };
  }
}

/* the email as text, keeping every link. Wholesalers and alert emails often put the link on the property's picture,
   which the plain-text version of an email drops, so read the HTML and write each picture link out as [picture link: URL]. */
function mailText_(m) {
  var html = ''; try { html = m.getBody() || ''; } catch (e) {}
  if (!html || html.indexOf('<') === -1) return (m.getPlainBody() || '').slice(0, 16000);
  var dec = function (s) { return String(s || '').replace(/&nbsp;/g, ' ').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(+n); }).replace(/&amp;/g, '&'); };
  var attr = function (tag, name) { var r = tag.match(new RegExp('\\s' + name + '\\s*=\\s*("([^"]*)"|\'([^\']*)\'|([^\\s>]+))', 'i')); return r ? dec(r[2] || r[3] || r[4] || '') : ''; };
  var isPic = function (src) { return /\.(jpe?g|png|webp)(\?|$)/i.test(src) || /streetview|maps\.googleapis/i.test(src); };
  var t = html.replace(/<(script|style|head|title)\b[\s\S]*?<\/\1\s*>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
  t = t.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, function (_, at, inner) {
    var href = attr('<a' + at + '>', 'href'); if (!/^https?:/i.test(href)) return inner;
    var img = inner.match(/<img\b[^>]*>/i); var label = dec(inner.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
    if (img) { var alt = attr(img[0], 'alt'), src = attr(img[0], 'src'); return ' [picture link: ' + href + (alt ? ' | picture: ' + alt : '') + (isPic(src) ? ' | image: ' + src : '') + (label ? ' | ' + label : '') + '] '; }
    return ' ' + label + ' [link: ' + href + '] ';
  });
  t = t.replace(/<img\b[^>]*>/gi, function (tag) { var alt = attr(tag, 'alt'), src = attr(tag, 'src'); var map = /streetview|maps\.googleapis/i.test(src); return (alt || map) ? ' [picture: ' + alt + (map ? ' | ' + src : '') + '] ' : ' '; });
  t = t.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|tr|h\d|table)>/gi, '\n').replace(/<\/t[dh]>/gi, ' | ').replace(/<[^>]+>/g, ' ');
  t = dec(t).replace(/[ \t\u00a0]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{2,}/g, '\n').replace(/(\| *){2,}/g, '| ').trim();
  return t.slice(0, 16000);
}
/* one message again, read the same way (for emails pulled before this version) */
function message_(id) {
  try { var m = GmailApp.getMessageById(id); if (!m) return { ok: false, error: 'not_found' }; return { ok: true, id: id, body: mailText_(m), docs: pdfCount_(m) }; }
  catch (e) { return { ok: false, error: 'not_found' }; }
}
function me_() { return Session.getEffectiveUser().getEmail().toLowerCase(); }

function search_(query, max) {
  var me = me_();
  var threads = GmailApp.search(query, 0, Math.min(max, 50));
  var out = [];
  threads.forEach(function (t) {
    t.getMessages().slice(-4).forEach(function (m) {
      if (m.getFrom().toLowerCase().indexOf(me) !== -1) return;
      out.push({
        id: m.getId(), threadId: t.getId(), from: m.getFrom(), to: m.getTo(),
        subject: m.getSubject(), date: m.getDate().toISOString(),
        body: mailText_(m),
        atts: m.getAttachments({ includeInlineImages: true }).filter(function (a) { return (a.getContentType() || '').indexOf('image/') === 0; }).length,
        docs: pdfCount_(m)
      });
    });
  });
  return out;
}

function quotaLeft_() { try { return MailApp.getRemainingDailyQuota(); } catch (e) { return null; } }
function send_(req) {
  var opts = { name: req.name || '' };
  if (req.cc) opts.cc = String(req.cc);
  var body = String(req.body || '');
  if (!body) return { ok: false, error: 'empty_message' };
  var pdf = null;
  if (req.html) {
    opts.htmlBody = String(req.html);
    if (req.inline) { opts.inlineImages = {}; Object.keys(req.inline).forEach(function (k) { var x = req.inline[k]; opts.inlineImages[k] = Utilities.newBlob(Utilities.base64Decode(x.data), x.type || 'image/jpeg', k); }); }
    if (req.pdfHtml) { try { pdf = Utilities.newBlob(String(req.pdfHtml), 'text/html', 'report.html').getAs('application/pdf').setName(String(req.pdfName || 'report.pdf')); opts.attachments = [pdf]; } catch (e) { pdf = false; } }
  }
  if (req.threadId) {
    var t = GmailApp.getThreadById(req.threadId);
    if (t) {
      var me = me_();
      var msgs = t.getMessages();
      for (var i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].getFrom().toLowerCase().indexOf(me) === -1) {
          var r = msgs[i].createDraftReply(body, opts).send();
          return { ok: true, threadId: t.getId(), messageId: r.getId(), left: quotaLeft_() };
        }
      }
    }
  }
  if (!req.to) return { ok: false, error: 'no_recipient' };
  var m = GmailApp.createDraft(req.to, req.subject || '', body, opts).send();
  return { ok: true, threadId: m.getThread().getId(), messageId: m.getId(), left: quotaLeft_(), pdf: pdf === null ? undefined : !!pdf };
}

function twilioSave_(req) {
  var props = PropertiesService.getScriptProperties();
  if (req.clear) {
    ['TWILIO_SID', 'TWILIO_TOKEN', 'TWILIO_FROM'].forEach(function (k) { props.deleteProperty(k); });
    return { ok: true };
  }
  if (!req.sid || !req.token || !req.from) return { ok: false, error: 'missing_twilio_fields' };
  props.setProperties({ TWILIO_SID: String(req.sid), TWILIO_TOKEN: String(req.token), TWILIO_FROM: String(req.from) });
  return { ok: true };
}

function smsSend_(to, body) {
  var sid = prop_('TWILIO_SID'), token = prop_('TWILIO_TOKEN'), from = prop_('TWILIO_FROM');
  if (!sid || !token || !from) return { ok: false, error: 'twilio_not_set' };
  if (!to || !body) return { ok: false, error: 'missing_number_or_text' };
  var res = UrlFetchApp.fetch('https://api.twilio.com/2010-04-01/Accounts/' + sid + '/Messages.json', {
    method: 'post',
    payload: { To: to, From: from, Body: body },
    headers: { Authorization: 'Basic ' + Utilities.base64Encode(sid + ':' + token) },
    muteHttpExceptions: true
  });
  var j = {};
  try { j = JSON.parse(res.getContentText() || '{}'); } catch (e) {}
  if (res.getResponseCode() >= 300) return { ok: false, error: j.message || ('twilio_' + res.getResponseCode()) };
  return { ok: true, sid: j.sid };
}

function saveSms_(m) {
  var props = PropertiesService.getScriptProperties();
  props.setProperty('sms_' + Date.now() + '_' + Math.floor(Math.random() * 10000), JSON.stringify(m).slice(0, 8500));
  var keys = props.getKeys().filter(function (k) { return k.indexOf('sms_') === 0; }).sort();
  while (keys.length > 300) props.deleteProperty(keys.shift());
}

function smsInbox_(since) {
  var all = PropertiesService.getScriptProperties().getProperties();
  return Object.keys(all).filter(function (k) { return k.indexOf('sms_') === 0; }).sort()
    .map(function (k) { try { return JSON.parse(all[k]); } catch (e) { return null; } })
    .filter(function (m) { return m && (!since || m.at > since); });
}

/* photos attached to an email, a batch at a time (phone photos are big): skips tiny logos, converts iPhone HEIC when Google can,
   and says which ones it had to skip and why */
function pdfCount_(m) { try { return m.getAttachments().filter(isPdf_).length; } catch (e) { return 0; } }
function isPdf_(a) { return /pdf/i.test(a.getContentType() || '') || /\.pdf$/i.test(a.getName() || ''); }
function attachments_(id, max, start, kind) {
  var m = GmailApp.getMessageById(id);
  if (!m) return { ok: true, files: [], skipped: [], next: null };
  if (kind === 'pdf') {
    /* PDF deal sheets, one per call (they can be big) */
    var pdfs = m.getAttachments().filter(isPdf_), outP = [], skippedP = [], k = start || 0;
    for (; k < pdfs.length; k++) {
      if (outP.length >= Math.max(1, Math.min(max, 2))) break;
      var p = pdfs[k];
      if (p.getSize() > 15 * 1024 * 1024) { skippedP.push({ name: p.getName(), why: 'too_big', mb: Math.round(p.getSize() / 1048576) }); continue; }
      outP.push({ name: p.getName(), type: 'application/pdf', data: Utilities.base64Encode(p.copyBlob().getBytes()) });
    }
    return { ok: true, files: outP, skipped: skippedP, next: k < pdfs.length ? k : null };
  }
  var imgs = m.getAttachments({ includeInlineImages: true }).filter(function (a) { return (a.getContentType() || '').indexOf('image/') === 0 && a.getSize() >= 15000; });
  var out = [], skipped = [], bytes = 0, i = start || 0;
  for (; i < imgs.length; i++) {
    if (out.length >= max || bytes > 18 * 1024 * 1024) break;
    var a = imgs[i], ct = a.getContentType() || '', size = a.getSize();
    if (size > 10 * 1024 * 1024) { skipped.push({ name: a.getName(), why: 'too_big' }); continue; }
    var blob = a.copyBlob();
    if (/heic|heif/i.test(ct)) { try { blob = blob.getAs('image/jpeg'); ct = 'image/jpeg'; } catch (e) { skipped.push({ name: a.getName(), why: 'heic' }); continue; } }
    var b = blob.getBytes(); bytes += b.length;
    out.push({ name: a.getName(), type: ct, data: Utilities.base64Encode(b) });
  }
  return { ok: true, files: out, skipped: skipped, next: i < imgs.length ? i : null };
}

/* ---------- OfferDesk Cloud (Google Drive) ---------- */
var PART_RE = /^[a-z]+[0-9]*$/;

function cloudFolder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('CLOUD_FOLDER');
  if (id) {
    try { var f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) {}
  }
  var folder = DriveApp.createFolder('OfferDesk Cloud');
  folder.setDescription('Saved by OfferDesk Bridge. Your deals, photos and settings. Deleting this folder deletes your OfferDesk cloud data.');
  props.setProperty('CLOUD_FOLDER', folder.getId());
  // a new folder means no data yet: forget old revisions and file ids
  props.getKeys().forEach(function (k) { if (k.indexOf('cr_') === 0 || k.indexOf('cf_') === 0 || k === 'CLOUD_PHOTOS') props.deleteProperty(k); });
  return folder;
}

function photoFolder_() {
  var props = PropertiesService.getScriptProperties();
  var parent = cloudFolder_();
  var id = props.getProperty('CLOUD_PHOTOS');
  if (id) {
    try { var f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) {}
  }
  var folder = parent.createFolder('photos');
  props.setProperty('CLOUD_PHOTOS', folder.getId());
  return folder;
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function revs_() {
  var all = PropertiesService.getScriptProperties().getProperties();
  var out = {};
  Object.keys(all).forEach(function (k) { if (k.indexOf('cr_') === 0) out[k.slice(3)] = Number(all[k]) || 0; });
  return out;
}

function cloudMeta_() {
  var folder = cloudFolder_();
  return { ok: true, revs: revs_(), lease: JSON.parse(prop_('lease') || 'null'), folderUrl: folder.getUrl(), email: me_() };
}

function partFile_(name) {
  var id = prop_('cf_' + name);
  if (id) { try { var f = DriveApp.getFileById(id); if (!f.isTrashed()) return f; } catch (e) {} }
  return null;
}

function cloudGet_(names) {
  return withLock_(function () {
    cloudFolder_();
    var revs = revs_();
    var parts = {};
    names.forEach(function (n) {
      n = String(n);
      if (!PART_RE.test(n)) return;
      var f = partFile_(n);
      var data = null;
      if (f) { try { data = JSON.parse(f.getBlob().getDataAsString('UTF-8')); } catch (e) { data = null; } }
      parts[n] = { rev: revs[n] || 0, data: data };
    });
    return { ok: true, parts: parts };
  });
}

function cloudPut_(parts) {
  return withLock_(function () {
    var folder = cloudFolder_();
    var props = PropertiesService.getScriptProperties();
    var revs = revs_();
    var saved = {}, conflicts = {};
    Object.keys(parts).forEach(function (n) {
      if (!PART_RE.test(n)) return;
      var p = parts[n] || {};
      var cur = revs[n] || 0;
      if ((Number(p.base) || 0) !== cur) { conflicts[n] = cur; return; }
      var text = JSON.stringify(p.data == null ? null : p.data);
      var f = partFile_(n);
      if (f) f.setContent(text);
      else { f = folder.createFile(n + '.json', text, 'application/json'); props.setProperty('cf_' + n, f.getId()); }
      props.setProperty('cr_' + n, String(cur + 1));
      saved[n] = cur + 1;
    });
    return { ok: true, revs: saved, conflicts: conflicts };
  });
}

function lease_(req) {
  return withLock_(function () {
    var props = PropertiesService.getScriptProperties();
    var cur = JSON.parse(props.getProperty('lease') || 'null');
    var now = Date.now();
    var dev = String(req.device || '');
    if (req.release) {
      if (cur && cur.device === dev) props.deleteProperty('lease');
      return { ok: true, released: true };
    }
    if (!cur || cur.until < now || cur.device === dev || req.force) {
      cur = { device: dev, label: String(req.label || '').slice(0, 60), until: now + Math.min(Number(req.ttl) || 420000, 900000) };
      props.setProperty('lease', JSON.stringify(cur));
      return { ok: true, mine: true, lease: cur };
    }
    return { ok: true, mine: false, lease: cur };
  });
}

function photoList_() {
  var it = photoFolder_().getFiles();
  var out = [];
  while (it.hasNext()) {
    var f = it.next();
    if (f.isTrashed()) continue;
    out.push({ id: f.getName().replace(/\.[a-z]+$/i, ''), at: f.getDateCreated().toISOString() });
  }
  return { ok: true, photos: out };
}

function photoFile_(folder, id) {
  var it = folder.getFilesByName(id + '.jpg');
  while (it.hasNext()) { var f = it.next(); if (!f.isTrashed()) return f; }
  return null;
}

function photoPut_(req) {
  var id = String(req.id || '');
  if (!/^[a-z0-9]+$/i.test(id) || !req.data) return { ok: false, error: 'bad_photo' };
  var folder = photoFolder_();
  if (photoFile_(folder, id)) return { ok: true, exists: true };
  var type = String(req.type || 'image/jpeg');
  var blob = Utilities.newBlob(Utilities.base64Decode(String(req.data)), type, id + (/pdf/i.test(type) ? '.pdf' : '.jpg'));
  folder.createFile(blob).setDescription(JSON.stringify(req.meta || {}).slice(0, 900));
  return { ok: true };
}

function photoGet_(id) {
  if (!/^[a-z0-9]+$/i.test(id)) return { ok: false, error: 'bad_photo' };
  var f = photoFile_(photoFolder_(), id);
  if (!f) return { ok: false, error: 'photo_not_found' };
  var meta = {};
  try { meta = JSON.parse(f.getDescription() || '{}'); } catch (e) {}
  var b = f.getBlob();
  return { ok: true, type: b.getContentType() || 'image/jpeg', data: Utilities.base64Encode(b.getBytes()), meta: meta };
}

function photoDel_(ids) {
  var folder = photoFolder_();
  var n = 0;
  ids.slice(0, 200).forEach(function (id) {
    id = String(id);
    if (!/^[a-z0-9]+$/i.test(id)) return;
    var f = photoFile_(folder, id);
    if (f) { f.setTrashed(true); n++; }
  });
  return { ok: true, deleted: n };
}

/* ---------- open a link that came with a deal ---------- */
function fetchUrl_(url) {
  if (!/^https?:\/\//i.test(url)) return { ok: false, error: 'bad_url' };
  var folder = url.match(/drive\.google\.com\/drive\/(?:u\/\d+\/)?folders\/([\w-]{10,})/);
  if (folder) {
    try {
      var f = DriveApp.getFolderById(folder[1]); var it = f.getFiles(); var imgs = [];
      while (it.hasNext() && imgs.length < 40) { var x = it.next(); var mt = x.getMimeType() || ''; if (mt.indexOf('image/') === 0) imgs.push({ id: x.getId(), name: x.getName(), type: mt, size: x.getSize() }); }
      return { ok: true, kind: 'drive_folder', title: f.getName(), images: imgs };
    } catch (e) { return { ok: true, kind: 'blocked', status: 'drive_no_access' }; }
  }
  var file = url.match(/drive\.google\.com\/file\/d\/([\w-]{10,})/) || url.match(/drive\.google\.com\/(?:open|uc)\?(?:.*&)?id=([\w-]{10,})/);
  if (file) {
    try { var fl = DriveApp.getFileById(file[1]); var t = fl.getMimeType() || ''; return { ok: true, kind: 'drive_file', title: fl.getName(), images: t.indexOf('image/') === 0 ? [{ id: fl.getId(), name: fl.getName(), type: t, size: fl.getSize() }] : [] }; }
    catch (e) { return { ok: true, kind: 'blocked', status: 'drive_no_access' }; }
  }
  var res, hops = [], jar = {}, cur = url;
  try {
    for (var i = 0; i < 8; i++) {
      var hd = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36', 'Accept-Language': 'en-US,en;q=0.9' };
      var ck = Object.keys(jar).map(function (k) { return k + '=' + jar[k]; }).join('; '); if (ck) hd.Cookie = ck;
      res = UrlFetchApp.fetch(cur, { followRedirects: false, muteHttpExceptions: true, headers: hd });
      var ah = res.getAllHeaders(); var sc = ah['Set-Cookie'] || ah['set-cookie'];
      if (sc) [].concat(sc).forEach(function (c) { var p = String(c).split(';')[0]; var e = p.indexOf('='); if (e > 0) jar[p.slice(0, e).trim()] = p.slice(e + 1).trim(); });
      var rc = res.getResponseCode(); var loc = ah['Location'] || ah['location'];
      if (rc >= 300 && rc < 400 && loc) { cur = absUrl_(String([].concat(loc)[0]), cur); hops.push(cur); continue; }
      if (rc === 200) { var top = res.getContentText().slice(0, 5000); var mr = top.match(/<meta[^>]+http-equiv=["']?refresh["']?[^>]+content=["']?\s*\d+\s*;\s*url=([^"'>\s]+)/i); if (mr && i < 7) { cur = absUrl_(mr[1], cur); hops.push(cur); continue; } }
      break;
    }
  } catch (e) { return { ok: true, kind: 'blocked', status: 'fetch_failed', finalUrl: cur, hops: hops }; }
  var code = res.getResponseCode(); var h = res.getHeaders(); var ct = String(h['Content-Type'] || h['content-type'] || '');
  if (code >= 400) return { ok: true, kind: 'blocked', status: code, finalUrl: cur, hops: hops };
  if (ct.indexOf('image/') === 0) return { ok: true, kind: 'image', images: [{ url: cur, type: ct }], finalUrl: cur, hops: hops };
  var html = res.getContentText(); if (html.length > 2500000) html = html.slice(0, 2500000);
  var title = ((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').replace(/\s+/g, ' ').trim();
  /* "I'm not a robot" and "Just a moment..." pages: we never try to get past these */
  var titleHit = /captcha|just a moment|attention required|access denied|are you a robot|security check|verify you are human/i.test(title);
  var bodyHit = html.length < 80000 && /cf-chl|challenges\.cloudflare\.com|px-captcha|verify you are human|are you a robot|request unsuccessful|checking your browser/i.test(html.slice(0, 30000));
  if (titleHit || bodyHit) return { ok: true, kind: 'blocked', status: 'robot_check', finalUrl: cur, hops: hops };
  var imgs = [], re = /(?:src|content|data-src|href)=["']([^"']+?\.(?:jpe?g|png|webp)(?:\?[^"']*)?)["']/gi, m;
  while ((m = re.exec(html)) && imgs.length < 60) { var u = absUrl_(m[1], cur); if (imgs.indexOf(u) < 0) imgs.push(u); }
  var text = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|tr|h\d)>/gi, '\n').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim().slice(0, 40000);
  return { ok: true, kind: 'page', status: code, title: title.slice(0, 200), images: imgs, text: text, finalUrl: cur, hops: hops };
}
function absUrl_(u, base) { u = u.replace(/&amp;/g, '&'); if (/^https?:/i.test(u)) return u; if (u.indexOf('//') === 0) return 'https:' + u; var m = base.match(/^(https?:\/\/[^\/]+)/); return m ? (u.charAt(0) === '/' ? m[1] + u : m[1] + '/' + u) : u; }
function driveImage_(id) {
  try { var f = DriveApp.getFileById(id); if (f.getSize() > 7 * 1024 * 1024) return { ok: false, error: 'too_big' }; var b = f.getBlob(); return { ok: true, type: b.getContentType(), data: Utilities.base64Encode(b.getBytes()) }; }
  catch (e) { return { ok: false, error: 'drive_no_access' }; }
}

/* ---------- Maya's morning brief ---------- */
function briefSetup_(req) {
  var props = PropertiesService.getScriptProperties();
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'morningBrief') ScriptApp.deleteTrigger(t); });
  if (!req.on) { props.setProperty('BRIEF_ON', 'no'); return { ok: true, on: false }; }
  if (!req.email) return { ok: false, error: 'no_email' };
  var hour = Math.max(0, Math.min(23, Number(req.hour) || 8)); var tz = String(req.tz || Session.getScriptTimeZone());
  props.setProperties({ BRIEF_ON: 'yes', BRIEF_TO: String(req.email), BRIEF_HOUR: String(hour), BRIEF_TZ: tz });
  ScriptApp.newTrigger('morningBrief').timeBased().everyDays(1).atHour(hour).nearMinute(0).inTimezone(tz).create();
  return { ok: true, on: true, hour: hour, tz: tz };
}
function readPart_(name) { var f = partFile_(name); if (!f) return null; try { return JSON.parse(f.getBlob().getDataAsString('UTF-8')); } catch (e) { return null; } }
function morningBrief() {
  var to = prop_('BRIEF_TO'); if (!to) return { ok: false, error: 'no_email' };
  var part = readPart_('brief'); var b = part && part.v; if (!b) return { ok: false, error: 'no_brief' };
  var overnight = [];
  try {
    var agents = (b.agents || []).filter(function (x) { return /@/.test(x); }).slice(0, 40);
    if (agents.length) GmailApp.search('newer_than:1d -from:me from:(' + agents.join(' OR ') + ')', 0, 15).forEach(function (t) { var m = t.getMessages(); m = m[m.length - 1]; overnight.push({ from: m.getFrom(), subject: m.getSubject(), text: (m.getPlainBody() || '').slice(0, 300), at: m.getDate().toISOString() }); });
  } catch (e) {}
  var sec = readPart_('secrets'); var key = sec && sec.v && sec.v.apiKey; var html = null;
  if (key) { try { html = briefAI_(key, b, overnight); } catch (e) { html = null; } }
  if (!html) html = briefHtml_(b, overnight);
  var name = (b.neg || 'Maya') + ' · OfferDesk';
  var day = Utilities.formatDate(new Date(), prop_('BRIEF_TZ') || Session.getScriptTimeZone(), 'EEE, MMM d');
  var subject = 'Morning brief · ' + day + ' · ' + (b.needs || []).length + ' need you' + (overnight.length ? ' · ' + overnight.length + ' new repl' + (overnight.length === 1 ? 'y' : 'ies') : '');
  GmailApp.sendEmail(to, subject, html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 5000), { htmlBody: html, name: name });
  return { ok: true, sent: true, subject: subject };
}
function briefAI_(key, b, overnight) {
  var prompt = 'You are ' + (b.neg || 'Maya') + ', an acquisitions manager for a real estate investor. Write this morning\'s brief email in simple HTML (only h3, p, ul, li, b, a). Be short and scannable: 1) what needs his decision today, 2) replies that came in overnight, 3) deals worth a look with their deal scores and why, 4) follow-ups and price drops, 5) a one-line pipeline snapshot. Link every deal to its OfferDesk page. Use only the data below; do not invent anything. If a section is empty, skip it. No greeting fluff, no sign-off beyond your name.\n\nData from OfferDesk (as of ' + b.at + '):\n' + JSON.stringify(b).slice(0, 30000) + '\n\nEmails from agents in the last 24 hours (Gmail):\n' + JSON.stringify(overnight).slice(0, 6000);
  var res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', { method: 'post', contentType: 'application/json', muteHttpExceptions: true, headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' }, payload: JSON.stringify({ model: 'claude-sonnet-5-5', max_tokens: 2500, messages: [{ role: 'user', content: prompt }] }) });
  if (res.getResponseCode() >= 300) return null;
  var j = JSON.parse(res.getContentText()); var t = (j.content || []).filter(function (x) { return x.type === 'text'; }).map(function (x) { return x.text; }).join('').trim();
  t = t.replace(/^```(?:html)?\s*/i, '').replace(/```\s*$/, '');
  return t ? '<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#141A2E">' + t + '</div>' : null;
}
function briefHtml_(b, overnight) {
  var e = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var link = function (x) { return '<a href="' + e(b.url + '#deal/' + x.id) + '">' + e(x.addr) + '</a>'; };
  var sec = function (title, list, fn) { return list && list.length ? '<h3>' + title + '</h3><ul>' + list.map(function (x) { return '<li>' + fn(x) + '</li>'; }).join('') + '</ul>' : ''; };
  return '<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#141A2E">' +
    sec('Needs your call', b.needs, function (x) { return link(x) + ': ' + e(x.why); }) +
    sec('Replies overnight', overnight, function (x) { return e(x.from) + ': ' + e(x.subject) + ' — ' + e(x.text.slice(0, 140)); }) +
    sec('Replies waiting', b.replies, function (x) { return link(x) + (x.their ? ' · their number $' + Number(x.their).toLocaleString('en-US') : ''); }) +
    sec('Worth a look', b.top, function (x) { return link(x) + ' · score ' + x.score + ' (' + e(x.best) + ')' + (x.at80 ? ' · 80+ at $' + Number(x.at80).toLocaleString('en-US') : ''); }) +
    sec('New deals', b.newDeals, function (x) { return link(x) + ' · ' + e(x.src); }) +
    sec('Follow-ups due', b.follow, function (x) { return link(x) + ' · follow-up #' + x.step; }) +
    sec('Price drops', b.drops, function (x) { return link(x) + ' · now $' + Number(x.to).toLocaleString('en-US'); }) +
    '<p>' + e(b.statsLine || '') + '</p><p>— ' + e(b.neg || 'Maya') + '</p></div>';
}

/* ---------- Maya 24/7 ----------
   A 5-minute timer. Most ticks only look (is a device open? any new mail? is anything due?) and stop in a second.
   When there's work and no device is holding the lease, it loads OfferDesk's own code from your site and runs it. */
var WORKER_SITE = 'https://itzezi.github.io/offerdesk/';
function workerSetup_(req) {
  var props = PropertiesService.getScriptProperties();
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'workerTick') ScriptApp.deleteTrigger(t); });
  if (!req.on) { props.setProperty('WORKER_ON', 'no'); return { ok: true, on: false }; }
  if (!req.acct || !req.url) return { ok: false, error: 'missing_account' };
  props.setProperties({ WORKER_ON: 'yes', WORKER_ACCT: String(req.acct), WORKER_URL: String(req.url), WORKER_NEXT: '0', WORKER_LASTFULL: '0' });
  var every = [1, 5, 10, 15, 30].indexOf(Number(req.every)) >= 0 ? Number(req.every) : 5;
  ScriptApp.newTrigger('workerTick').timeBased().everyMinutes(every).create();
  return { ok: true, on: true, every: every };
}
function workerStatus_() {
  var p = PropertiesService.getScriptProperties().getProperties();
  var has = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'workerTick'; });
  return { ok: true, on: p.WORKER_ON === 'yes' && has, lastTick: Number(p.WORKER_LASTTICK) || 0, lastFull: Number(p.WORKER_LASTFULL) || 0, next: Number(p.WORKER_NEXT) || 0,
    last: JSON.parse(p.WORKER_LAST || 'null'), running: Number(p.WORKER_RUNNING) || 0, left: quotaLeft_() };
}
function workerDue_(p, now) {
  var lastFull = Number(p.WORKER_LASTFULL) || 0;
  if (now - lastFull > 60 * 60e3) return 'hourly check';
  if ((Number(p.WORKER_NEXT) || 0) && now >= Number(p.WORKER_NEXT)) return 'something is due';
  var since = Math.floor(Math.max(lastFull - 60e3, now - 24 * 3600e3) / 1000);
  try { if (GmailApp.search('-from:me -in:spam -in:trash -category:promotions after:' + since, 0, 1).length) return 'new mail'; } catch (e) {}
  var lastSms = Object.keys(p).filter(function (k) { return k.indexOf('sms_') === 0; }).sort().pop();
  if (lastSms && Number(lastSms.split('_')[1]) > lastFull) return 'new text';
  return '';
}
async function workerTick() {
  var props = PropertiesService.getScriptProperties();
  var p = props.getProperties(); var now = Date.now();
  props.setProperty('WORKER_LASTTICK', String(now));
  if (p.WORKER_ON !== 'yes' || !p.WORKER_ACCT || !p.WORKER_URL) return;
  if ((Number(p.WORKER_RUNNING) || 0) > now - 7 * 60e3) return;
  var lease = JSON.parse(p.lease || 'null');
  if (lease && lease.until > now && lease.device !== 'maya-247') return;
  var why = workerDue_(p, now); if (!why) return;
  props.setProperty('WORKER_RUNNING', String(now));
  var out;
  try {
    var site = p.WORKER_SITE || WORKER_SITE;
    var ver = '';
    try { ver = JSON.parse(UrlFetchApp.fetch(site + 'version.json?t=' + now, { muteHttpExceptions: true }).getContentText()).v || ''; } catch (e) {}
    var res = UrlFetchApp.fetch(site + 'worker.js?v=' + encodeURIComponent(ver || now), { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) throw new Error('could not load worker.js (' + res.getResponseCode() + ')');
    var factory = (0, eval)(res.getContentText() + '\n;OD_WORKER');
    var W = factory(workerHost_(p.WORKER_URL));
    out = await W.run({ acct: p.WORKER_ACCT, url: p.WORKER_URL, key: SECRET, deadline: now + 270e3 });
    out.why = why; out.version = W.version;
  } catch (e) {
    out = { ok: false, why: why, warn: [String((e && e.message) || e)] };
  } finally {
    var next = out && out.nextDue ? Math.min(out.nextDue, now + 60 * 60e3) : now + 60 * 60e3;
    props.setProperties({ WORKER_RUNNING: '0', WORKER_LASTFULL: String(now), WORKER_NEXT: String(next), WORKER_LAST: JSON.stringify(out || {}).slice(0, 8000) });
  }
}
function workerHost_(myUrl) {
  var mine = function (u) { u = String(u).split('?')[0]; return u === myUrl || u === ScriptApp.getService().getUrl(); };
  var resp = function (code, text, headers) {
    headers = headers || {};
    return { ok: code >= 200 && code < 300, status: code, headers: { get: function (n) { n = String(n).toLowerCase(); for (var k in headers) if (k.toLowerCase() === n) return headers[k]; return null; } },
      text: function () { return Promise.resolve(text); }, json: function () { try { return Promise.resolve(JSON.parse(text)); } catch (e) { return Promise.reject(e); } } };
  };
  return {
    device: 'maya-247',
    btoa: function (s) { return Utilities.base64Encode(Utilities.newBlob(String(s)).getBytes()); },
    atob: function (s) { return Utilities.newBlob(Utilities.base64Decode(String(s))).getDataAsString(); },
    fetch: function (url, opts) {
      try {
        opts = opts || {};
        if (mine(url)) {
          var req = JSON.parse(opts.body || '{}');
          var o = req.key === SECRET ? handle_(req) : { ok: false, error: 'wrong_secret' };
          return Promise.resolve(resp(200, JSON.stringify(o)));
        }
        var headers = {}, ct = null; var h = opts.headers || {};
        Object.keys(h).forEach(function (k) { if (k.toLowerCase() === 'content-type') ct = h[k]; else headers[k] = h[k]; });
        var params = { method: String(opts.method || 'GET').toLowerCase(), headers: headers, muteHttpExceptions: true, followRedirects: true };
        var body = opts.body;
        if (body != null && /api\.anthropic\.com/.test(url)) {
          /* one request must finish within Google's 60-second limit: Sonnet, shorter answers */
          var b = JSON.parse(body); if (/opus/.test(String(b.model || ''))) b.model = 'claude-sonnet-5-5'; if ((b.max_tokens || 0) > 4000) b.max_tokens = 4000; body = JSON.stringify(b);
        }
        if (body != null) { params.payload = String(body); params.contentType = ct || 'application/json'; }
        var r = UrlFetchApp.fetch(String(url), params);
        return Promise.resolve(resp(r.getResponseCode(), r.getContentText(), r.getHeaders()));
      } catch (e) { return Promise.reject(e); }
    }
  };
}

function prop_(k) { return PropertiesService.getScriptProperties().getProperty(k); }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
