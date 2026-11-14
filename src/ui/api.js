// The UI's one door to the background (CLAUDE.md § Message API). The UI
// never writes storage and never decides: it sends a message and draws the
// answer's `view`.

/**
 * Sends `{ type, ...args }` to the service worker and returns its answer,
 * `{ ok, view, error?, ... }`. When nothing answers (the worker failed to
 * start, the extension was reloaded under an open page), it returns
 * `{ ok: false, error: "no-answer", view: null }` instead of throwing, so a
 * page can say so in a line rather than break.
 */
export async function send(type, args = {}) {
  let answer;
  try {
    answer = await chrome.runtime.sendMessage({ type, ...args });
  } catch (error) {
    return { ok: false, error: "no-answer", message: String(error?.message ?? error), view: null };
  }
  if (!answer || typeof answer !== "object") {
    return { ok: false, error: "no-answer", view: null };
  }
  return answer;
}

/**
 * Calls `fn` when the state changes behind the page (a pass runs out, the
 * lock comes back, another page changed something). Any storage area
 * counts: which one the background keeps its state in is its business. A
 * burst of writes calls `fn` once. Returns a function that stops listening.
 */
export function onStateChange(fn) {
  let timer = 0;
  const listener = () => {
    clearTimeout(timer);
    timer = setTimeout(fn, 50);
  };
  chrome.storage.onChanged.addListener(listener);
  return () => {
    clearTimeout(timer);
    chrome.storage.onChanged.removeListener(listener);
  };
}
