/**
 * OfferDesk Bridge v2
 * Connects OfferDesk to your Gmail, and optionally to a Twilio number for texts.
 * It runs inside your own Google account. Nothing is stored anywhere else.
 * Deploy: Deploy > New deployment > Web app > Execute as: Me > Who has access: Anyone.
 */
var SECRET = 'PASTE-SECRET-HERE';

function doGet(e) {
  return json_({ ok: true, service: 'offerdesk-bridge', version: 2 });
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
      case 'ping': return json_({ ok: true, version: 2, email: Session.getEffectiveUser().getEmail(), twilio: !!prop_('TWILIO_SID'), twilioFrom: prop_('TWILIO_FROM') || '' });
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

function prop_(k) { return PropertiesService.getScriptProperties().getProperty(k); }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
