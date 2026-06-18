// StoreSpy Background Service Worker v2.5
// FIX: Service worker bị Chrome kill sau 30s → dùng chrome.storage.session
// thay vì biến global Map (vốn bị xóa khi worker restart)

// ── PERSIST PIXELS TO SESSION STORAGE ─────────────────────────
// chrome.storage.session sống lâu hơn service worker global vars
// và được share giữa worker + popup

async function addPixel(tabId, type, id) {
  if (tabId < 0 || !id) return;
  const key = `pixels_${tabId}`;
  try {
    const stored = await chrome.storage.session.get(key);
    const data = stored[key] || { fb: [], tt: [], ga: [], gtm: [] };
    if (!data[type].includes(id)) {
      data[type].push(id);
      await chrome.storage.session.set({ [key]: data });
    }
  } catch(e) {}
}

async function getPixels(tabId) {
  const key = `pixels_${tabId}`;
  try {
    const stored = await chrome.storage.session.get(key);
    return stored[key] || { fb: [], tt: [], ga: [], gtm: [] };
  } catch(e) {
    return { fb: [], tt: [], ga: [], gtm: [] };
  }
}

// Reset khi tab navigate
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading' && changeInfo.url) {
    chrome.storage.session.remove(`pixels_${tabId}`).catch(() => {});
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.remove(`pixels_${tabId}`).catch(() => {});
});

// ── WEBREQUEST LISTENER ───────────────────────────────────────
// Bắt mọi network request đến tracking domains
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    const url = details.url;
    const tabId = details.tabId;
    if (tabId < 0) return;

    // ── FACEBOOK PIXEL ──
    // facebook.com/tr?id=PIXEL_ID
    if (url.includes('facebook.com/tr')) {
      try {
        const u = new URL(url);
        const id = u.searchParams.get('id');
        if (id && /^\d{10,20}$/.test(id)) addPixel(tabId, 'fb', id);
      } catch(e) {}
      // POST body
      if (details.requestBody?.raw) {
        try {
          const body = details.requestBody.raw
            .map(b => new TextDecoder().decode(new Uint8Array(b.bytes)))
            .join('');
          const m = body.match(/(?:^|&)id=(\d{10,20})(?:&|$)/);
          if (m) addPixel(tabId, 'fb', m[1]);
        } catch(e) {}
      }
    }
    // connect.facebook.net/signals/config/PIXEL_ID
    if (url.includes('connect.facebook.net/signals/config/')) {
      const m = url.match(/\/signals\/config\/(\d{10,20})/);
      if (m) addPixel(tabId, 'fb', m[1]);
    }
    // fbevents.js?pixelId / business id
    if (url.includes('facebook.com') && url.includes('subscribed_button_click')) {
      const m = url.match(/[?&]id=(\d{10,20})/);
      if (m) addPixel(tabId, 'fb', m[1]);
    }

    // ── TIKTOK ──
    if (url.includes('analytics.tiktok.com') || url.includes('analytics-sg.tiktok.com')) {
      try {
        const u = new URL(url);
        const id = u.searchParams.get('sdkid') || u.searchParams.get('pixel_code') || u.searchParams.get('pixelCode');
        if (id && id.length >= 10) addPixel(tabId, 'tt', id);
      } catch(e) {}
      const pm = url.match(/\/pixel\/([A-Z0-9]{15,})/i);
      if (pm) addPixel(tabId, 'tt', pm[1]);
    }

    // ── GA4 ──
    if (url.includes('google-analytics.com/g/collect') ||
        url.includes('analytics.google.com/g/collect') ||
        url.includes('/g/collect')) {
      try {
        const u = new URL(url);
        const tid = u.searchParams.get('tid');
        if (tid && (tid.startsWith('G-') || tid.startsWith('UA-'))) addPixel(tabId, 'ga', tid);
      } catch(e) {}
    }

    // ── GTM ──
    if (url.includes('googletagmanager.com/gtm.js') || url.includes('googletagmanager.com/gtag/js')) {
      try {
        const u = new URL(url);
        const id = u.searchParams.get('id');
        if (id && id.startsWith('GTM-')) addPixel(tabId, 'gtm', id);
        if (id && id.startsWith('G-')) addPixel(tabId, 'ga', id);
      } catch(e) {}
    }
  },
  { urls: [
    "*://*.facebook.com/*",
    "*://connect.facebook.net/*",
    "*://*.tiktok.com/*",
    "*://analytics.tiktok.com/*",
    "*://analytics-sg.tiktok.com/*",
    "*://www.google-analytics.com/*",
    "*://analytics.google.com/*",
    "*://*.googletagmanager.com/*",
  ]},
  ['requestBody']
);

// ── POPUP REQUESTS DATA ───────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'GET_NETWORK_PIXELS') {
    getPixels(msg.tabId).then(data => {
      sendResponse({
        fbPixels: data.fb || [],
        ttPixels: data.tt || [],
        gaIds:    data.ga || [],
        gtmIds:   data.gtm || [],
      });
    });
    return true; // async response
  }
});
