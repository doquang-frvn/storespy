// ── THEME ────────────────────────────────────────────────────
async function initTheme() {
  const s = await chrome.storage.local.get('storespy_theme');
  const theme = s['storespy_theme'] || 'auto';
  applyTheme(theme);
  document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById('theme-' + theme);
  if (btn) btn.classList.add('active');
}

function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'light') {
    root.style.setProperty('color-scheme', 'light');
  } else if (theme === 'dark') {
    root.style.setProperty('color-scheme', 'dark');
  } else {
    root.style.removeProperty('color-scheme');
  }
}

async function setTheme(theme) {
  await chrome.storage.local.set({ 'storespy_theme': theme });
  applyTheme(theme);
  document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById('theme-' + theme);
  if (btn) btn.classList.add('active');
  // Broadcast to popup
  chrome.runtime.sendMessage({ type: 'THEME_CHANGED', theme }).catch(() => {});
}

// ── HELPERS ──────────────────────────────────────────────────
function showStep(id) {
  document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function showMsg(id, text, type) {
  const el = document.getElementById(id);
  el.textContent = text;
  el.className = `msg ${type} show`;
  setTimeout(() => el.classList.remove('show'), 5000);
}

// ── INIT ─────────────────────────────────────────────────────
async function init() {
  await initTheme();
  const { pro, email } = await getLicenseStatus();
  const badge = document.getElementById('plan-badge');
  const planEmail = document.getElementById('plan-email');

  if (pro && email) {
    badge.className = 'plan-badge badge-pro';
    badge.textContent = '⚡ Pro';
    planEmail.style.display = 'block';
    planEmail.textContent = email;
    document.getElementById('pro-email-display').textContent = email;
    showStep('step-pro');
  } else {
    badge.className = 'plan-badge badge-free';
    badge.textContent = 'Free';
    showStep('step-free');
  }
}

// ── CLOSE ────────────────────────────────────────────────────
document.getElementById('close-btn').addEventListener('click', () => window.close());

// ── SEND OTP ─────────────────────────────────────────────────
document.getElementById('send-otp-btn').addEventListener('click', async () => {
  const email = document.getElementById('email-input').value.trim();
  if (!email || !email.includes('@')) {
    return showMsg('free-msg', 'Please enter a valid email address', 'error');
  }

  const btn = document.getElementById('send-otp-btn');
  btn.disabled = true;
  btn.textContent = 'Sending…';

  const res = await sendOtp(email).catch(() => ({ error: 'Network error' }));

  btn.disabled = false;
  btn.textContent = 'Send activation code';

  if (res.error) {
    const msg = res.error.includes('not found')
      ? 'No account found. Use the email you purchased with at polar.sh'
      : res.error;
    return showMsg('free-msg', msg, 'error');
  }

  // Staff bypass — activated immediately
  if (res._activated || res._staffActivated) {
    showMsg('free-msg', '✓ Pro activated!', 'success');
    setTimeout(init, 1200);
    return;
  }

  // Normal flow — show OTP step
  document.getElementById('otp-hint').textContent = `Code sent to ${email} — check your inbox`;
  showStep('step-otp');
  setTimeout(() => document.getElementById('otp-input').focus(), 100);
});

document.getElementById('email-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('send-otp-btn').click();
});

// ── VERIFY OTP ───────────────────────────────────────────────
document.getElementById('verify-otp-btn').addEventListener('click', async () => {
  const email = document.getElementById('email-input').value.trim();
  const otp   = document.getElementById('otp-input').value.trim();

  if (otp.length < 4) return showMsg('otp-msg', 'Please enter the full code', 'error');

  const btn = document.getElementById('verify-otp-btn');
  btn.disabled = true;
  btn.textContent = 'Verifying…';

  const res = await verifyOtp(email, otp).catch(() => ({ error: 'Network error' }));

  btn.disabled = false;
  btn.textContent = 'Activate Pro';

  if (res.error || !res.isPro) {
    return showMsg('otp-msg', res.error || 'Activation failed. Check your code and try again.', 'error');
  }

  showMsg('otp-msg', '✓ Pro activated!', 'success');
  setTimeout(init, 1200);
});

document.getElementById('otp-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('verify-otp-btn').click();
});

document.getElementById('otp-input').addEventListener('input', e => {
  const val = e.target.value.replace(/\D/g, '');
  e.target.value = val;
  if (val.length === 6) setTimeout(() => document.getElementById('verify-otp-btn').click(), 300);
});

// ── BACK ────────────────────────────────────────────────────
document.getElementById('back-btn').addEventListener('click', () => showStep('step-free'));

// ── LOGOUT ───────────────────────────────────────────────────
document.getElementById('logout-btn').addEventListener('click', async () => {
  if (confirm('Sign out? You will lose Pro features on this device.')) {
    await logout();
    init();
  }
});

init();
