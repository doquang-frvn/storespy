// StoreSpy License Manager v2.4
const WORKER = 'https://lunamode-api.doquangbk.workers.dev';
const STORESPY_PRODUCT_ID = 'ed599bba-d3fd-448e-85f2-8d58442b43df';

// ── OWNER WHITELIST ──────────────────────────────────────────
// Email chủ app — luôn được Pro full ngay, không cần gọi Worker.
// Hoạt động độc lập với server, dùng được kể cả khi Worker lỗi.
const OWNER_EMAILS = [
  'doquangbk@gmail.com',
];

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isOwnerEmail(email) {
  return OWNER_EMAILS.includes(normalizeEmail(email));
}

const SK = {
  token:      'storespy_token',
  email:      'storespy_email',
  validUntil: 'storespy_valid_until',
  isPro:      'storespy_is_pro',
  theme:      'storespy_theme',
};

let _proCache = null;

async function isPro() {
  if (_proCache !== null) return _proCache;
  const s = await chrome.storage.local.get(Object.values(SK));
  const token      = s[SK.token];
  const validUntil = s[SK.validUntil];
  const cached     = s[SK.isPro];
  if (!token) { _proCache = false; return false; }

  // Owner token — không cần gọi server, luôn Pro
  if (token === 'owner_dev_token') {
    _proCache = true;
    return true;
  }

  // Cache 24h
  if (validUntil && Date.now() < validUntil && cached !== undefined) {
    _proCache = !!cached;
    return _proCache;
  }
  // Re-verify
  try {
    const res = await fetch(`${WORKER}/check-sub`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerToken: token, productId: STORESPY_PRODUCT_ID }),
    });
    const data = await res.json();
    if (data.requireReauth) {
      await chrome.storage.local.remove(Object.values(SK));
      _proCache = false; return false;
    }
    const proStatus = data.isPro === true;
    await chrome.storage.local.set({ [SK.isPro]: proStatus, [SK.validUntil]: Date.now() + 86400000 });
    _proCache = proStatus;
    return proStatus;
  } catch(e) {
    _proCache = !!cached || false;
    return _proCache;
  }
}

async function getLicenseStatus() {
  const pro = await isPro();
  const s = await chrome.storage.local.get([SK.email, SK.token]);
  return { pro, email: s[SK.email] || null };
}

// Send OTP — worker mới: /send-otp trả về customerToken ngay (không cần OTP riêng)
async function sendOtp(email) {
  const normalized = normalizeEmail(email);

  // Owner whitelist — bypass hoàn toàn, không gọi worker
  if (isOwnerEmail(normalized)) {
    await chrome.storage.local.set({
      [SK.token]:      'owner_dev_token',
      [SK.email]:      normalized,
      [SK.isPro]:      true,
      [SK.validUntil]: Date.now() + 86400000 * 3650, // 10 năm
    });
    _proCache = true;
    return {
      ok: true,
      isPro: true,
      _activated: true,
      _staffActivated: true, // giữ cả 2 flag để tương thích settings.js cũ
      plan: 'developer',
    };
  }

  const res = await fetch(`${WORKER}/send-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const data = await res.json();
  // Staff bypass hoặc direct token: activate ngay
  if (data.ok && data.customerToken) {
    const isAllAccess = data.activeProductIds?.includes('*');
    const hasSub = isAllAccess || data.activeProductIds?.includes(STORESPY_PRODUCT_ID);
    if (hasSub) {
      await chrome.storage.local.set({
        [SK.token]:      data.customerToken,
        [SK.email]:      email,
        [SK.isPro]:      true,
        [SK.validUntil]: Date.now() + 86400000 * 30,
      });
      _proCache = true;
      data._activated = true;
    }
  }
  return data;
}

// Verify OTP — dùng customerToken đã lưu
async function verifyOtp(email, otp) {
  const s = await chrome.storage.local.get([SK.token]);
  const token = s[SK.token];
  const res = await fetch(`${WORKER}/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customerToken: token, productId: STORESPY_PRODUCT_ID }),
  });
  const data = await res.json();
  if (data.isPro && data.customerToken) {
    await chrome.storage.local.set({
      [SK.token]:      data.customerToken,
      [SK.email]:      email,
      [SK.isPro]:      true,
      [SK.validUntil]: Date.now() + 86400000,
    });
    _proCache = true;
  }
  return data;
}

async function logout() {
  await chrome.storage.local.remove([SK.token, SK.email, SK.isPro, SK.validUntil]);
  _proCache = null;
}

// Theme
async function getTheme() {
  const s = await chrome.storage.local.get(SK.theme);
  return s[SK.theme] || 'dark';
}
async function saveTheme(theme) {
  await chrome.storage.local.set({ [SK.theme]: theme });
}
