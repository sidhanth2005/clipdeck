const getState = async () => (await chrome.storage.session.get('s')).s || { running: false, count: 0 };
const setState = (s) => chrome.storage.session.set({ s });

const GREEN = '#16a34a', AMBER = '#f59e0b';

function badge(text, color = GREEN) {
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color });
}

async function ensureOffscreen() {
  const ctx = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  if (!ctx.length) {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['USER_MEDIA'],
      justification: 'Watch the Teams tab video to detect slide changes'
    });
  }
}

async function reset() {
  await setState({ running: false, count: 0 });
  badge('');
  try { await chrome.offscreen.closeDocument(); } catch (e) {}
}

async function handle(msg, sender) {
  switch (msg.type) {
    case 'status':
      return await getState();

    case 'pick-roi':
      await chrome.scripting.executeScript({ target: { tabId: msg.tabId }, files: ['roi.js'] });
      return { ok: true };

    case 'roi': {
      const st = await getState();
      if (st.running) {
        chrome.runtime.sendMessage({ target: 'offscreen', type: 'reconfigure', roi: msg.roi, anchor: msg.anchor });
        return;
      }
      const tabId = sender.tab.id;
      try {
        const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
        await ensureOffscreen();
        chrome.runtime.sendMessage({ target: 'offscreen', type: 'start', streamId, roi: msg.roi, anchor: msg.anchor });
        await setState({ running: true, tabId, count: 0 });
        badge('0', GREEN);
      } catch (e) {
        console.error(e);
        badge('ERR', '#dc2626');
      }
      return;
    }

    case 'count': {
      const s = await getState();
      await setState({ ...s, count: msg.count });
      badge(String(msg.count), s.offSlide ? AMBER : GREEN);
      return;
    }

    case 'onslide': {
      // green = slide is showing, orange = presenter is on something else (nothing is saved)
      const s = await getState();
      await setState({ ...s, offSlide: !msg.on });
      badge(String(s.count || 0), msg.on ? GREEN : AMBER);
      return;
    }

    case 'save':
      chrome.runtime.sendMessage({ target: 'offscreen', type: 'finish', stop: false });
      return;

    case 'stop':
      chrome.runtime.sendMessage({ target: 'offscreen', type: 'finish', stop: true });
      return;

    case 'download-empty':
      await reset();
      return;

    case 'error':
      console.error(msg.message);
      badge('ERR', '#dc2626');
      return;

    case 'download': {
      const id = await chrome.downloads.download({ url: msg.url, filename: msg.filename });
      const onChanged = async (d) => {
        if (d.id !== id || !d.state) return;
        if (d.state.current === 'complete' || d.state.current === 'interrupted') {
          chrome.downloads.onChanged.removeListener(onChanged);
          if (msg.final) await reset();
        }
      };
      chrome.downloads.onChanged.addListener(onChanged);
      return;
    }
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.target === 'offscreen') return;
  handle(msg, sender).then(sendResponse);
  return true;
});
