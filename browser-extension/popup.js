const status = document.getElementById('status');
async function target() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = new URL(tab.url || 'about:blank');
  if (!(url.hostname === 'www.twitch.tv' || url.hostname === 'twitch.tv' || url.hostname === 'localhost' || url.hostname === '127.0.0.1')) throw Error('Откройте канал на twitch.tv или локальный тест Freecam.');
  return { tabId: tab.id };
}
document.getElementById('enable').onclick = async () => {
  try {
    const selected = await target();
    await chrome.scripting.executeScript({ target: selected, files: ['core.js', 'runtime.js'] });
    const [result] = await chrome.scripting.executeScript({ target: selected, func: () => globalThis.FreecamPackedController.start() });
    status.textContent = result.result?.message || 'Включено. Проверяем маркер в следующих кадрах.';
  } catch (err) { status.textContent = err.message; }
};
document.getElementById('disable').onclick = async () => {
  try { await chrome.scripting.executeScript({ target: await target(), func: () => globalThis.FreecamPackedController?.stop() }); status.textContent = 'Исходный плеер восстановлен.'; }
  catch (err) { status.textContent = err.message; }
};
