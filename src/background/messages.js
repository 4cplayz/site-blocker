// The Message API (CLAUDE.md): every request the UI can make, and the one
// rule over all of them: tightening is free, loosening needs the lock open.
import { SITES } from "../sites/index.js";
import { apply } from "./apply.js";
import { hostIn, toDomain } from "./domains.js";
import { checkPassword, closeLock, openLock, unlockedUntil } from "./lock.js";
import { track } from "./usage.js";
import {
  CUSTOM_KEYS,
  MAX_LIMIT,
  PASS_MINUTES,
  isOverLimit,
  loadState,
  locate,
  prunePasses,
  saveState,
  toView,
} from "./state.js";

const invalid = (message) => ({ error: "invalid", message });
const LOCKED = { error: "locked" };

/** Each handler changes `state` in place and returns nothing, or a refusal. */
const HANDLERS = {
  getView() {},

  async unlock(state, { password }) {
    const result = await checkPassword(password);
    if (!result.ok) return { error: "wrong-password", retryInMs: result.retryInMs };
    await openLock();
  },

  async lock() {
    await closeLock();
  },

  setFeature(state, { siteId, featureId, on }, open) {
    const entry = state.sites[siteId];
    if (!entry || !(featureId in entry.features)) return invalid("Unknown blocker.");
    if (!on && entry.features[featureId] && !open) return LOCKED;
    entry.features[featureId] = on === true;
  },

  setBlockAll(state, { siteId, on }, open) {
    const entry = state.sites[siteId];
    if (!entry) return invalid("Unknown site.");
    if (!on && entry.blockAll && !open) return LOCKED;
    entry.blockAll = on === true;
  },

  addCustom(state, { input }) {
    const domain = toDomain(input);
    if (!domain) return invalid("That is not a web address. Try a domain such as reddit.com.");
    // A built-in site typed by hand goes to its own switch, not a duplicate.
    const site = SITES.find((s) => s.domains.some((d) => hostIn(domain, d)));
    if (site) {
      state.sites[site.id].blockAll = true;
      return;
    }
    if (state.custom[domain]) {
      state.custom[domain].blockAll = true;
      return;
    }
    state.custom[domain] = { blockAll: true, images: false, videos: false };
  },

  setCustom(state, { domain, key, on }, open) {
    const entry = state.custom[domain];
    if (!entry || !CUSTOM_KEYS.includes(key)) return invalid("Unknown site.");
    if (!on && entry[key] && !open) return LOCKED;
    entry[key] = on === true;
  },

  /**
   * A daily limit, in minutes; 0 takes it away. By `siteId` for a built-in
   * site, else by `domain`: a site not listed yet is listed, open, with
   * the limit. A first limit or a shorter one is tightening; a longer one
   * or none is loosening.
   */
  setLimit(state, { siteId, domain, minutes }, open) {
    if (!Number.isInteger(minutes) || minutes < 0 || minutes > MAX_LIMIT) {
      return invalid("Choose a whole number of minutes, or 0 for no limit.");
    }
    let entry;
    if (siteId !== undefined) {
      entry = state.sites[siteId];
      if (!entry) return invalid("Unknown site.");
    } else {
      const name = toDomain(domain ?? "");
      if (!name) return invalid("That is not a web address. Try a domain such as reddit.com.");
      const site = SITES.find((s) => s.domains.some((d) => hostIn(name, d)));
      entry = site ? state.sites[site.id] : state.custom[name];
      if (!entry) {
        if (minutes === 0) return;
        entry = { blockAll: false, images: false, videos: false, limit: 0 };
        state.custom[name] = entry;
      }
    }
    if (entry.limit > 0 && (minutes === 0 || minutes > entry.limit) && !open) return LOCKED;
    entry.limit = minutes;
  },

  removeCustom(state, { domain }, open) {
    const entry = state.custom[domain];
    if (!entry) return;
    // Removing a site that blocks nothing loosens nothing.
    const blocks = entry.blockAll || entry.images || entry.videos || entry.limit > 0;
    if (blocks && !open) return LOCKED;
    delete state.custom[domain];
    delete state.passes[domain];
  },

  async grantPass(state, { domain, minutes, password }) {
    const place = locate(state, toDomain(domain) ?? "");
    if (!place || !(place.entry.blockAll || isOverLimit(state, place))) {
      return invalid("This site is not closed.");
    }
    if (!PASS_MINUTES.includes(minutes)) return invalid("Choose 5, 15 or 60 minutes.");
    const result = await checkPassword(password);
    if (!result.ok) return { error: "wrong-password", retryInMs: result.retryInMs };
    const until = Date.now() + minutes * 60_000;
    for (const each of place.domains) state.passes[each] = until;
  },

  revokePass(state, { domain }) {
    const place = locate(state, toDomain(domain) ?? "");
    for (const each of place?.domains ?? [domain]) delete state.passes[each];
  },
};

/** What the popup is looking at. */
function whereIs(state, rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
    // On the blocked page, the site is the one it stands in for.
    if (url.href.startsWith(chrome.runtime.getURL("ui/blocked.html")) && url.hash.length > 1) {
      url = new URL(url.hash.slice(1));
    }
  } catch {
    return { kind: "none" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return { kind: "none" };
  const place = locate(state, url.hostname);
  if (place?.kind === "site") return { kind: "site", siteId: place.site.id };
  if (place?.kind === "custom") return { kind: "custom", domain: place.domain };
  const domain = toDomain(url.hostname);
  return domain ? { kind: "other", domain } : { kind: "none" };
}

export async function handle(message) {
  const state = await loadState();
  prunePasses(state);
  const before = JSON.stringify(state);

  let refusal;
  let extra = {};
  if (message?.type === "whereAmI") {
    extra = { here: whereIs(state, message.url) };
  } else if (Object.hasOwn(HANDLERS, message?.type)) {
    const open = (await unlockedUntil()) !== null;
    refusal = await HANDLERS[message.type](state, message, open);
  } else {
    refusal = invalid("Unknown request.");
  }

  if (!refusal && JSON.stringify(state) !== before) {
    await saveState(state);
    await apply(state);
    // A limit just set starts counting now, not at the next tick.
    await track();
  }
  const view = toView(state, await unlockedUntil());
  return refusal ? { ok: false, ...refusal, view } : { ok: true, view, ...extra };
}
