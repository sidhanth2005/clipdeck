const $ = (id) => document.getElementById(id);

async function refresh() {
  const s = await chrome.runtime.sendMessage({ type: 'status' });
  const running = !!(s && s.running);
  $('status').textContent = running ? `Recording - ${s.count || 0} slides saved` : 'Not running';
  $('start').hidden = running;
  $('save').hidden = !running;
  $('reselect').hidden = !running;
  $('stop').hidden = !running;
}

$('start').onclick = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await chrome.runtime.sendMessage({ type: 'pick-roi', tabId: tab.id });
  window.close();
};
$('reselect').onclick = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await chrome.runtime.sendMessage({ type: 'pick-roi', tabId: tab.id });
  window.close();
};
$('save').onclick = async () => { await chrome.runtime.sendMessage({ type: 'save' }); window.close(); };
$('stop').onclick = async () => { await chrome.runtime.sendMessage({ type: 'stop' }); window.close(); };

refresh();
