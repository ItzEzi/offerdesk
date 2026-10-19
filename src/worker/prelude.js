/* ---- Maya 24/7: browser stand-ins so OfferDesk's own code runs inside the Gmail script ---- */
var __timers = [];
var setTimeout = function (fn, ms) { __timers.push({ fn: fn, ms: ms || 0 }); return __timers.length; };
var clearTimeout = function (id) { if (id && __timers[id - 1]) __timers[id - 1].fn = null; };
var setInterval = function () { return 0; }, clearInterval = function () {};
var requestAnimationFrame = function () { return 0; };
var __store = {};
var localStorage = { getItem: function (k) { return Object.prototype.hasOwnProperty.call(__store, k) ? __store[k] : null; }, setItem: function (k, v) { __store[k] = String(v); }, removeItem: function (k) { delete __store[k]; } };
localStorage.setItem('od.device', host.device || 'maya-247');
var location = { hash: '', pathname: '/offerdesk/', search: '', protocol: 'https:', href: 'https://itzezi.github.io/offerdesk/' };
var history = { replaceState: function () {} };
var __noop = function () {};
var document = { addEventListener: __noop, removeEventListener: __noop, querySelector: function () { return null; }, querySelectorAll: function () { return []; }, getElementById: function () { return null; },
  visibilityState: 'hidden', activeElement: null, body: { classList: { add: __noop, remove: __noop } }, documentElement: { dataset: {} }, createElement: function () { return { style: {}, getContext: function () { return null; }, click: __noop, remove: __noop }; } };
var window = { addEventListener: __noop, removeEventListener: __noop, location: location, history: history, innerWidth: 1200, devicePixelRatio: 1, matchMedia: function () { return { matches: false }; }, indexedDB: undefined };
var navigator = { userAgent: 'OfferDesk worker', storage: null, sendBeacon: function () { return false; } };
var innerWidth = 1200, addEventListener = __noop;
var AbortController = function () { this.signal = { aborted: false }; this.abort = function () { this.signal.aborted = true; }; };
var fetch = function (url, opts) { return host.fetch(String(url), opts || {}); };
var btoa = host.btoa, atob = host.atob;
var URL = { createObjectURL: function () { return ''; }, revokeObjectURL: __noop };
var Blob = function (parts, opts) { this.parts = parts; this.type = (opts && opts.type) || ''; };
var FileReader = function () {}, Image = function () {};
var crypto = { getRandomValues: function (a) { for (var i = 0; i < a.length; i++) a[i] = Math.random() * 256 | 0; return a; } };
var speechSynthesis = { cancel: __noop, speak: __noop, getVoices: function () { return []; } };
var qrcode = function () { return { addData: __noop, make: __noop, createSvgTag: function () { return ''; } }; };
