// StoreSpy popup.js v2.0
// Features: tabs, products, history, CSV export, page speed, brand colors, full pixels

// ── STATE ────────────────────────────────────────────────────────
let currentData = null;
let currentTab = 'overview';

// ── HELPERS ──────────────────────────────────────────────────────
function platformIcon(p) {
  if (!p) return '🌐';
  const s = p.toLowerCase();
  if (s.includes('shopify')) return '🛍️';
  if (s.includes('woocommerce')) return '🛒';
  if (s.includes('bigcommerce')) return '🏪';
  if (s.includes('squarespace')) return '⬜';
  if (s.includes('webflow')) return '💎';
  if (s.includes('gearlaunch')) return '⚙️';
  if (s.includes('magento')) return '🟠';
  if (s.includes('prestashop')) return '🏪';
  if (s.includes('opencart')) return '🛍️';
  if (s.includes('salesforce')) return '☁️';
  if (s.includes('ecwid')) return '🔷';
  if (s.includes('tiendanube') || s.includes('nuvemshop')) return '🌩️';
  if (s.includes('wordpress')) return '📝';
  if (s.includes('magento')) return '🛒';
  if (s.includes('prestashop')) return '🏪';
  if (s.includes('opencart')) return '🛍️';
  if (s.includes('ecwid')) return '🔷';
  if (s.includes('wordpress')) return '📝';
  if (s.includes('senprints')) return '🖨️';
  if (s.includes('shopbase') || s.includes('printbase')) return '🏬';
  if (s.includes('mayzing') || s.includes('gearment')) return '⚡';
  if (s.includes('shoplazza')) return '🔶';
  if (s.includes('wix')) return '🔷';
  if (s.includes('tilda')) return '🎨';
  if (s.includes('sellfy') || s.includes('spring') || s.includes('teespring')) return '🌱';
  if (s.includes('redbubble') || s.includes('teepublic') || s.includes('bonfire')) return '🎨';
  if (s.includes('amazon merch')) return '📦';
  return '🌐';
}
function platformCls(p) {
  if (!p) return 'other';
  const s = p.toLowerCase();
  if (s.includes('shopify')) return 'shopify';
  if (s.includes('woocommerce')) return 'woo';
  return 'other';
}

function copyText(text, el) {
  navigator.clipboard.writeText(text).then(() => {
    const orig = el.textContent;
    el.textContent = '✓';
    setTimeout(() => { el.textContent = orig; }, 1500);
  });
}

function formatNum(n) {
  if (n == null) return null;
  return n >= 1000 ? (n/1000).toFixed(1) + 'k' : String(n);
}

// ── STORAGE: History ─────────────────────────────────────────────
async function saveHistory(data) {
  const key = 'storespy_history';
  const result = await chrome.storage.local.get(key);
  let history = result[key] || [];
  const hostname = new URL(data.url).hostname;

  // ── CHANGE LOG: so sánh đầy đủ với lần scan trước ──────────
  const prev = history.find(h => h.hostname === hostname);
  if (prev) {
    const currentAppNames = (data.detectedApps || []).map(a => a.name);
    const prevAppNames = prev.apps || [];
    const addedApps = currentAppNames.filter(n => !prevAppNames.includes(n));
    const removedApps = prevAppNames.filter(n => !currentAppNames.includes(n));

    const currentPixels = [
      ...(data.fbPixels||[]).map(id => `FB:${id}`),
      ...(data.ttPixels||[]).map(id => `TT:${id}`),
      ...(data.gaIds||[]).map(id => `GA:${id}`),
      ...(data.gtmIds||[]).map(id => `GTM:${id}`),
    ];
    const prevPixels = prev.pixelKeys || [];
    const addedPixels = currentPixels.filter(p => !prevPixels.includes(p));
    const removedPixels = prevPixels.filter(p => !currentPixels.includes(p));

    const currentPayments = data.paymentMethods || [];
    const prevPayments = prev.payments || [];
    const addedPayments = currentPayments.filter(p => !prevPayments.includes(p));
    const removedPayments = prevPayments.filter(p => !currentPayments.includes(p));

    const themeChanged = prev.theme && data.theme && prev.theme !== data.theme
      ? { from: prev.theme, to: data.theme } : null;

    const prodDelta = (typeof data.productCount === 'number' && typeof prev.productCount === 'number')
      ? data.productCount - prev.productCount : null;

    const hasChanges = addedApps.length || removedApps.length ||
      addedPixels.length || removedPixels.length ||
      addedPayments.length || removedPayments.length ||
      themeChanged || (prodDelta && prodDelta !== 0);

    data._changes = {
      hasChanges: !!hasChanges,
      addedApps, removedApps,
      addedPixels, removedPixels,
      addedPayments, removedPayments,
      themeChanged,
      prodDelta,
      prevScan: prev.scanDate,
    };
    history = history.filter(h => h.hostname !== hostname);
  } else {
    data._changes = { hasChanges: false, isFirstScan: true };
  }

  const pixelKeys = [
    ...(data.fbPixels||[]).map(id => `FB:${id}`),
    ...(data.ttPixels||[]).map(id => `TT:${id}`),
    ...(data.gaIds||[]).map(id => `GA:${id}`),
    ...(data.gtmIds||[]).map(id => `GTM:${id}`),
  ];

  history.unshift({
    hostname,
    url: data.url,
    platform: data.platform,
    theme: data.theme,
    apps: (data.detectedApps || []).map(a => a.name),
    fbPixels: data.fbPixels || [],
    pixelKeys,
    payments: data.paymentMethods || [],
    scanDate: new Date().toISOString(),
    productCount: data.productCount,
    lastChanges: data._changes,
    watchlisted: prev?.watchlisted || false,
  });

  // Keep last 50
  history = history.slice(0, 50);
  await chrome.storage.local.set({ [key]: history });
  return history;
}

async function getHistory() {
  const result = await chrome.storage.local.get('storespy_history');
  return result['storespy_history'] || [];
}

// ── CSV EXPORT ───────────────────────────────────────────────────
// ── ESCAPE HELPER ──────────────────────────────────────────────
// Dữ liệu render vào innerHTML có thể chứa HTML lạ từ store thật
// (product title, theme name, email...) — luôn escape trước khi render.
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Validate URL trước khi mở — chỉ cho phép http/https
function safeUrl(u) {
  try {
    const parsed = new URL(u);
    return ['http:', 'https:'].includes(parsed.protocol) ? u : '#';
  } catch(e) { return '#'; }
}

function exportCSV(data) {
  const hostname = new URL(data.url).hostname;
  const rows = [
    ['Field', 'Value'],
    ['URL', data.url],
    ['Platform', data.platform || ''],
    ['Theme', data.theme || ''],
    ['Currency', data.currency || ''],
    ['Language', data.language || ''],
    ['Product Count', data.productCount != null ? data.productCount : ''],
    ['Contact Email', data.contactEmail || ''],
    ['Facebook Pixels', (data.fbPixels || []).join('; ')],
    ['TikTok Pixels', (data.ttPixels || []).join('; ')],
    ['GA4 IDs', (data.gaIds || []).join('; ')],
    ['GTM IDs', (data.gtmIds || []).join('; ')],
    ['MS Clarity', data.clarityId || ''],
    ['Snap Pixel', data.snapPixel ? 'Yes' : 'No'],
    ['Pinterest Pixel', data.pinterestPixel ? 'Yes' : 'No'],
    ['Payment Methods', (data.paymentMethods || []).join('; ')],
    ['Apps Detected', (data.detectedApps || []).map(a => a.name).join('; ')],
    ['Social Instagram', data.socialLinks?.instagram || ''],
    ['Social Facebook', data.socialLinks?.facebook || ''],
    ['Social TikTok', data.socialLinks?.tiktok || ''],
    ['Social Twitter', data.socialLinks?.twitter || ''],
    ['Page Load (ms)', data.pageSpeed?.loadTime || ''],
    ['Script Count', data.pageSpeed?.scriptCount || ''],
    ['Third-party Scripts', data.pageSpeed?.thirdPartyCount || ''],
    ['Primary Color', data.brandColors?.primary || ''],
    ['Fonts', (data.brandColors?.fonts || []).join('; ')],
    ['Traffic Tier', data.trafficTier || ''],
    ['Scan Date', new Date().toISOString()],
  ];

  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `storespy-${hostname}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── EXPORT ALL HISTORY AS CSV (bulk, for agency/research) ────────
function exportHistoryCSV(history) {
  if (!history || !history.length) return;

  const headers = [
    'domain', 'platform', 'theme', 'apps', 'apps_count',
    'fb_pixels', 'tiktok_pixels', 'ga4_ids', 'gtm_ids',
    'payments', 'products_count', 'watchlisted',
    'last_scan', 'has_changes', 'changes_summary',
  ];

  const rows = [headers];

  history.forEach(entry => {
    const c = entry.lastChanges;
    let changesSummary = '';
    if (c?.hasChanges) {
      const parts = [];
      if (c.addedApps?.length) parts.push(`+apps:${c.addedApps.join('|')}`);
      if (c.removedApps?.length) parts.push(`-apps:${c.removedApps.join('|')}`);
      if (c.addedPixels?.length) parts.push(`+pixels:${c.addedPixels.join('|')}`);
      if (c.removedPixels?.length) parts.push(`-pixels:${c.removedPixels.join('|')}`);
      if (c.themeChanged) parts.push(`theme:${c.themeChanged.from}->${c.themeChanged.to}`);
      if (c.prodDelta) parts.push(`products:${c.prodDelta > 0 ? '+' : ''}${c.prodDelta}`);
      changesSummary = parts.join('; ');
    }

    rows.push([
      entry.hostname,
      entry.platform || '',
      entry.theme || '',
      (entry.apps || []).join('; '),
      (entry.apps || []).length,
      (entry.fbPixels || []).join('; '),
      (entry.pixelKeys||[]).filter(p=>p.startsWith('TT:')).map(p=>p.slice(3)).join('; '),
      (entry.pixelKeys||[]).filter(p=>p.startsWith('GA:')).map(p=>p.slice(3)).join('; '),
      (entry.pixelKeys||[]).filter(p=>p.startsWith('GTM:')).map(p=>p.slice(4)).join('; '),
      (entry.payments || []).join('; '),
      entry.productCount != null ? entry.productCount : '',
      entry.watchlisted ? 'Yes' : 'No',
      entry.scanDate,
      c?.hasChanges ? 'Yes' : 'No',
      changesSummary,
    ]);
  });

  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `storespy-history-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── TABS ─────────────────────────────────────────────────────────
function setTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.nav-tab').forEach(el => {
    el.classList.toggle('active', el.dataset.tab === tab);
  });
  document.querySelectorAll('.tab-pane').forEach(el => {
    el.style.display = el.dataset.pane === tab ? 'block' : 'none';
  });
}

// ── RENDER OVERVIEW ──────────────────────────────────────────────
function renderOverview(data) {
  const pCls = platformCls(data.platform);
  const pIcon = platformIcon(data.platform);
  let hostname = '';
  try { hostname = new URL(data.url).hostname; } catch(e) { hostname = data.url; }

  let h = '';

  // Platform banner with confidence
  const confColor = data.platformConfidence === 'High' ? 'var(--green)'
    : data.platformConfidence === 'Medium' ? 'var(--yellow)' : 'var(--muted)';
  const confLabel = data.platformConfidence ? `
    <span style="font-size:9px;color:${confColor};margin-left:6px;font-weight:600" title="Detection confidence: ${(data.platformEvidence||[]).length} signals matched">
      ${data.platformConfidence === 'High' ? '●●●' : data.platformConfidence === 'Medium' ? '●●○' : '●○○'} ${data.platformConfidence}
    </span>` : '';

  h += `<div class="platform-banner ${pCls}">
    <div class="p-logo">${pIcon}</div>
    <div class="p-info">
      <div class="p-name">${esc(data.platform)}${confLabel}</div>
      <div class="p-sub">${esc(data.shopDomain || hostname)}</div>
    </div>
    <div class="p-badge badge-${pCls}">${data.isHeadless ? 'Headless' : 'Live'}</div>
  </div>`;

  // ── CHANGE LOG (full diff vs last scan) ────────────────────
  if (data._changes?.isFirstScan) {
    h += `<div class="changes-alert" style="border-color:rgba(91,141,246,.2);background:rgba(91,141,246,.04)">
      <div class="changes-title" style="color:var(--accent)">🆕 First scan of this store</div>
      <div class="changes-row">Scan again later to see what changes</div>
    </div>`;
  } else if (data._changes?.hasChanges) {
    const prevDate = new Date(data._changes.prevScan).toLocaleDateString();
    const c = data._changes;
    h += `<div class="changes-alert">
      <div class="changes-title">⚡ Changes since ${prevDate}</div>`;
    if (c.addedApps?.length) h += `<div class="changes-row added">+ App added: ${c.addedApps.join(', ')}</div>`;
    if (c.removedApps?.length) h += `<div class="changes-row removed">− App removed: ${c.removedApps.join(', ')}</div>`;
    if (c.addedPixels?.length) h += `<div class="changes-row added">+ Tracking added: ${c.addedPixels.map(p=>p.split(':')[0]).join(', ')}</div>`;
    if (c.removedPixels?.length) h += `<div class="changes-row removed">− Tracking removed: ${c.removedPixels.map(p=>p.split(':')[0]).join(', ')}</div>`;
    if (c.addedPayments?.length) h += `<div class="changes-row added">+ Payment added: ${c.addedPayments.join(', ')}</div>`;
    if (c.removedPayments?.length) h += `<div class="changes-row removed">− Payment removed: ${c.removedPayments.join(', ')}</div>`;
    if (c.themeChanged) h += `<div class="changes-row">↻ Theme changed: ${c.themeChanged.from} → ${c.themeChanged.to}</div>`;
    if (c.prodDelta) h += `<div class="changes-row ${c.prodDelta>0?'added':'removed'}">${c.prodDelta>0?'+':''}${c.prodDelta} products</div>`;
    h += `</div>`;
  } else if (data._changes && !data._changes.hasChanges) {
    const prevDate = new Date(data._changes.prevScan).toLocaleDateString();
    h += `<div class="changes-alert" style="border-color:rgba(107,122,153,.15);background:rgba(107,122,153,.03)">
      <div class="changes-title" style="color:var(--muted)">✓ No changes since ${prevDate}</div>
    </div>`;
  }

  // Store Info
  h += `<div class="section">
    <div class="sec-head">📋 Store Info</div>`;

  const rows = [
    ['Theme',    data.theme || null],
    ['Currency', data.currency || null],
    ['Language', data.language || null],
    ['Products', data.productCount != null ? formatNum(data.productCount) + ' products' : null],
    ['Email',    data.contactEmail || null],
  ];
  rows.forEach(([label, val]) => {
    h += `<div class="row"><div class="rl">${esc(label)}</div><div class="rv ${val ? '' : 'muted'}">${esc(val) || '—'}</div></div>`;
  });

  if (data.shopDomain) {
    h += `<div class="row"><div class="rl">Shop ID</div><div class="rv" style="display:flex;align-items:center;gap:5px">
      <span style="font-size:11px;font-family:monospace">${esc(data.shopDomain)}</span>
      <span class="copy-chip" data-copy="${esc(data.shopDomain)}">Copy</span>
    </div></div>`;
  }
  if (data.socialLinks && Object.keys(data.socialLinks).length > 0) {
    const icons = {instagram:'📸',facebook:'📘',tiktok:'🎵',twitter:'🐦',youtube:'▶️',pinterest:'📌'};
    const links = Object.entries(data.socialLinks)
      .map(([k,v]) => `<a class="social-link" href="${esc(safeUrl(v))}" target="_blank">${icons[k]||'🔗'} ${esc(k)}</a>`).join('');
    h += `<div class="row"><div class="rl">Social</div><div class="rv"><div class="social-row">${links}</div></div></div>`;
  }
  h += `</div>`;

  // Page Speed
  if (data.pageSpeed) {
    const ps = data.pageSpeed;
    const speedColor = ps.loadTime < 2000 ? 'var(--green)' : ps.loadTime < 4000 ? 'var(--yellow)' : 'var(--red)';
    h += `<div class="section">
      <div class="sec-head">⚡ Page Speed</div>
      <div class="speed-row">
        <div class="speed-item">
          <div class="speed-val" style="color:${speedColor}">${(ps.loadTime/1000).toFixed(1)}s</div>
          <div class="speed-label">Load time</div>
        </div>
        <div class="speed-item">
          <div class="speed-val">${ps.scriptCount}</div>
          <div class="speed-label">Scripts total</div>
        </div>
        <div class="speed-item">
          <div class="speed-val">${ps.thirdPartyCount}</div>
          <div class="speed-label">3rd party</div>
        </div>
        <div class="speed-item">
          <div class="speed-val" style="color:${ps.hasLazyLoad ? 'var(--green)' : 'var(--muted)'}">${ps.hasLazyLoad ? 'Yes' : 'No'}</div>
          <div class="speed-label">Lazy load</div>
        </div>
      </div>`;
    if (ps.seoIssues && ps.seoIssues.length > 0) {
      h += `<div class="seo-issues">${ps.seoIssues.map(i => `<span class="seo-chip">${i}</span>`).join('')}</div>`;
    }
    h += `</div>`;
  }

  // Brand Colors
  if (data.brandColors && (data.brandColors.colors.length || data.brandColors.fonts.length)) {
    h += `<div class="section">
      <div class="sec-head">🎨 Brand Identity</div>
      <div class="row"><div class="rl">Colors</div><div class="rv">
        <div class="color-swatches">`;
    data.brandColors.colors.forEach(c => {
      h += `<div class="swatch" style="background:${c}" title="${c}" data-copy="${c}"></div>`;
    });
    h += `</div></div></div>`;
    if (data.brandColors.fonts.length) {
      h += `<div class="row"><div class="rl">Fonts</div><div class="rv">${data.brandColors.fonts.slice(0,3).join(', ')}</div></div>`;
    }
    h += `</div>`;
  }

  // Traffic Tier
  const tier = data.trafficTier || 'Low';
  const tierCls = tier.toLowerCase();
  h += `<div class="section">
    <div class="sec-head">📈 Activity Level</div>
    <div class="tier-row">
      <div class="rl">Level</div>
      <div class="tier-dots">
        ${[1,2,3].map(i => `<div class="td ${i <= {High:3,Medium:2,Low:1}[tier] ? 'on '+tierCls : ''}"></div>`).join('')}
      </div>
      <div class="tier-text ${tierCls}">${tier}</div>
      <div class="tier-note">from tool stack</div>
    </div>
  </div>`;

  // Payment methods
  if (data.paymentMethods && data.paymentMethods.length > 0) {
    h += `<div class="section">
      <div class="sec-head">💳 Payments</div>
      <div class="tag-row">${data.paymentMethods.map(p=>`<span class="tag">${p}</span>`).join('')}</div>
    </div>`;
  }

  return h;
}

// ── RENDER PIXELS ────────────────────────────────────────────────
function renderPixels(data) {
  let h = '<div class="section" style="margin:0">';
  h += '<div class="sec-head">📡 Tracking & Analytics</div>';
  h += '<div class="pixels-list">';

  const hasAny = (data.fbPixels?.length || data.ttPixels?.length ||
    data.gaIds?.length || data.gtmIds?.length || data.clarityId ||
    data.snapPixel || data.pinterestPixel);

  if (!hasAny) {
    h += '<div class="pixel-empty">No tracking pixels detected</div>';
  }

  const srcLabel = (key) => {
    const s = data.pixelSources?.[key];
    return s ? `<span style="font-size:8px;color:var(--muted);margin-left:4px" title="Source: ${s}">· ${s}</span>` : '';
  };

  if (data.fbPixels?.length) {
    data.fbPixels.forEach(id => {
      h += `<div class="px-item"><span class="px-badge fb">📘 FB Pixel</span>
        <span class="px-id">${id}${srcLabel('FB:'+id)}</span>
        <span class="copy-chip" data-copy="${id}">Copy</span></div>`;
    });
  }
  if (data.ttPixels?.length) {
    data.ttPixels.forEach(id => {
      h += `<div class="px-item"><span class="px-badge tt">🎵 TikTok</span>
        <span class="px-id">${id}${srcLabel('TT:'+id)}</span>
        <span class="copy-chip" data-copy="${id}">Copy</span></div>`;
    });
  }
  if (data.gaIds?.length) {
    data.gaIds.forEach(id => {
      h += `<div class="px-item"><span class="px-badge ga">📊 GA4</span>
        <span class="px-id">${id}${srcLabel('GA:'+id)}</span>
        <span class="copy-chip" data-copy="${id}">Copy</span></div>`;
    });
  }
  if (data.gtmIds?.length) {
    data.gtmIds.forEach(id => {
      h += `<div class="px-item"><span class="px-badge gtm">🏷️ GTM</span>
        <span class="px-id">${id}${srcLabel('GTM:'+id)}</span>
        <span class="copy-chip" data-copy="${id}">Copy</span></div>`;
    });
  }
  if (data.clarityId) {
    h += `<div class="px-item"><span class="px-badge ms">🔵 Clarity</span>
      <span class="px-id">${data.clarityId !== 'detected' ? data.clarityId : 'Detected'}</span>
      ${data.clarityId !== 'detected' ? `<span class="copy-chip" data-copy="${data.clarityId}">Copy</span>` : ''}
    </div>`;
  }
  if (data.snapPixel) h += `<div class="px-item"><span class="px-badge snap">👻 Snapchat</span><span class="px-id muted">Detected</span></div>`;
  if (data.pinterestPixel) h += `<div class="px-item"><span class="px-badge pin">📌 Pinterest</span><span class="px-id muted">Detected</span></div>`;
  if (data.fbPixel && !data.fbPixels?.length) h += `<div class="px-item"><span class="px-badge fb">📘 FB Pixel</span><span class="px-id muted">Detected — click Rescan after page fully loads</span></div>`;
  if (data.ttPixel && !data.ttPixels?.length) h += `<div class="px-item"><span class="px-badge tt">🎵 TikTok</span><span class="px-id muted">Detected — click Rescan after page fully loads</span></div>`;

  h += `</div>
  <div style="padding:6px 12px 8px;border-top:1px solid var(--border);">
    <button id="rescan-pixels-btn" style="width:100%;padding:6px;border-radius:6px;background:rgba(91,141,246,.1);color:var(--accent);border:1px solid rgba(91,141,246,.2);font-size:11px;font-weight:600;cursor:pointer;">
      ↻ Rescan Pixels (wait for page to fully load first)
    </button>
  </div></div>`;
  return h;
}

// ── RENDER APPS ──────────────────────────────────────────────────
function renderApps(data) {
  const detected = data.detectedApps || [];
  const grouped = {};
  detected.forEach(app => {
    if (!grouped[app.category]) grouped[app.category] = [];
    grouped[app.category].push(app);
  });

  let h = `<div class="apps-header-bar">
    <span>🔌 Apps & Plugins</span>
    <span class="apps-count">${detected.length}</span>
  </div>
  <div class="apps-body" id="apps-body">`;

  if (detected.length === 0) {
    h += '<div class="no-apps">No known apps detected</div>';
  } else {
    // Search bar
    h = `<div style="padding:8px 12px 0"><input class="app-search" id="app-search" type="text" placeholder="Search apps…"></div>` + h;
    Object.entries(grouped).forEach(([cat, apps]) => {
      h += `<div class="app-cat" data-cat="${cat}">${cat}</div>`;
      apps.forEach(app => {
        h += `<div class="app-item" data-name="${app.name.toLowerCase()}">
          <span class="app-icon">${app.icon}</span>
          <span class="app-name">${esc(app.name)}</span>
        </div>`;
      });
    });
  }

  h += '</div>';
  return h;
}

// ── RENDER PRODUCTS ──────────────────────────────────────────────
function renderProducts(data) {
  const products = data.products || [];
  let h = `<div class="apps-header-bar">
    <span>🛍️ Top Products</span>
    ${data.productCount != null ? `<span class="apps-count">${formatNum(data.productCount)} total</span>` : ''}
  </div>`;

  if (!data.platform?.includes('Shopify')) {
    h += '<div class="no-apps" style="padding:24px 12px;text-align:center;color:var(--muted)">Product list only available for Shopify stores</div>';
    return h;
  }
  if (products.length === 0) {
    h += '<div class="no-apps" style="padding:16px 12px;text-align:center;color:var(--muted)">Loading products… or /products.json is disabled</div>';
    return h;
  }

  h += '<div class="products-list">';
  products.forEach(p => {
    const price = p.variants?.[0]?.price ? `$${parseFloat(p.variants[0].price).toFixed(2)}` : '';
    const img = p.images?.[0]?.src || '';
    const varCount = p.variants?.length || 1;
    h += `<div class="product-item" data-url="${esc(safeUrl(p.url || '#'))}">
      <div class="product-img">${img ? `<img src="${img}" alt="">` : '🛒'}</div>
      <div class="product-info">
        <div class="product-title">${esc(p.title)}</div>
        <div class="product-meta">${price}${varCount > 1 ? ` · ${varCount} variants` : ''}</div>
      </div>
    </div>`;
  });
  h += '</div>';
  return h;
}

// ── RENDER HISTORY ───────────────────────────────────────────────
async function renderHistory() {
  const history = await getHistory();
  let h = `<div class="apps-header-bar">
    <span>📚 Scan History</span>
    <span class="apps-count">${history.length}/50</span>
  </div>`;

  if (history.length === 0) {
    h += '<div class="no-apps">No stores scanned yet</div>';
    return h;
  }

  h += '<div class="history-list">';
  history.forEach(entry => {
    const d = new Date(entry.scanDate);
    const dateStr = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
    const icon = platformIcon(entry.platform);
    h += `<div class="history-item" data-url="${esc(safeUrl(entry.url))}">
      <div class="history-icon">${icon}</div>
      <div class="history-info">
        <div class="history-host">${esc(entry.hostname)}</div>
        <div class="history-meta">${esc(entry.platform || '?')} · ${entry.apps.length} apps · ${dateStr}</div>
      </div>
    </div>`;
  });
  h += '</div>';

  h += `<div style="padding:8px 12px;border-top:1px solid var(--border)">
    <button class="clear-btn" id="clear-history">Clear history</button>
  </div>`;
  return h;
}

// ── MAIN RENDER ──────────────────────────────────────────────────
function renderAll(data) {
  if (!data?.platform) {
    document.getElementById('app').innerHTML = `
      <div class="not-ecom">
        <div class="ne-icon">🌐</div>
        <div class="ne-title">No eCommerce platform detected</div>
        <div class="ne-sub">This doesn't appear to be a Shopify or WooCommerce store</div>
      </div>`;
    document.getElementById('nav').style.display = 'none';
    document.getElementById('export-btn').style.display = 'none';
    return;
  }

  document.getElementById('nav').style.display = 'flex';
  document.getElementById('export-btn').style.display = 'inline-flex';

  const appEl = document.getElementById('app');
  appEl.innerHTML = `
    <div class="tab-pane" data-pane="overview">${renderOverview(data)}</div>
    <div class="tab-pane" data-pane="pixels"  style="display:none">${renderPixels(data)}</div>
    <div class="tab-pane" data-pane="apps"    style="display:none">${renderApps(data)}</div>
    <div class="tab-pane" data-pane="products" style="display:none">${renderProducts(data)}</div>
    <div class="tab-pane" data-pane="history"  style="display:none"><div id="history-content">Loading…</div></div>
  `;

  setTab(currentTab === 'history' ? 'overview' : currentTab);

  // Bind copy chips
  appEl.querySelectorAll('[data-copy]').forEach(el => {
    el.addEventListener('click', e => { e.stopPropagation(); copyText(el.dataset.copy, el); });
  });

  // Bind color swatches
  appEl.querySelectorAll('.swatch').forEach(el => {
    el.addEventListener('click', e => { e.stopPropagation(); copyText(el.dataset.copy, el); });
  });

  // App search
  const searchInput = document.getElementById('app-search');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      const q = searchInput.value.toLowerCase().trim();
      document.querySelectorAll('.app-item').forEach(el => {
        el.style.display = (!q || el.dataset.name.includes(q)) ? 'flex' : 'none';
      });
      document.querySelectorAll('.app-cat').forEach(cat => {
        const next = cat.nextElementSibling;
        const hasVisible = [...document.querySelectorAll(`.app-item[data-name*="${q}"]`)].some(el =>
          el.previousElementSibling === cat || (el.parentElement && el.parentElement.contains(cat))
        );
        cat.style.display = 'block'; // Always show cats, items handle visibility
      });
    });
  }
}

// ── PAGE SCANNER (injected) ───────────────────────────────────────
async function pageScanner(appDb, themeDb, deep) {
  const html = document.documentElement.innerHTML;
  const inlineScripts = Array.from(document.querySelectorAll('script'))
    .map(s => (s.src || '') + '\n' + (s.textContent || ''));

  // Fetch external scripts likely chứa pixel ID (GTM container, theme bundle)
  // Cách bắt pixel ID khi nó nằm trong file JS external thay vì HTML
  // Deep mode: fetch nhiều script hơn (20 thay vì 8) — POD platform thường
  // có nhiều bundle nhỏ, custom CDN, không theo pattern tên file chuẩn
  let externalSrcs = Array.from(document.querySelectorAll('script[src]'))
    .map(s => s.src)
    .filter(src =>
      src.includes('gtm.js') || src.includes('gtag/js') ||
      src.includes('googletagmanager') || src.includes('fbevents') ||
      src.includes('analytics') || src.includes('pixel') ||
      src.includes('tracking') || src.includes('/theme') ||
      src.includes('custom') || src.includes('bundle') ||
      src.includes('app.js') || src.includes('main.js')
    );

  if (deep) {
    // Deep mode: lấy thêm tất cả script same-origin chưa match pattern trên
    const allSrcs = Array.from(document.querySelectorAll('script[src]')).map(s => s.src);
    const extra = allSrcs.filter(src => !externalSrcs.includes(src));
    externalSrcs = [...externalSrcs, ...extra].slice(0, 20);
  } else {
    externalSrcs = externalSrcs.slice(0, 8);
  }

  const fetchedScripts = await Promise.all(
    externalSrcs.map(src =>
      fetch(src).then(r => r.ok ? r.text() : '').catch(() => '')
    )
  );

  const scriptTexts = [...inlineScripts, ...fetchedScripts];

  // ── ROUTE/LINK FINGERPRINT ─────────────────────────────────
  // Nhiều platform (đặc biệt POD: GearLaunch, ShopBase, Senprints)
  // lộ qua URL pattern của link/form action hơn là HTML/script text,
  // nhất là khi store dùng custom domain không có tên platform.
  let pathSignals = '';
  try {
    const links = Array.from(document.querySelectorAll('a[href]'))
      .slice(0, 200)
      .map(a => a.getAttribute('href') || '');
    const forms = Array.from(document.querySelectorAll('form[action]'))
      .map(f => f.getAttribute('action') || '');
    const metaGen = document.querySelector('meta[name="generator"]')?.content || '';
    pathSignals = [location.pathname, ...links, ...forms, metaGen].join('\n');
  } catch(e) {}

  const allText = html + '\n' + scriptTexts.join('\n') + '\n' + pathSignals;

  const r = {
    url: location.href,
    platform: null, theme: null, shopDomain: null, isHeadless: false,
    currency: null, language: document.documentElement.lang || null,
    productCount: null, contactEmail: null,
    fbPixels: [], ttPixels: [], gaIds: [], gtmIds: [],
    fbPixel: false, ttPixel: false,
    clarityId: null, snapPixel: false, pinterestPixel: false,
    paymentMethods: [], socialLinks: {}, detectedApps: [],
    trafficTier: 'Low', pageSpeed: null, brandColors: null,
  };

  // ── PLATFORM DETECTION (scoring system) ─────────────────────
  // Mỗi platform có điểm tối thiểu, tránh false positive từ keyword yếu
  const PLATFORM_DB = [
    { name: 'Shopify', min: 6, checks: [
      [/cdn\.shopify\.com/i, 6],
      [/Shopify\.shop\s*=/i, 6],
      [/Shopify\.theme/i, 5],
      [/myshopify\.com/i, 5],
      [/shopify-checkout-api-token/i, 5],
      [/\/cart\.js/i, 3],
      [/\/products\.json/i, 3],
    ]},
    { name: 'WooCommerce', min: 6, checks: [
      [/\/wp-content\/plugins\/woocommerce\//i, 7],
      [/wc-ajax=/i, 5],
      [/wc_cart_fragments/i, 5],
      [/woocommerce_params/i, 5],
      [/wc_add_to_cart_params/i, 5],
      [/class=["'][^"']*\bwoocommerce\b/i, 3],
      [/add-to-cart=\d+/i, 3],
    ]},
    { name: 'BigCommerce', min: 5, checks: [
      [/cdn\.bigcommerce\.com/i, 6],
      [/bigcommerce\.com/i, 4],
      [/BigCommerce/i, 3],
    ]},
    { name: 'Squarespace', min: 5, checks: [
      [/static\.squarespace\.com/i, 6],
      [/squarespace\.com/i, 4],
    ]},
    { name: 'Webflow', min: 5, checks: [
      [/webflow\.io/i, 6],
      [/assets-global\.website-files\.com/i, 5],
      [/webflow\.com/i, 3],
    ]},
    { name: 'Gearlaunch', min: 6, weakMin: 3, checks: [
      [/cdn\.gearlaunch\.com/i, 7],
      [/gearlaunch\.com/i, 6],
      [/gearlaunch/i, 4],
      [/\bgl[-_](product|cart|checkout|store)\b/i, 4],
      [/window\.__GL\b|__GEARLAUNCH__|GearLaunch/i, 5],
      [/data-gl-|data-gearlaunch/i, 5],
      [/checkout\.gearlaunch|gearlaunch.*checkout/i, 6],
    ]},
    { name: 'ShopBase', min: 6, weakMin: 3, checks: [
      [/shopbasecdn\.com/i, 7],
      [/shopbase\.com/i, 6],
      [/window\.__SHOPBASE__|ShopBase/i, 5],
      [/data-shopbase/i, 5],
      [/PrintBase/i, 4],
      [/checkout\.shopbase/i, 6],
    ]},
    { name: 'Senprints', min: 6, weakMin: 3, checks: [
      [/cdn\.senprints\.com/i, 7],
      [/senprints\.com/i, 6],
      [/senprints/i, 4],
      [/sp-product|sp-cart|sp-checkout/i, 4],
      [/checkout\.senprints/i, 6],
    ]},
    { name: 'Magento', min: 6, checks: [
      [/mage\/apply/i, 6],
      [/Mage\.Cookies/i, 6],
      [/\/skin\/frontend\//i, 5],
      [/"Magento"/i, 4],
    ]},
    { name: 'PrestaShop', min: 5, checks: [
      [/prestashop/i, 6],
      [/\/themes\/[^/]+\/assets\//i, 3],
    ]},
    { name: 'OpenCart', min: 5, checks: [
      [/OpenCart/i, 5],
      [/route=product/i, 4],
      [/opencart/i, 4],
    ]},
    { name: 'Salesforce Commerce', min: 6, checks: [
      [/demandware\.net/i, 7],
      [/salesforcecommerce/i, 6],
      [/dwanonymous_/i, 5],
    ]},
    { name: 'Ecwid', min: 5, checks: [
      [/app\.ecwid\.com/i, 7],
      [/Ecwid\.init/i, 6],
    ]},
    { name: 'Shoplazza', min: 6, checks: [
      [/shoplazza\.com/i, 7],
      [/cdn\.shoplazza/i, 6],
    ]},
    { name: 'Mayzing', min: 6, checks: [
      [/mayzing\.com/i, 7],
    ]},
    { name: 'Gearment', min: 6, checks: [
      [/gearment\.com/i, 7],
    ]},
    { name: 'PrintBase', min: 6, checks: [
      [/printbase\.com/i, 7],
      [/cdn\.printbase/i, 6],
    ]},
    { name: 'Wix', min: 5, checks: [
      [/static\.parastorage\.com/i, 6],
      [/wixstatic\.com/i, 6],
      [/\._wix_/i, 5],
    ]},
    { name: 'Tilda', min: 5, checks: [
      [/tildacdn\.com/i, 6],
      [/tilda\.ws/i, 5],
    ]},
    { name: 'Tiendanube', min: 5, checks: [
      [/tiendanube\.com/i, 6],
      [/nuvemshop\.com\.br/i, 6],
    ]},
    { name: 'Volusion', min: 5, checks: [
      [/volusion\.com/i, 6],
    ]},
    { name: 'Shift4Shop', min: 5, checks: [
      [/shift4shop\.com/i, 6],
      [/3dcart\.com/i, 5],
    ]},
    { name: 'Medusa', min: 5, checks: [
      [/medusajs\.com/i, 6],
    ]},
    { name: 'Lightspeed', min: 5, checks: [
      [/lightspeedhq\.com/i, 6],
      [/lightspeedcommerce/i, 5],
    ]},
    { name: 'Spring (Teespring)', min: 5, checks: [
      [/teespring\.com/i, 6],
      [/spri\.ng/i, 6],
    ]},
    { name: 'WordPress', min: 4, checks: [
      [/\/wp-content\//i, 5],
      [/\/wp-includes\//i, 5],
      [/wp-json/i, 3],
    ]},
  ];

  const scored = PLATFORM_DB.map(p => {
    let score = 0;
    const matched = [];
    for (const [rx, pts] of p.checks) {
      if (rx.test(allText)) { score += pts; matched.push(rx.source.slice(0,30)); }
    }
    return { name: p.name, score, min: p.min, weakMin: p.weakMin || null, matched };
  }).sort((a,b) => b.score - a.score);

  const strongMatches = scored.filter(p => p.score >= p.min);
  const top = strongMatches[0];
  const second = strongMatches[1];

  if (top) {
    r.platform = top.name;
    r.platformScore = top.score;
    r.platformEvidence = top.matched;
    // Confidence: High nếu top score cách top2 ít nhất 3 điểm hoặc không có top2
    // Medium nếu sát điểm, Low nếu chỉ vừa đủ min
    if (!second || top.score >= second.score + 3) {
      r.platformConfidence = top.score >= top.min + 4 ? 'High' : 'Medium';
    } else {
      r.platformConfidence = 'Medium';
    }
    if (top.score < top.min + 1) r.platformConfidence = 'Low';
    r.possiblePlatforms = strongMatches.slice(0, 3).map(s => s.name);

    // Shopify-specific extras
    if (top.name === 'Shopify') {
      const shopM = allText.match(/Shopify\.shop\s*=\s*["']([^"']+)["']/);
      if (shopM) r.shopDomain = shopM[1];
      const themePatterns = [
        /Shopify\.theme\s*=\s*\{[^}]*"name"\s*:\s*"([^"]+)"/,
        /Shopify\.theme\s*=\s*\{[^}]*'name'\s*:\s*'([^']+)'/,
        /"theme_name"\s*:\s*"([^"]+)"/,
      ];
      for (const p of themePatterns) { const m = allText.match(p); if (m) { r.theme = m[1]; break; } }
      if (!r.theme && !document.querySelector('[data-shopify]')) r.isHeadless = true;
      const countM = allText.match(/"(?:all_products_count|products_count)"\s*:\s*(\d+)/);
      if (countM) r.productCount = parseInt(countM[1]);
    }

    // WooCommerce-specific extras
    if (top.name === 'WooCommerce') {
      const bodyClass = document.body?.className || '';
      const themeM = bodyClass.match(/\btheme-([a-z0-9-]+)/i);
      if (themeM && !r.theme) r.theme = themeM[1].replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
    }
  } else {
    // Không đủ điểm cho bất kỳ platform nào ở mức "chắc chắn"
    // Kiểm tra xem có platform nào đạt weakMin để báo "Possible X"
    const weakCandidate = scored.find(p => p.weakMin && p.score >= p.weakMin);
    if (weakCandidate) {
      r.platform = `Possible ${weakCandidate.name}`;
      r.platformScore = weakCandidate.score;
      r.platformEvidence = weakCandidate.matched;
      r.platformConfidence = 'Low';
      r.possiblePlatforms = [weakCandidate.name];
    }
  }

  // Fallback: simple keyword platforms that can't be false-positived
  if (!r.platform) {
    const gen = document.querySelector('meta[name="generator"]')?.content?.toLowerCase() || '';
    if (gen.includes('wordpress')) r.platform = 'WordPress';
  }

  // Theme fallback
  if (!r.theme) {
    for (const t of themeDb) {
      if (t.match.some(m => allText.includes(m))) { r.theme = t.name; break; }
    }
  }

  // ── CURRENCY ──────────────────────────────────────────────────
  const currMeta = document.querySelector('meta[property="product:price:currency"]');
  if (currMeta) r.currency = currMeta.getAttribute('content');
  if (!r.currency) {
    for (const p of [/["']currency["']\s*:\s*["']([A-Z]{3})["']/,/Shopify\.currency\s*=\s*["']([A-Z]{3})["']/,/"shop_currency"\s*:\s*"([A-Z]{3})"/]) {
      const m = allText.match(p); if (m) { r.currency = m[1]; break; }
    }
  }

  // ── CONTACT EMAIL ─────────────────────────────────────────────
  const emails = allText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
  const cleanEmail = emails.find(e =>
    !e.includes('sentry') && !e.includes('example') && !e.includes('shopify') &&
    !e.includes('schema') && !e.includes('noreply') && !e.endsWith('.png') &&
    !e.endsWith('.js') && !e.includes('@2x') && !e.includes('woocommerce')
  );
  if (cleanEmail) r.contactEmail = cleanEmail;

  // ── SOCIAL LINKS ──────────────────────────────────────────────
  const anchors = Array.from(document.querySelectorAll('a[href]')).map(a => a.href).join('\n');
  const socials = {
    instagram: /https?:\/\/(?:www\.)?instagram\.com\/([a-zA-Z0-9_.]+)/,
    facebook:  /https?:\/\/(?:www\.)?facebook\.com\/([a-zA-Z0-9_./-]+)/,
    tiktok:    /https?:\/\/(?:www\.)?tiktok\.com\/@([a-zA-Z0-9_.]+)/,
    twitter:   /https?:\/\/(?:www\.)?(?:twitter|x)\.com\/([a-zA-Z0-9_]+)/,
    youtube:   /https?:\/\/(?:www\.)?youtube\.com\/(?:@|channel\/|c\/)([a-zA-Z0-9_-]+)/,
    pinterest: /https?:\/\/(?:www\.)?pinterest\.com\/([a-zA-Z0-9_]+)/,
  };
  for (const [name, pat] of Object.entries(socials)) {
    const m = anchors.match(pat);
    if (m) r.socialLinks[name] = m[0];
  }

  // ── PIXELS: HTML/JS SCAN ──────────────────────────────────────
  // (MAIN world pixel hook data đọc riêng qua executeScript world:MAIN)
  const fbSet = new Set();
  // HTML fallback — catches hardcoded pixels not using fbq()
  const fbPatterns = [
    /fbq\s*\(\s*['"]init['"]\s*,\s*['"](\d{10,20})['"]/g,
    /fbq\s*\(\s*['"]init['"]\s*,\s*(\d{10,20})/g,
    /"pixel[_-]?[Ii]d"\s*:\s*["']?(\d{10,20})["']?/g,
    /facebook_pixel_id['":\s]+["']?(\d{10,20})/gi,
    /facebookPixelBaseCode["'\s:]+["']?(\d{10,20})/gi,
    /["']pixelId["']\s*:\s*["'](\d{10,20})["']/g,
  ];
  for (const pat of fbPatterns) {
    const rx = new RegExp(pat.source, pat.flags);
    let m; while ((m = rx.exec(allText)) !== null) fbSet.add(m[1]);
  }
  // Also check window.fbq._queue for already-called inits
  try {
    const fbqObj = window.fbq;
    if (fbqObj && fbqObj._queue) {
      fbqObj._queue.forEach(call => {
        if (call[0] === 'init' && /^\d{10,20}$/.test(call[1])) fbSet.add(String(call[1]));
      });
    }
    // fbq.getState() on some versions
    if (fbqObj && fbqObj.getState) {
      const state = fbqObj.getState();
      (state?.pixels || []).forEach(p => { if (p.id) fbSet.add(String(p.id)); });
    }
  } catch(e) {}
  r.fbPixels = [...fbSet];
  r.fbPixel = r.fbPixels.length > 0 || allText.includes('connect.facebook.net');

  // TikTok: combine hook + HTML scan
  const ttSet = new Set();
  [/ttq\.load\s*\(\s*['"]([A-Z0-9]{15,})['"]/g,
   /"tt_pixel_id"\s*:\s*["']([A-Z0-9]{15,})["']/g].forEach(pat => {
    const rx = new RegExp(pat.source, pat.flags);
    let m; while ((m = rx.exec(allText)) !== null) ttSet.add(m[1]);
  });
  r.ttPixels = [...ttSet];
  r.ttPixel = r.ttPixels.length > 0 || allText.includes('analytics.tiktok.com');

  // Google: hook + HTML scan
  const gaSet = new Set();
  [...allText.matchAll(/['"]?(G-[A-Z0-9]{6,})['"]/g)].forEach(m => gaSet.add(m[1]));
  r.gaIds = [...gaSet];
  const gtmSet = new Set();
  [...allText.matchAll(/['"]?(GTM-[A-Z0-9]{4,})['"]/g)].forEach(m => gtmSet.add(m[1]));
  r.gtmIds = [...gtmSet];

  // ── PIXELS: OTHERS ────────────────────────────────────────────
  const clarityM = allText.match(/clarity\.ms\/tag\/([a-z0-9]+)/i);
  if (clarityM) r.clarityId = clarityM[1];
  else if (allText.includes('clarity.ms')) r.clarityId = 'detected';
  r.snapPixel      = allText.includes('sc-static.net') || allText.includes('snapchat.com/p');
  r.pinterestPixel = allText.includes('pintrk(') || allText.includes('pinterest.com/v3');

  // ── PAYMENTS ──────────────────────────────────────────────────
  [['PayPal','paypal.com'],['Stripe','stripe.com'],['Apple Pay','apple-pay'],
   ['Google Pay','google-pay'],['Klarna','klarna.com'],['Afterpay','afterpay.com'],
   ['Shop Pay','shop-pay'],['Affirm','affirm.com'],['Sezzle','sezzle.com'],
   ['Zip/Quadpay','quadpay.com'],['Amazon Pay','amazon-pay']].forEach(([n,s]) => {
    if (allText.toLowerCase().includes(s)) r.paymentMethods.push(n);
  });

  // ── APPS ──────────────────────────────────────────────────────
  for (const app of appDb) {
    if (app.name === 'WooCommerce') continue;
    if (app.match.some(p => allText.includes(p))) {
      r.detectedApps.push({ name: app.name, category: app.category, icon: app.icon });
    }
  }

  // ── PAGE SPEED ────────────────────────────────────────────────
  try {
    const perf = window.performance?.timing;
    const loadTime = perf ? (perf.loadEventEnd - perf.navigationStart) : 0;
    const allScripts = Array.from(document.querySelectorAll('script[src]'));
    const host = location.hostname;
    const thirdParty = allScripts.filter(s => s.src && !s.src.includes(host) && s.src.startsWith('http'));
    const hasLazyLoad = allText.includes('loading="lazy"') || allText.includes('data-src=');
    const metaTitle = document.title;
    const seoIssues = [];
    if (!metaTitle || metaTitle.length < 10) seoIssues.push('No title');
    if (metaTitle && metaTitle.length > 60) seoIssues.push('Title too long');
    if (!document.querySelector('meta[name="description"]')) seoIssues.push('No meta desc');
    if (!document.querySelector('link[rel="canonical"]')) seoIssues.push('No canonical');
    if (!document.querySelector('meta[property="og:image"]')) seoIssues.push('No OG image');
    r.pageSpeed = {
      loadTime: loadTime || 0,
      scriptCount: allScripts.length,
      thirdPartyCount: thirdParty.length,
      hasLazyLoad,
      seoIssues,
    };
  } catch(e) {}

  // ── BRAND COLORS ──────────────────────────────────────────────
  try {
    const rootStyle = getComputedStyle(document.documentElement);
    const colorVars = ['--color-primary','--primary-color','--accent','--brand-color',
      '--color-accent','--primary','--color-button','--btn-bg-color','--header-bg'];
    const colors = [];
    colorVars.forEach(v => {
      const val = rootStyle.getPropertyValue(v).trim();
      if (val && val.startsWith('#') && !colors.includes(val)) colors.push(val);
    });
    // Also detect from body/button styles
    const btn = document.querySelector('button.btn, .button, [class*="btn-primary"], [class*="button--primary"]');
    if (btn) {
      const bg = getComputedStyle(btn).backgroundColor;
      if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
        const hex = bg.replace(/rgba?\((\d+),\s*(\d+),\s*(\d+).*\)/, (_, r, g, b) =>
          '#' + [r,g,b].map(x => parseInt(x).toString(16).padStart(2,'0')).join(''));
        if (hex.length === 7 && !colors.includes(hex)) colors.push(hex);
      }
    }
    // Fonts from link tags
    const fontLinks = Array.from(document.querySelectorAll('link[href*="fonts.googleapis.com"]'));
    const fonts = fontLinks.map(l => {
      const m = l.href.match(/family=([^:&|]+)/);
      return m ? decodeURIComponent(m[1]).replace(/\+/g,' ').split(':')[0] : null;
    }).filter(Boolean);
    // Also CSS font-family
    const bodyFont = rootStyle.fontFamily?.split(',')[0].trim().replace(/['"]/g,'');
    if (bodyFont && bodyFont.length > 2 && !fonts.includes(bodyFont)) fonts.unshift(bodyFont);
    r.brandColors = { colors: colors.slice(0,6), fonts: fonts.slice(0,4) };
  } catch(e) {}

  // ── TRAFFIC TIER ──────────────────────────────────────────────
  const signals = [
    r.fbPixels.length > 0, r.ttPixels.length > 0, r.gaIds.length > 0,
    r.gtmIds.length > 0, !!r.clarityId,
    r.detectedApps.some(a => a.name === 'Klaviyo'),
    r.detectedApps.some(a => a.name === 'Hotjar' || a.name === 'Lucky Orange'),
    r.detectedApps.some(a => a.category === 'Subscriptions'),
    r.paymentMethods.length >= 3,
    r.detectedApps.length >= 8,
  ].filter(Boolean).length;
  r.trafficTier = signals >= 6 ? 'High' : signals >= 3 ? 'Medium' : 'Low';

  return r;
}

// ── FETCH PRODUCTS (separate, after main scan) ────────────────────
async function fetchProducts(tabId, hostname) {
  try {
    const result = await chrome.scripting.executeScript({
      target: { tabId },
      func: async () => {
        try {
          const res = await fetch('/products.json?limit=12&sort_by=best-selling');
          if (!res.ok) return null;
          const json = await res.json();
          return (json.products || []).slice(0,12).map(p => ({
            title: p.title,
            url: '/products/' + p.handle,
            images: p.images?.slice(0,1) || [],
            variants: p.variants?.slice(0,3).map(v => ({ price: v.price })) || [],
          }));
        } catch(e) { return null; }
      }
    });
    return result?.[0]?.result || [];
  } catch(e) { return []; }
}

// ── SCAN ──────────────────────────────────────────────────────────
async function scan(deep = false) {
  const appEl = document.getElementById('app');
  appEl.innerHTML = `<div class="loading"><div class="spinner"></div><div>${deep ? 'Deep scanning… checking more signals' : 'Scanning store…'}</div></div>`;
  document.getElementById('nav').style.display = 'none';
  document.getElementById('export-btn').style.display = 'none';

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    appEl.innerHTML = `<div class="not-ecom"><div class="ne-icon">⚠️</div><div class="ne-title">Cannot scan this page</div></div>`;
    return;
  }

  try {
    // Small delay so async pixel scripts have time to fire via injector hook
    // Deep mode chờ lâu hơn để bắt được script load chậm (POD platforms thường chậm hơn Shopify)
    await new Promise(res => setTimeout(res, deep ? 4500 : 2500));
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: pageScanner,
      args: [APP_DB, THEME_DB, deep]
    });

    let data = results?.[0]?.result;
    if (!data) throw new Error('No data returned');

    // ── PIXEL SOURCE TRACKING ───────────────────────────────────
    // Mỗi pixel ID gắn nhãn nguồn để hiện trong UI: "Source: network request"
    data.pixelSources = {}; // { 'FB:123456': 'DOM scan' | 'JS hook' | 'Network request' }
    (data.fbPixels||[]).forEach(id => data.pixelSources[`FB:${id}`] = 'DOM/script scan');
    (data.ttPixels||[]).forEach(id => data.pixelSources[`TT:${id}`] = 'DOM/script scan');
    (data.gaIds||[]).forEach(id => data.pixelSources[`GA:${id}`] = 'DOM/script scan');
    (data.gtmIds||[]).forEach(id => data.pixelSources[`GTM:${id}`] = 'DOM/script scan');

    // ── MERGE PIXELS FROM MAIN WORLD (injector.js hook) ────────
    // injector.js chạy ở MAIN world, lưu vào window.__STORESPY_PIXELS__
    // pageScanner chạy ở ISOLATED world → không đọc được window của MAIN
    // Phải dùng executeScript với world: 'MAIN' để đọc
    try {
      const mainResult = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: 'MAIN',
        func: () => window.__STORESPY_PIXELS__ || { fbPixels: [], ttPixels: [], gaIds: [], gtmIds: [] },
      });
      const hooked = mainResult?.[0]?.result || {};
      (hooked.fbPixels||[]).forEach(id => { if (!data.fbPixels.includes(id)) { data.fbPixels.push(id); data.pixelSources[`FB:${id}`]='JS hook (fbq)'; } });
      (hooked.ttPixels||[]).forEach(id => { if (!data.ttPixels.includes(id)) { data.ttPixels.push(id); data.pixelSources[`TT:${id}`]='JS hook (ttq)'; } });
      (hooked.gaIds||[]).forEach(id => { if (!data.gaIds.includes(id)) { data.gaIds.push(id); data.pixelSources[`GA:${id}`]='JS hook (gtag)'; } });
      (hooked.gtmIds||[]).forEach(id => { if (!data.gtmIds.includes(id)) { data.gtmIds.push(id); data.pixelSources[`GTM:${id}`]='JS hook'; } });
      data.fbPixel  = data.fbPixels.length > 0 || data.fbPixel;
      data.ttPixel  = data.ttPixels.length > 0 || data.ttPixel;
    } catch(e) {
      console.warn('StoreSpy: MAIN world pixel read failed:', e.message);
    }

    // ── MERGE NETWORK PIXELS từ background service worker ──────
    // background.js intercept webRequest đến facebook.com/tr → lấy được ID
    // kể cả pixel inject qua Shopify Customer Pixel sandbox (iframe riêng)
    try {
      const netPixels = await chrome.runtime.sendMessage({
        type: 'GET_NETWORK_PIXELS',
        tabId: tab.id,
      });
      if (netPixels) {
        (netPixels.fbPixels||[]).forEach(id => { if (!data.fbPixels.includes(id)) data.fbPixels.push(id); data.pixelSources[`FB:${id}`]='Network request'; });
        (netPixels.ttPixels||[]).forEach(id => { if (!data.ttPixels.includes(id)) data.ttPixels.push(id); data.pixelSources[`TT:${id}`]='Network request'; });
        (netPixels.gaIds||[]).forEach(id => { if (!data.gaIds.includes(id)) data.gaIds.push(id); data.pixelSources[`GA:${id}`]='Network request'; });
        (netPixels.gtmIds||[]).forEach(id => { if (!data.gtmIds.includes(id)) data.gtmIds.push(id); data.pixelSources[`GTM:${id}`]='Network request'; });

        data.fbPixels = [...new Set(data.fbPixels)];
        data.ttPixels = [...new Set(data.ttPixels)];
        data.gaIds    = [...new Set(data.gaIds)];
        data.gtmIds   = [...new Set(data.gtmIds)];

        data.fbPixel = data.fbPixels.length > 0 || data.fbPixel;
        data.ttPixel = data.ttPixels.length > 0 || data.ttPixel;
      }
    } catch(e) {
      // background might not respond in dev mode — not fatal
      console.warn('StoreSpy: network pixel merge failed:', e.message);
    }

    // Fetch products if Shopify
    if (data.platform?.includes('Shopify')) {
      data.products = await fetchProducts(tab.id);
    }

    // Save to history & get changes
    await saveHistory(data);

    currentData = data;
    renderAllGated(data);
  } catch (e) {
    appEl.innerHTML = `<div class="not-ecom">
      <div class="ne-icon">⚠️</div>
      <div class="ne-title">Cannot scan this page</div>
      <div class="ne-sub">${e.message}</div>
    </div>`;
  }
}

// ── HISTORY TAB RENDER + BIND ────────────────────────────────
let _historyWatchlistOnly = false;

async function loadHistoryTab() {
  const { pro: hPro } = await getLicenseStatus();
  const el = document.getElementById('history-content');
  el.innerHTML = await renderHistoryGated(hPro, _historyWatchlistOnly);

  // Clear history
  document.getElementById('clear-history')?.addEventListener('click', async () => {
    if (!confirm('Clear all scan history? This cannot be undone.')) return;
    await chrome.storage.local.remove('storespy_history');
    el.innerHTML = '<div class="no-apps">History cleared</div>';
  });

  // Export all history as CSV
  document.getElementById('export-history-btn')?.addEventListener('click', async () => {
    const history = await getHistory();
    exportHistoryCSV(history);
  });

  // Filter buttons
  el.querySelectorAll('.hist-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _historyWatchlistOnly = btn.dataset.filter === 'watchlist';
      loadHistoryTab();
    });
  });

  // Watchlist star toggle
  el.querySelectorAll('.watch-star').forEach(star => {
    star.addEventListener('click', async (e) => {
      e.stopPropagation();
      await toggleWatchlist(star.dataset.hostname);
      loadHistoryTab();
    });
  });

  // Click history item to open store
  el.querySelectorAll('.history-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.watch-star')) return;
      window.open(item.dataset.url, '_blank');
    });
  });
}

// ── INIT ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Tab navigation
  document.querySelectorAll('.nav-tab').forEach(el => {
    el.addEventListener('click', async () => {
      const tab = el.dataset.tab;
      setTab(tab);
      if (tab === 'history') {
        _historyWatchlistOnly = false;
        await loadHistoryTab();
      }
    });
  });

  // Export button handler is bound inside renderAllGated() based on
  // license status — DO NOT add a duplicate listener here, it would
  // let Free users bypass the CSV paywall.

  // Rescan
  document.getElementById('rescan').addEventListener('click', scan);

  // Start scan
  scan();
});

// ═══════════════════════════════════════════════════════════════
// FREEMIUM GATE LAYER
// Chạy SAU khi scan xong, TRƯỚC khi render
// Không thay đổi data gốc — chỉ tạo displayData để render
// ═══════════════════════════════════════════════════════════════

// Reusable Pro upsell block HTML
function proUpsellBlock(featureName, icon) {
  return `<div class="pro-gate">
    <div class="pg-icon">${icon}</div>
    <div class="pg-text">
      <div class="pg-title">${featureName}</div>
      <div class="pg-sub">Pro feature</div>
    </div>
    <a class="pg-btn" href="#" data-open-settings="1">Upgrade</a>
  </div>`;
}

// Mask a pixel/tracking ID: show only first 3 chars + dots
function maskId(id) {
  if (!id || id === 'detected') return '••••••••••••••';
  return id.slice(0, 3) + '•'.repeat(Math.max(8, id.length - 3));
}

// ── GATE: Render Overview (with pro gates) ───────────────────────
function renderOverviewGated(data, pro) {
  // Overview tab: most things free except page speed + brand colors
  let html = renderOverview(data);

  // Page speed: replace section with gate if not pro
  if (!pro) {
    html = html.replace(
      /<div class="section">\s*<div class="sec-head">⚡ Page Speed<\/div>[\s\S]*?<\/div>\s*<\/div>/,
      `<div class="section">
        <div class="sec-head">⚡ Page Speed</div>
        ${proUpsellBlock('Page speed & SEO score', '⚡')}
      </div>`
    );
    html = html.replace(
      /<div class="section">\s*<div class="sec-head">🎨 Brand Identity<\/div>[\s\S]*?<\/div>\s*<\/div>/,
      `<div class="section">
        <div class="sec-head">🎨 Brand Identity</div>
        ${proUpsellBlock('Brand colors & fonts', '🎨')}
      </div>`
    );
  }
  return html;
}

// ── GATE: Render Pixels (mask IDs for free) ──────────────────────
function renderPixelsGated(data, pro) {
  if (pro) return renderPixels(data);

  // Free: show pixel platforms (badges) but mask the IDs
  const hasAny = (data.fbPixels?.length || data.ttPixels?.length ||
    data.gaIds?.length || data.gtmIds?.length || data.clarityId ||
    data.snapPixel || data.pinterestPixel || data.fbPixel || data.ttPixel);

  let h = '<div class="section" style="margin:0"><div class="sec-head">📡 Tracking & Analytics</div>';
  h += '<div class="pixels-list">';

  if (!hasAny) {
    h += '<div class="pixel-empty">No tracking pixels detected</div>';
  } else {
    // Show badges with masked IDs
    const pxItems = [];
    if (data.fbPixels?.length || data.fbPixel) {
      const ids = data.fbPixels?.length ? data.fbPixels : ['detected'];
      ids.forEach(id => {
        pxItems.push(`<div class="px-item">
          <span class="px-badge fb">📘 FB Pixel</span>
          <span class="px-id masked">${maskId(id)}</span>
          <span class="px-lock" title="Pro required">🔒</span>
        </div>`);
      });
    }
    if (data.ttPixels?.length || data.ttPixel) {
      const ids = data.ttPixels?.length ? data.ttPixels : ['detected'];
      ids.forEach(id => {
        pxItems.push(`<div class="px-item">
          <span class="px-badge tt">🎵 TikTok</span>
          <span class="px-id masked">${maskId(id)}</span>
          <span class="px-lock" title="Pro required">🔒</span>
        </div>`);
      });
    }
    if (data.gaIds?.length) {
      data.gaIds.forEach(id => {
        pxItems.push(`<div class="px-item">
          <span class="px-badge ga">📊 GA4</span>
          <span class="px-id masked">${maskId(id)}</span>
          <span class="px-lock" title="Pro required">🔒</span>
        </div>`);
      });
    }
    if (data.gtmIds?.length) {
      data.gtmIds.forEach(id => {
        pxItems.push(`<div class="px-item">
          <span class="px-badge gtm">🏷️ GTM</span>
          <span class="px-id masked">${maskId(id)}</span>
          <span class="px-lock" title="Pro required">🔒</span>
        </div>`);
      });
    }
    if (data.clarityId) pxItems.push(`<div class="px-item"><span class="px-badge ms">🔵 Clarity</span><span class="px-id masked">${maskId(data.clarityId)}</span><span class="px-lock">🔒</span></div>`);
    if (data.snapPixel)    pxItems.push(`<div class="px-item"><span class="px-badge snap">👻 Snapchat</span><span class="px-id masked">••••••••</span><span class="px-lock">🔒</span></div>`);
    if (data.pinterestPixel) pxItems.push(`<div class="px-item"><span class="px-badge pin">📌 Pinterest</span><span class="px-id masked">••••••••</span><span class="px-lock">🔒</span></div>`);
    h += pxItems.join('');
  }

  h += '</div>';

  // Upsell banner under the masked IDs
  if (hasAny) {
    h += `<div class="px-upsell">
      <span>🔒 Pixel IDs hidden</span>
      <a href="#" data-open-settings="1" class="px-upsell-btn">Unlock with Pro</a>
    </div>`;
  }

  h += '</div>';
  return h;
}

// ── GATE: Render Apps (top 5 free, rest blurred) ─────────────────
function renderAppsGated(data, pro) {
  if (pro) return renderApps(data);

  const FREE_APPS_LIMIT = 5;
  const detected = data.detectedApps || [];
  const visible = detected.slice(0, FREE_APPS_LIMIT);
  const locked  = detected.slice(FREE_APPS_LIMIT);

  // Build grouped for visible
  const grouped = {};
  visible.forEach(app => {
    if (!grouped[app.category]) grouped[app.category] = [];
    grouped[app.category].push(app);
  });

  let h = `<div class="apps-header-bar">
    <span>🔌 Apps & Plugins</span>
    <span class="apps-count">${detected.length}</span>
  </div>`;

  if (detected.length === 0) {
    h += '<div class="no-apps">No known apps detected</div>';
    return h;
  }

  h += '<div class="apps-body">';
  // Show visible apps normally
  Object.entries(grouped).forEach(([cat, apps]) => {
    h += `<div class="app-cat">${cat}</div>`;
    apps.forEach(app => {
      h += `<div class="app-item">
        <span class="app-icon">${app.icon}</span>
        <span class="app-name">${esc(app.name)}</span>
      </div>`;
    });
  });

  // Show locked apps blurred
  if (locked.length > 0) {
    h += `<div class="apps-locked-banner">
      <span class="alb-count">+${locked.length} more apps</span>
      <a href="#" data-open-settings="1" class="alb-btn">Unlock with Pro →</a>
    </div>`;
    locked.slice(0, 6).forEach(app => {
      h += `<div class="app-item app-blurred">
        <span class="app-icon">${app.icon}</span>
        <span class="app-name">${esc(app.name)}</span>
      </div>`;
    });
    if (locked.length > 6) {
      h += `<div class="app-item app-blurred" style="justify-content:center;color:var(--muted)">
        + ${locked.length - 6} more…
      </div>`;
    }
  }

  h += '</div>';
  return h;
}

// ── GATE: Render Products (pro only) ─────────────────────────────
function renderProductsGated(data, pro) {
  const header = `<div class="apps-header-bar">
    <span>🛍️ Top Products</span>
    ${data.productCount != null ? `<span class="apps-count">${formatNum(data.productCount)} total</span>` : ''}
  </div>`;

  if (!data.platform?.includes('Shopify')) {
    return header + '<div class="no-apps" style="padding:20px;text-align:center;color:var(--muted)">Only available for Shopify stores</div>';
  }
  if (!pro) {
    return header + `<div class="gate-full">
      ${proUpsellBlock('Top products from store', '🛒')}
      <div class="gate-preview">
        ${[1,2,3].map(() => `<div class="product-item product-ghost">
          <div class="product-img ghost-img"></div>
          <div class="product-info">
            <div class="ghost-line" style="width:80%"></div>
            <div class="ghost-line" style="width:40%;margin-top:4px"></div>
          </div>
        </div>`).join('')}
      </div>
    </div>`;
  }
  return renderProducts(data);
}

// ── GATE: Render History (3 stores free, 50 pro) ─────────────────
async function renderHistoryGated(pro, watchlistOnly) {
  const allHistory = await getHistory();
  let history = pro ? allHistory : allHistory.slice(0, 3);
  if (watchlistOnly) history = history.filter(h => h.watchlisted);

  const watchCount = allHistory.filter(h => h.watchlisted).length;

  const header = `<div class="apps-header-bar">
    <span>${watchlistOnly ? '⭐ Watchlist' : '📚 Scan History'}</span>
    <span class="apps-count">${watchlistOnly ? watchCount : allHistory.length}${!pro && !watchlistOnly ? '/3 free' : pro && !watchlistOnly ? '/50' : ''}</span>
  </div>
  <div style="display:flex;gap:6px;padding:8px 12px;border-bottom:1px solid var(--border)">
    <button class="hist-filter-btn ${!watchlistOnly?'active':''}" data-filter="all">All (${allHistory.length})</button>
    <button class="hist-filter-btn ${watchlistOnly?'active':''}" data-filter="watchlist">⭐ Watchlist (${watchCount})</button>
  </div>`;

  if (history.length === 0) {
    const msg = watchlistOnly ? 'No stores on your watchlist yet. Click ⭐ on any store to track it.' : 'No stores scanned yet';
    return header + `<div class="no-apps">${msg}</div>`;
  }

  let h = header + '<div class="history-list">';
  history.forEach(entry => {
    const d = new Date(entry.scanDate);
    const dateStr = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
    const changeFlag = entry.lastChanges?.hasChanges
      ? `<span style="color:var(--yellow);font-size:10px;font-weight:600;margin-left:4px">⚡ changed</span>` : '';
    h += `<div class="history-item" data-url="${esc(safeUrl(entry.url))}">
      <div class="history-icon">${platformIcon(entry.platform)}</div>
      <div class="history-info" style="cursor:pointer">
        <div class="history-host">${esc(entry.hostname)}${changeFlag}</div>
        <div class="history-meta">${esc(entry.platform || '?')} · ${entry.apps.length} apps · ${dateStr}</div>
      </div>
      <span class="watch-star ${entry.watchlisted?'active':''}" data-hostname="${entry.hostname}" title="${entry.watchlisted?'Remove from watchlist':'Add to watchlist'}">${entry.watchlisted?'⭐':'☆'}</span>
    </div>`;
  });
  h += '</div>';

  if (!pro && allHistory.length > 3) {
    h += `<div class="px-upsell" style="margin:0">
      <span>+${allHistory.length - 3} older stores hidden</span>
      <a href="#" data-open-settings="1" class="px-upsell-btn">Unlock with Pro</a>
    </div>`;
  } else if (pro) {
    h += `<div style="padding:8px 12px;border-top:1px solid var(--border);display:flex;gap:6px">
      <button class="clear-btn" id="clear-history" style="flex:1">Clear history</button>
      <button class="clear-btn" id="export-history-btn" style="flex:1;background:rgba(91,141,246,.08);color:var(--accent);border-color:rgba(91,141,246,.2)">⬇ Export all CSV</button>
    </div>`;
  }
  return h;
}

async function toggleWatchlist(hostname) {
  const key = 'storespy_history';
  const result = await chrome.storage.local.get(key);
  let history = result[key] || [];
  history = history.map(h => h.hostname === hostname ? { ...h, watchlisted: !h.watchlisted } : h);
  await chrome.storage.local.set({ [key]: history });
}

// ── MAIN GATED RENDER ────────────────────────────────────────────
async function renderAllGated(data) {
  if (!data?.platform) {
    document.getElementById('app').innerHTML = `
      <div class="not-ecom">
        <div class="ne-icon">🌐</div>
        <div class="ne-title">No eCommerce platform detected</div>
        <div class="ne-sub">This doesn't appear to be a Shopify/WooCommerce store, or signals haven't loaded yet</div>
        <button id="deep-rescan-btn" style="margin-top:14px;padding:8px 16px;border-radius:8px;background:var(--accent);color:white;border:none;font-size:12px;font-weight:600;cursor:pointer;">↻ Deep Rescan (waits longer, checks more)</button>
      </div>`;
    document.getElementById('nav').style.display = 'none';
    document.getElementById('export-btn').style.display = 'none';
    document.getElementById('deep-rescan-btn')?.addEventListener('click', () => scan(true));
    return;
  }

  // Check license
  const { pro } = await getLicenseStatus();

  // Update header badge
  updatePlanBadge(pro);

  document.getElementById('nav').style.display = 'flex';
  // Export button: show for pro, show locked version for free
  const exportBtn = document.getElementById('export-btn');
  exportBtn.style.display = 'inline-flex';
  if (!pro) {
    exportBtn.textContent = '🔒 CSV';
    exportBtn.style.opacity = '0.5';
    exportBtn.title = 'Pro required';
    exportBtn.onclick = () => { openSettings(); };
  } else {
    exportBtn.textContent = '⬇ CSV';
    exportBtn.style.opacity = '1';
    exportBtn.title = 'Export to CSV';
    exportBtn.onclick = () => exportCSV(currentData);
  }

  const appEl = document.getElementById('app');
  appEl.innerHTML = `
    <div class="tab-pane" data-pane="overview">${renderOverviewGated(data, pro)}</div>
    <div class="tab-pane" data-pane="pixels"   style="display:none">${renderPixelsGated(data, pro)}</div>
    <div class="tab-pane" data-pane="apps"     style="display:none">${renderAppsGated(data, pro)}</div>
    <div class="tab-pane" data-pane="products" style="display:none">${renderProductsGated(data, pro)}</div>
    <div class="tab-pane" data-pane="history"  style="display:none"><div id="history-content">Loading…</div></div>
  `;

  setTab(currentTab === 'history' ? 'overview' : currentTab);

  // Bind copy chips (only renders for pro)
  appEl.querySelectorAll('[data-copy]').forEach(el => {
    el.addEventListener('click', e => { e.stopPropagation(); copyText(el.dataset.copy, el); });
  });
  appEl.querySelectorAll('.swatch').forEach(el => {
    el.addEventListener('click', e => { e.stopPropagation(); copyText(el.dataset.copy, el); });
  });

  // App search (only if apps visible)
  const searchInput = document.getElementById('app-search');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      const q = searchInput.value.toLowerCase().trim();
      document.querySelectorAll('.app-item:not(.app-blurred)').forEach(el => {
        el.style.display = (!q || el.dataset.name?.includes(q)) ? 'flex' : 'none';
      });
    });
  }
}

function updatePlanBadge(pro) {
  const existing = document.getElementById('plan-badge');
  if (existing) existing.remove();
  const badge = document.createElement('span');
  badge.id = 'plan-badge';
  badge.style.cssText = `font-size:9px;font-weight:700;padding:2px 7px;border-radius:8px;margin-right:4px;${
    pro ? 'background:rgba(91,141,246,.15);color:#5b8df6;border:1px solid rgba(91,141,246,.3)'
        : 'background:rgba(107,122,153,.1);color:#6b7a99;border:1px solid rgba(107,122,153,.2)'
  }`;
  badge.textContent = pro ? '⚡ Pro' : 'Free';
  badge.title = pro ? 'Pro plan active' : 'Upgrade to Pro';
  if (!pro) badge.style.cursor = 'pointer';
  if (!pro) badge.onclick = () => openSettings();
  const headerRight = document.querySelector('.header-right');
  if (headerRight) headerRight.prepend(badge);
}

// ═══════════════════════════════════════════════════════════
// SETTINGS OVERLAY (v2.4)
// ═══════════════════════════════════════════════════════════

function openSettings() {
  const ov = document.getElementById('settings-overlay');
  if (!ov) return;
  ov.style.display = 'block';
  initOverlay();
}
function closeSettings() {
  const ov = document.getElementById('settings-overlay');
  if (ov) ov.style.display = 'none';
}

async function initOverlay() {
  const { pro, email } = await getLicenseStatus();
  const badge = document.getElementById('ov-badge');
  const ovEmail = document.getElementById('ov-email');
  const upgrade = document.getElementById('ov-upgrade');
  const proSection = document.getElementById('ov-pro');

  if (pro) {
    badge.textContent = '⚡ Pro';
    badge.style.background = 'rgba(91,141,246,.15)';
    badge.style.color = 'var(--accent)';
    if (email) {
      ovEmail.style.display = 'block';
      ovEmail.textContent = email;
      document.getElementById('ov-pro-email').textContent = email;
    }
    upgrade.style.display = 'none';
    proSection.style.display = 'block';
  } else {
    badge.textContent = 'Free';
    badge.style.background = 'rgba(107,122,153,.2)';
    badge.style.color = 'var(--muted)';
    upgrade.style.display = 'block';
    proSection.style.display = 'none';
  }

  // Init theme buttons
  const theme = await getTheme();
  document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
  const active = document.getElementById('tbtn-' + theme);
  if (active) active.classList.add('active');
}

function ovShowMsg(id, text, type) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.style.display = 'block';
  el.style.background = type === 'success' ? 'rgba(52,211,153,.08)' : 'rgba(248,113,113,.08)';
  el.style.color = type === 'success' ? 'var(--green)' : 'var(--red)';
  el.style.border = type === 'success' ? '1px solid rgba(52,211,153,.2)' : '1px solid rgba(248,113,113,.2)';
  el.style.borderRadius = '6px';
  el.style.padding = '6px 10px';
  setTimeout(() => { if(el) el.style.display='none'; }, 5000);
}

async function setTheme(theme) {
  await saveTheme(theme);
  applyThemeToDOM(theme);
  document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById('tbtn-' + theme);
  if (btn) btn.classList.add('active');
}

function applyThemeToDOM(theme) {
  document.body.classList.remove('theme-light','theme-dark');
  if (theme === 'light') document.body.classList.add('theme-light');
  else if (theme === 'dark') document.body.classList.add('theme-dark');
  else {
    const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.body.classList.add(dark ? 'theme-dark' : 'theme-light');
  }
}

// Wire up overlay buttons
document.addEventListener('DOMContentLoaded', async () => {
  // Apply saved theme
  const theme = await getTheme();
  applyThemeToDOM(theme);

  // Settings button in footer opens overlay
  // settings link handled by delegation
  

  // Rescan pixels button
  document.addEventListener('click', async e => {
    if (e.target.closest('#rescan-pixels-btn')) {
      const btn = e.target.closest('#rescan-pixels-btn');
      btn.textContent = '↻ Scanning… (waiting 3s for pixels to fire)';
      btn.disabled = true;
      await new Promise(r => setTimeout(r, 3000));
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id && currentData) {
        try {
          const netPixels = await chrome.runtime.sendMessage({ type: 'GET_NETWORK_PIXELS', tabId: tab.id });
          if (netPixels?.fbPixels?.length) {
            currentData.fbPixels = [...new Set([...currentData.fbPixels, ...netPixels.fbPixels])];
            currentData.fbPixel = true;
          }
          if (netPixels?.ttPixels?.length) {
            currentData.ttPixels = [...new Set([...currentData.ttPixels, ...netPixels.ttPixels])];
            currentData.ttPixel = true;
          }
          if (netPixels?.gaIds?.length) currentData.gaIds = [...new Set([...currentData.gaIds, ...netPixels.gaIds])];
          if (netPixels?.gtmIds?.length) currentData.gtmIds = [...new Set([...currentData.gtmIds, ...netPixels.gtmIds])];
          renderAllGated(currentData);
          setTab('pixels');
        } catch(e) {}
      }
      return;
    }
  });

  // All upgrade/unlock links + plan badge → open overlay
  document.addEventListener('click', e => {
    // data-open-settings links (Upgrade, Unlock with Pro)
    if (e.target.closest('[data-open-settings]')) {
      e.preventDefault();
      openSettings();
      return;
    }
    // Footer settings link
    if (e.target.closest('a[href="settings.html"]')) {
      e.preventDefault();
      openSettings();
      return;
    }
    // Plan badge
    if (e.target.closest('#plan-badge')) {
      openSettings();
      return;
    }
    // Product item — open product URL (already validated via safeUrl())
    const prodItem = e.target.closest('.product-item:not(.product-ghost)');
    if (prodItem && prodItem.dataset.url && prodItem.dataset.url !== '#') {
      window.open(prodItem.dataset.url, '_blank');
      return;
    }
  });

  // Send OTP
  const sendBtn = document.getElementById('ov-send-btn');
  if (sendBtn) {
    sendBtn.addEventListener('click', async () => {
      const email = document.getElementById('ov-email-input').value.trim();
      if (!email || !email.includes('@')) return ovShowMsg('ov-msg1','Enter a valid email','error');
      sendBtn.disabled = true; sendBtn.textContent = 'Sending…';
      const res = await sendOtp(email).catch(() => ({error:'Network error'}));
      sendBtn.disabled = false; sendBtn.textContent = 'Send activation code';
      if (res.error) return ovShowMsg('ov-msg1', res.error.includes('not found') ? 'No account found for this email' : res.error, 'error');
      if (res._activated) { ovShowMsg('ov-msg1','✓ Pro activated!','success'); setTimeout(()=>{closeSettings();renderAllGated(currentData);},1500); return; }
      document.getElementById('ov-otp-hint').textContent = `Code sent to ${email}`;
      document.getElementById('ov-step-email').style.display = 'none';
      document.getElementById('ov-step-otp').style.display = 'block';
      setTimeout(() => document.getElementById('ov-otp-input').focus(), 100);
    });
  }

  // Verify OTP
  const verifyBtn = document.getElementById('ov-verify-btn');
  if (verifyBtn) {
    verifyBtn.addEventListener('click', async () => {
      const email = document.getElementById('ov-email-input').value.trim();
      const otp = document.getElementById('ov-otp-input').value.trim();
      if (otp.length < 4) return ovShowMsg('ov-msg2','Enter the full code','error');
      verifyBtn.disabled = true; verifyBtn.textContent = 'Verifying…';
      const res = await verifyOtp(email, otp).catch(() => ({error:'Network error'}));
      verifyBtn.disabled = false; verifyBtn.textContent = 'Activate Pro';
      if (res.error || !res.isPro) return ovShowMsg('ov-msg2', res.error || 'Invalid code. Try again.', 'error');
      ovShowMsg('ov-msg2','✓ Pro activated!','success');
      setTimeout(() => { closeSettings(); if(currentData) renderAllGated(currentData); }, 1500);
    });

    document.getElementById('ov-otp-input')?.addEventListener('input', e => {
      const val = e.target.value.replace(/\D/g,'');
      e.target.value = val;
      if (val.length === 6) setTimeout(() => verifyBtn.click(), 300);
    });
  }

  // Close overlay
  document.getElementById('ov-close-btn')?.addEventListener('click', closeSettings);

  // Back in OTP step
  document.getElementById('ov-back-btn')?.addEventListener('click', () => {
    document.getElementById('ov-step-otp').style.display = 'none';
    document.getElementById('ov-step-email').style.display = 'block';
  });

  // Theme buttons via data-theme
  document.querySelectorAll('[data-theme]').forEach(btn => {
    btn.addEventListener('click', () => setTheme(btn.dataset.theme));
  });

  // Logout
  document.getElementById('ov-logout-btn')?.addEventListener('click', async () => {
    if (confirm('Sign out of Pro?')) {
      await logout();
      _proCache = null;
      closeSettings();
      if(currentData) renderAllGated(currentData);
    }
  });
});
