/**
 * OfferDesk Bridge v3
 * Connects OfferDesk to your Gmail, optionally to a Twilio number for texts,
 * and saves your OfferDesk data (deals, photos, settings) to a Google Drive
 * folder called "OfferDesk Cloud" so every device you use sees the same desk.
 * It runs inside your own Google account. Nothing is stored anywhere else.
 * Deploy: Deploy > New deployment > Web app > Execute as: Me > Who has access: Anyone.
 */
var SECRET = 'PASTE-SECRET-HERE';

function doGet(e) {
  return json_({ ok: true, service: 'offerdesk-bridge', version: 3 });
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
    switch (req.action) {
      case 'ping': return json_({ ok: true, version: 3, cloud: true, email: Session.getEffectiveUser().getEmail(), twilio: !!prop_('TWILIO_SID'), twilioFrom: prop_('TWILIO_FROM') || '' });
      case 'cloud_meta': return json_(cloudMeta_());
      case 'cloud_get': return json_(cloudGet_(req.names || []));
      case 'cloud_put': return json_(cloudPut_(req.parts || {}));
      case 'lease': return json_(lease_(req));
      case 'photo_list': return json_(photoList_());
      case 'photo_put': return json_(photoPut_(req));
      case 'photo_get': return json_(photoGet_(String(req.id || '')));
      case 'photo_del': return json_(photoDel_(req.ids || []));
      case 'attachments': return json_({ ok: true, files: attachments_(String(req.id || ''), Number(req.max) || 6) });
      case 'search': return json_({ ok: true, messages: search_(String(req.query || ''), Number(req.max) || 30) });
      case 'send': return json_(send_(req));
      case 'twilio_save': return json_(twilioSave_(req));
      case 'sms_send': return json_(smsSend_(String(req.to || ''), String(req.body || '')));
      case 'sms_inbox': return json_({ ok: true, messages: smsInbox_(String(req.since || '')) });
      default: return json_({ ok: false, error: 'unknown_action' });
    }
  } catch (err) {
    return json_({ ok: false, error: String((err && err.message) || err) });
  }
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
        body: (m.getPlainBody() || '').slice(0, 8000),
        atts: m.getAttachments({ includeInlineImages: true }).filter(function (a) { return (a.getContentType() || '').indexOf('image/') === 0; }).length
      });
    });
  });
  return out;
}

function send_(req) {
  var opts = { name: req.name || '' };
  if (req.cc) opts.cc = String(req.cc);
  var body = String(req.body || '');
  if (!body) return { ok: false, error: 'empty_message' };
  if (req.threadId) {
    var t = GmailApp.getThreadById(req.threadId);
    if (t) {
      var me = me_();
      var msgs = t.getMessages();
      for (var i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].getFrom().toLowerCase().indexOf(me) === -1) {
          var r = msgs[i].createDraftReply(body, opts).send();
          return { ok: true, threadId: t.getId(), messageId: r.getId() };
        }
      }
    }
  }
  if (!req.to) return { ok: false, error: 'no_recipient' };
  var m = GmailApp.createDraft(req.to, req.subject || '', body, opts).send();
  return { ok: true, threadId: m.getThread().getId(), messageId: m.getId() };
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

function attachments_(id, max) {
  var m = GmailApp.getMessageById(id);
  if (!m) return [];
  var out = [];
  m.getAttachments({ includeInlineImages: true }).forEach(function (a) {
    if (out.length >= max) return;
    var ct = a.getContentType() || '';
    if (ct.indexOf('image/') !== 0 || a.getSize() > 3 * 1024 * 1024 || a.getSize() < 15000) return;
    out.push({ name: a.getName(), type: ct, data: Utilities.base64Encode(a.getBytes()) });
  });
  return out;
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
  var blob = Utilities.newBlob(Utilities.base64Decode(String(req.data)), String(req.type || 'image/jpeg'), id + '.jpg');
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

function prop_(k) { return PropertiesService.getScriptProperties().getProperty(k); }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
