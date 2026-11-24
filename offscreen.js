// Runs in a hidden page. Watches the tab video, detects new slides, keeps screenshots.

// ---- tuning knobs ---------------------------------------------------------
const CFG = {
  intervalMs: 500,    // how often to look at the slide area
  settleMs: 1500,     // screen must stay still this long before a slide is saved (skips transitions)
  pixDelta: 28,       // a pixel counts as "changed" if brightness differs by more than this (0-255)
  movingFrac: 0.002,  // above this fraction of changed pixels between ticks = still moving
  newFrac: 0.03,      // slide must differ from the last saved one by this much (raise = fewer saves)
  dupFrac: 0.02,      // if it matches ANY saved slide within this, it's a repeat -> skip
  anchorFrac: 0.15,   // logo/footer box must match the original within this, else 'not on the slide'
  jpegQuality: 0.92
};
// ---------------------------------------------------------------------------

const TW = 160, TH = 90, AW = 64, AH = 32;
const saved = [];
let stream = null, video = null, timer = null, roi = null, anchorBox = null, anchorRef = null, lastReported = null;
let prev = null, lastSaved = null, stableSince = 0, busy = false, finished = false;

const tcanvas = Object.assign(document.createElement('canvas'), { width: TW, height: TH });
const tctx = tcanvas.getContext('2d', { willReadFrequently: true });
const acanvas = Object.assign(document.createElement('canvas'), { width: AW, height: AH });
const actx = acanvas.getContext('2d', { willReadFrequently: true });

const send = (m) => chrome.runtime.sendMessage(m);

function rectFrom(b) {
  const vw = video.videoWidth, vh = video.videoHeight;
  const sx = Math.max(0, Math.round(b.x / b.vw * vw));
  const sy = Math.max(0, Math.round(b.y / b.vh * vh));
  const sw = Math.min(Math.round(b.w / b.vw * vw), vw - sx);
  const sh = Math.min(Math.round(b.h / b.vh * vh), vh - sy);
  return { sx, sy, sw, sh };
}

function gray(ctx, W, H, r) {
  ctx.drawImage(video, r.sx, r.sy, r.sw, r.sh, 0, 0, W, H);
  const d = ctx.getImageData(0, 0, W, H).data;
  const g = new Uint8Array(W * H);
  for (let i = 0, p = 0; i < g.length; i++, p += 4) g[i] = (d[p] * 77 + d[p + 1] * 150 + d[p + 2] * 29) >> 8;
  return g;
}

function frac(a, b) {
  let n = 0;
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > CFG.pixDelta) n++;
  return n / a.length;
}

function mean(g) { let s = 0; for (let i = 0; i < g.length; i++) s += g[i]; return s / g.length; }

async function capture(r, cur) {
  const c = document.createElement('canvas');
  c.width = r.sw; c.height = r.sh;
  c.getContext('2d').drawImage(video, r.sx, r.sy, r.sw, r.sh, 0, 0, r.sw, r.sh);
  const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', CFG.jpegQuality));
  const jpeg = new Uint8Array(await blob.arrayBuffer());
  const now = new Date();
  saved.push({ thumb: cur, jpeg, w: r.sw, h: r.sh, time: now });
  lastSaved = cur;
  send({ type: 'count', count: saved.length });
}

async function tick() {
  if (busy || finished || !video || !video.videoWidth) return;
  busy = true;
  try {
    const r = rectFrom(roi);
    if (r.sw < 20 || r.sh < 20) return;
    const cur = gray(tctx, TW, TH, r);
    const now = Date.now();

    // Gate: is the real slide showing? (logo/footer box must look like it did at the start)
    if (anchorBox) {
      const ar = rectFrom(anchorBox);
      if (ar.sw >= 4 && ar.sh >= 4) {
        const a = gray(actx, AW, AH, ar);
        if (!anchorRef) anchorRef = a;
        const ai = a.map((v) => 255 - v);   // also try inverted, so light/dark slide themes both match
        const on = Math.min(frac(a, anchorRef), frac(ai, anchorRef)) < CFG.anchorFrac;
        if (on !== lastReported) { lastReported = on; send({ type: 'onslide', on }); }
        if (!on) { prev = cur; stableSince = 0; return; }   // presenter is on another tab/window
      }
    }

    if (prev) {
      if (frac(cur, prev) > CFG.movingFrac) stableSince = 0;
      else if (!stableSince) stableSince = now;
    }
    prev = cur;

    if (stableSince && now - stableSince >= CFG.settleMs) {
      const isNew = !lastSaved || frac(cur, lastSaved) >= CFG.newFrac;
      const isRepeat = saved.some((s) => frac(cur, s.thumb) < CFG.dupFrac);
      const isBlack = mean(cur) < 10;
      if (isNew && !isRepeat && !isBlack) await capture(r, cur);
    }
  } catch (e) {
    console.error(e);
  } finally {
    busy = false;
  }
}

async function start({ streamId, roi: r, anchor }) {
  try {
    roi = r;
    anchorBox = anchor || null;
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } }
    });
    video = document.createElement('video');
    video.muted = true;
    video.srcObject = stream;
    await new Promise((res) => (video.onloadedmetadata = res));
    await video.play();
    stream.getVideoTracks()[0].addEventListener('ended', () => finish(true));
    timer = setInterval(tick, CFG.intervalMs);
  } catch (e) {
    send({ type: 'error', message: String(e) });
  }
}

function reconfigure({ roi: r, anchor }) {
  roi = r; anchorBox = anchor || null;
  anchorRef = null; lastReported = null; prev = null; stableSince = 0;
}

function stamp() {
  const d = new Date(), p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}`;
}

async function finish(stop) {
  if (stop) {
    if (finished) return;
    finished = true;
    clearInterval(timer);
    if (stream) stream.getTracks().forEach((t) => t.stop());
  }
  if (!saved.length) { if (stop) send({ type: 'download-empty' }); return; }

  const p = (n) => String(n).padStart(2, '0');
  const slides = saved.map((s, i) => ({
    jpeg: s.jpeg, w: s.w, h: s.h,
    label: `Slide ${i + 1}  -  ${p(s.time.getHours())}:${p(s.time.getMinutes())}:${p(s.time.getSeconds())}`
  }));
  const blob = buildDocx(slides, 'Teams class slides');
  const url = URL.createObjectURL(blob);
  send({ type: 'download', url, filename: `Teams-slides-${stamp()}.docx`, final: !!stop });
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.target !== 'offscreen') return;
  if (msg.type === 'start') start(msg);
  if (msg.type === 'reconfigure') reconfigure(msg);
  if (msg.type === 'finish') finish(msg.stop);
});
