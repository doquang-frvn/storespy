// StoreSpy Pixel Injector v3 — SAFE MODE
// Chạy ở document_start, world: MAIN
//
// QUAN TRỌNG: Bản trước dùng Object.defineProperty để override window.fbq/ttq.
// Điều này làm window.fbq luôn truthy NGAY TỪ ĐẦU, khiến đoạn check
// `if (f.fbq) return;` trong snippet pixel chuẩn của Facebook trả về sớm
// và pixel THẬT của website KHÔNG ĐƯỢC TẠO — làm hỏng tracking thật.
//
// Cách đúng: KHÔNG predefine window.fbq/ttq/gtag là truthy.
// Chỉ "lắng nghe" bằng cách patch các method gọi (push/init) một cách
// PASSIVE — không chặn, không thay thế object, chỉ quan sát rồi forward.

(function() {
  const store = { fbPixels: [], ttPixels: [], gaIds: [], gtmIds: [] };
  window.__STORESPY_PIXELS__ = store;

  function addFb(id) {
    id = String(id).trim();
    if (/^\d{10,20}$/.test(id) && !store.fbPixels.includes(id)) {
      store.fbPixels.push(id);
    }
  }
  function addTt(id) {
    if (id && !store.ttPixels.includes(id)) store.ttPixels.push(id);
  }
  function addGa(id) {
    if (id && !store.gaIds.includes(id)) store.gaIds.push(id);
  }
  function addGtm(id) {
    if (id && !store.gtmIds.includes(id)) store.gtmIds.push(id);
  }

  // ── FACEBOOK: poll thay vì override ──────────────────────────
  // KHÔNG tạo window.fbq giả. Chỉ kiểm tra định kỳ xem fbq thật
  // đã xuất hiện chưa, rồi đọc queue/state của nó — passive, không chặn.
  let fbCheckCount = 0;
  const fbInterval = setInterval(() => {
    fbCheckCount++;
    if (fbCheckCount > 100) { clearInterval(fbInterval); return; } // ~20s max

    if (typeof window.fbq === 'function') {
      // fbq thật đã load. Đọc queue các lệnh init đã gọi (nếu fbq giữ queue)
      try {
        const q = window.fbq.queue || window._fbq?.queue || [];
        q.forEach(call => {
          if (Array.isArray(call) && (call[0] === 'init') && call[1]) addFb(call[1]);
        });
      } catch(e) {}

      // Wrap fbq một lần — KHÔNG thay window.fbq, chỉ wrap method bên trong
      // để bắt các lệnh init gọi SAU thời điểm này (passive observer)
      if (!window.fbq.__storespyWrapped) {
        const realFbq = window.fbq;
        const wrapped = function() {
          const args = Array.from(arguments);
          if (args[0] === 'init' && args[1]) addFb(args[1]);
          return realFbq.apply(this, args);
        };
        wrapped.__storespyWrapped = true;
        // Copy properties để giữ hành vi gốc (callMethod, queue, etc.)
        for (const k in realFbq) { try { wrapped[k] = realFbq[k]; } catch(e) {} }
        try { window.fbq = wrapped; } catch(e) {
          // Nếu site đã freeze window.fbq, bỏ qua — network detection vẫn bắt được
        }
      }
      clearInterval(fbInterval);
    }
  }, 200);

  // ── TIKTOK: tương tự, chỉ poll + wrap passive ────────────────
  let ttCheckCount = 0;
  const ttInterval = setInterval(() => {
    ttCheckCount++;
    if (ttCheckCount > 100) { clearInterval(ttInterval); return; }

    if (window.ttq && typeof window.ttq.load === 'function' && !window.ttq.__storespyWrapped) {
      const realTtq = window.ttq;
      const realLoad = realTtq.load.bind(realTtq);
      realTtq.load = function(id) {
        if (id) addTt(id);
        return realLoad(id);
      };
      realTtq.__storespyWrapped = true;
      clearInterval(ttInterval);
    }
  }, 200);

  // ── GTAG: wrap nếu đã tồn tại, không tạo mới ─────────────────
  let gtagCheckCount = 0;
  const gtagInterval = setInterval(() => {
    gtagCheckCount++;
    if (gtagCheckCount > 100) { clearInterval(gtagInterval); return; }

    if (typeof window.gtag === 'function' && !window.gtag.__storespyWrapped) {
      const realGtag = window.gtag;
      const wrapped = function() {
        const args = Array.from(arguments);
        if (args[0] === 'config' && typeof args[1] === 'string') {
          if (args[1].startsWith('G-')) addGa(args[1]);
          if (args[1].startsWith('GTM-')) addGtm(args[1]);
        }
        return realGtag.apply(this, args);
      };
      wrapped.__storespyWrapped = true;
      try { window.gtag = wrapped; } catch(e) {}
      clearInterval(gtagInterval);
    }
  }, 200);

  // ── GTM dataLayer: push đã tồn tại sẵn an toàn để wrap ───────
  // dataLayer.push là array method chuẩn, wrap nó không phá GTM
  // vì GTM tự đọc dataLayer array, không phụ thuộc identity của push
  function wrapDataLayer() {
    if (!window.dataLayer || window.dataLayer.__storespyWrapped) return false;
    const origPush = Array.prototype.push.bind(window.dataLayer);
    window.dataLayer.push = function() {
      const args = Array.from(arguments);
      args.forEach(item => {
        if (item && typeof item === 'object') {
          try {
            const str = JSON.stringify(item);
            const fbM = str.match(/"(?:pixelId|pixel_id|fb_pixel_id)"\s*:\s*"?(\d{10,20})"?/);
            if (fbM) addFb(fbM[1]);
          } catch(e) {}
        }
      });
      return origPush(...args);
    };
    window.dataLayer.__storespyWrapped = true;
    return true;
  }
  if (!wrapDataLayer()) {
    let dlCheck = 0;
    const dlInterval = setInterval(() => {
      dlCheck++;
      if (wrapDataLayer() || dlCheck > 100) clearInterval(dlInterval);
    }, 200);
  }
})();
