// Injected into the Teams tab. Step 1: drag around the slide. Step 2: drag around something
// that is on EVERY slide (logo / footer) so the extension knows when the slide is really showing.
(() => {
  if (window.__slideSaverRoi) return;
  window.__slideSaverRoi = true;

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;cursor:crosshair;background:rgba(0,0,0,.35);';
  const tip = document.createElement('div');
  tip.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);background:#111;color:#fff;padding:8px 14px;border-radius:6px;font:14px system-ui,sans-serif;pointer-events:none;white-space:nowrap;';
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;border:2px solid #22d3ee;background:rgba(34,211,238,.12);display:none;pointer-events:none;';
  overlay.append(tip, box);
  document.documentElement.appendChild(overlay);

  let phase = 1, slide = null, sx = 0, sy = 0, dragging = false;

  const setTip = () => {
    tip.textContent = phase === 1
      ? 'Step 1/2: drag a box around the SLIDE  (Esc = cancel)'
      : 'Step 2/2: box something that is the SAME on every slide - best: PowerPoint ribbon tabs (Home, Insert, Design...)  (Esc = skip)';
  };
  setTip();

  const cleanup = () => {
    overlay.remove();
    window.removeEventListener('keydown', onKey, true);
    window.__slideSaverRoi = false;
  };
  const finish = (anchor) => {
    cleanup();
    chrome.runtime.sendMessage({
      type: 'roi',
      roi: { ...slide, vw: window.innerWidth, vh: window.innerHeight },
      anchor: anchor ? { ...anchor, vw: window.innerWidth, vh: window.innerHeight } : null
    });
  };
  const onKey = (e) => {
    if (e.key !== 'Escape') return;
    if (phase === 1) cleanup(); else finish(null);
  };
  window.addEventListener('keydown', onKey, true);

  overlay.addEventListener('mousedown', (e) => {
    dragging = true; sx = e.clientX; sy = e.clientY;
    box.style.display = 'block';
    box.style.left = sx + 'px'; box.style.top = sy + 'px'; box.style.width = '0px'; box.style.height = '0px';
    e.preventDefault();
  });
  overlay.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    box.style.left = Math.min(sx, e.clientX) + 'px';
    box.style.top = Math.min(sy, e.clientY) + 'px';
    box.style.width = Math.abs(e.clientX - sx) + 'px';
    box.style.height = Math.abs(e.clientY - sy) + 'px';
  });
  overlay.addEventListener('mouseup', (e) => {
    if (!dragging) return;
    dragging = false;
    const r = {
      x: Math.min(sx, e.clientX), y: Math.min(sy, e.clientY),
      w: Math.abs(e.clientX - sx), h: Math.abs(e.clientY - sy)
    };
    box.style.display = 'none';
    if (phase === 1) {
      if (r.w < 60 || r.h < 40) return;
      slide = r; phase = 2; setTip();
    } else {
      if (r.w < 20 || r.h < 12) return;
      finish(r);
    }
  });
})();
