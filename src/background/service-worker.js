// The entry point: it only wires browser events to the modules beside it.
import { PASS_ALARM, apply, guardNavigation } from "./apply.js";
import { RELOCK_ALARM, closeLock, unlockedUntil } from "./lock.js";
import { handle } from "./messages.js";
import { loadState, prunePasses, saveState, toView } from "./state.js";
import { TICK_ALARM, track } from "./usage.js";

/** Rebuilds everything from the stored state: after an install, an update
 * (a site module's selectors may have changed) or a browser start. */
async function refresh() {
  const state = await loadState();
  if (prunePasses(state)) await saveState(state);
  await apply(state);
  await track();
}

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  await refresh();
  if (reason === "install") chrome.runtime.openOptionsPage();
});
chrome.runtime.onStartup.addListener(refresh);

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === RELOCK_ALARM) await closeLock();
  if (alarm.name === PASS_ALARM) await refresh();
  if (alarm.name === TICK_ALARM) await track();
});

// The time spent counts the site in front: every change of what is in
// front is a moment to count up to.
chrome.tabs.onActivated.addListener(() => track());
chrome.tabs.onRemoved.addListener(() => track());
chrome.tabs.onUpdated.addListener((tabId, change) => {
  if ("url" in change || "audible" in change) track();
});
chrome.windows.onFocusChanged.addListener(() => track());
chrome.idle.onStateChanged.addListener(() => track());

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  // The timer on a page (overlay/timer.js) may ask one thing: count now.
  // The count is sent to every timer; nothing is answered here.
  if (message?.type === "timerHello" && sender.id === chrome.runtime.id && sender.tab) {
    track();
    return false;
  }
  // Only the extension's own pages may ask: never a web page's script.
  const own =
    sender.id === chrome.runtime.id && sender.url?.startsWith(chrome.runtime.getURL(""));
  if (!own) return false;
  handle(message).then(respond, async (error) => {
    // A failure still answers with the picture, so the page can redraw.
    const view = toView(await loadState(), await unlockedUntil());
    respond({ ok: false, error: "invalid", message: String(error?.message ?? error), view });
  });
  return true;
});

for (const event of [
  chrome.webNavigation.onCommitted,
  chrome.webNavigation.onHistoryStateUpdated,
]) {
  event.addListener(async ({ frameId, tabId, url }) => {
    if (frameId !== 0) return;
    const state = await loadState();
    // A pass that just ran out counts as over even before its alarm fires.
    await guardNavigation(state, tabId, url);
    // Also a moment to count up to: the first load of a new day, even one
    // that lands on the blocked page, is what opens yesterday's sites.
    await track();
  });
}
