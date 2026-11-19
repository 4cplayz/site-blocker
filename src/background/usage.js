// The time spent: counts the time on every web site, files each finished
// day in the history (the "Time spent" page reads it), and closes a site
// with a daily limit for the rest of the day when its time is used up.
//
// A service worker keeps nothing in memory, so the count is a relay: each
// call adds the time since the last one to the sites that were in use then
// (kept in chrome.storage.session), and notes the sites in use now. A call
// comes with every tab or window change, and from an alarm every half
// minute in between, while a site is in use or a limit exists.
import { SITES } from "../sites/index.js";
import { apply } from "./apply.js";
import {
  USAGE_KEY,
  archiveDay,
  isOverLimit,
  loadState,
  locate,
  placeKey,
  saveUsage,
  timerOf,
} from "./state.js";

export const TICK_ALARM = "tick";
const TICK_MINUTES = 0.5;
const WATCH_KEY = "watch";
// Two calls are never further apart than a tick while the browser runs.
// A longer gap is the computer asleep: it counts for one step, not for
// the night.
const MAX_STEP = 90_000;

/** Every place with a daily limit. */
function limited(state) {
  const sites = Object.keys(state.sites).filter((id) => state.sites[id].limit > 0);
  const custom = Object.keys(state.custom).filter((domain) => state.custom[domain].limit > 0);
  return [...sites, ...custom];
}

/**
 * The sites in use now: the tab in front in the focused window, and any
 * tab playing sound (a video left running behind another tab still
 * counts). Nothing counts while the computer is locked. A listed site
 * counts under its key; any other under its hostname, `www.` dropped.
 */
async function inUse(state) {
  if ((await chrome.idle.queryState(60)) === "locked") return [];
  const [tabs, windows] = await Promise.all([chrome.tabs.query({}), chrome.windows.getAll()]);
  const focused = new Set(windows.filter((window) => window.focused).map((window) => window.id));
  const keys = new Set();
  for (const tab of tabs) {
    if (!tab.audible && !(tab.active && focused.has(tab.windowId))) continue;
    let url;
    try {
      url = new URL(tab.url);
    } catch {
      continue;
    }
    // A browser page, a file, the blocked page: not a web site.
    if (url.protocol !== "http:" && url.protocol !== "https:") continue;
    // Any host counts, a local one (localhost, an IP address) too.
    const place = locate(state, url.hostname);
    const key = place
      ? placeKey(place)
      : url.hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
    if (key) keys.add(key);
  }
  return [...keys];
}

/** The places whose time is used up, by their keys. */
function overNow(state) {
  return limited(state).filter((key) => {
    // locate() goes by hostname: a built-in site is found by its domain.
    const site = SITES.find((each) => each.id === key);
    const place = locate(state, site ? site.domains[0] : key);
    return place && isOverLimit(state, place);
  });
}

/**
 * Tells every open page of a listed site what its timer shows
 * (overlay/timer.js): the time left as of `now`, and whether it is running.
 * A limit runs while the site is in use; a pass runs by the clock.
 */
async function announce(state, keys, now) {
  const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });
  await Promise.all(
    tabs.map(async (tab) => {
      try {
        const place = locate(state, new URL(tab.url).hostname);
        if (!place) return;
        const timer = timerOf(state, place, now);
        if (timer) {
          timer.running = timer.total === null || keys.includes(placeKey(place));
          timer.at = now;
        }
        await chrome.tabs.sendMessage(tab.id, { type: "sb-timer", timer }, { frameId: 0 });
      } catch {
        // No timer on that page: it never had time to count.
      }
    }),
  );
}

let queue = Promise.resolve();

/** Counts the time since the last call. Calls run one after the other. */
export function track() {
  queue = queue.catch(() => {}).then(trackNow);
  return queue;
}

/**
 * Counts before a page of the UI is answered, so what it draws is up to
 * now and not up to the last tick. Not when the count is `maxAge` fresh:
 * a count writes storage, a write makes the page ask again, and that
 * second ask must find nothing to do.
 */
export async function recount(maxAge = 5000) {
  const { [WATCH_KEY]: watch } = await chrome.storage.session.get(WATCH_KEY);
  if (watch?.keys?.length && Date.now() - watch.since < maxAge) return;
  await track();
}

async function trackNow() {
  const now = Date.now();
  const [{ [USAGE_KEY]: stored }, { [WATCH_KEY]: watch }, state] = await Promise.all([
    chrome.storage.local.get(USAGE_KEY),
    chrome.storage.session.get(WATCH_KEY),
    loadState(),
  ]);
  // loadState() already started today from nothing; what is stored may
  // still be yesterday's, with sites closed that are open again.
  const newDay = stored != null && stored.day !== state.usage.day;
  const wasOver = new Set(overNow(state));
  // Yesterday's count goes to the history before today's replaces it.
  if (newDay) await archiveDay(stored);

  const step = Math.min(Math.max(now - (watch?.since ?? now), 0), MAX_STEP);
  const counted = step > 0 ? (watch?.keys ?? []) : [];
  for (const key of counted) state.usage.ms[key] = (state.usage.ms[key] ?? 0) + step;
  if (newDay || counted.length > 0) await saveUsage(state.usage);

  const keys = await inUse(state);
  if (keys.length > 0 || watch?.keys?.length) {
    await chrome.storage.session.set({ [WATCH_KEY]: { keys, since: now } });
  }
  await announce(state, keys, now);

  // The tick runs only while there is time to count (a site in use) or a
  // limit exists; the next tab, window or idle event starts it again.
  // Creating it again would restart its half minute, so an alarm already
  // set is left alone.
  if (keys.length === 0 && limited(state).length === 0) await chrome.alarms.clear(TICK_ALARM);
  else if (!(await chrome.alarms.get(TICK_ALARM))) {
    await chrome.alarms.create(TICK_ALARM, { periodInMinutes: TICK_MINUTES });
  }

  // A site that just ran out closes, tabs and all; a new day opens them.
  if (newDay || overNow(state).some((key) => !wasOver.has(key))) await apply(state);
}
