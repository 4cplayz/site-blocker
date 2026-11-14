// The state: what is blocked. One object in chrome.storage.local, read on
// every event (a service worker keeps nothing in memory between two).
import { GENERIC, SITES } from "../sites/index.js";
import { hostIn } from "./domains.js";

const KEY = "state";
// The time spent today is kept beside the state, under its own key: the
// tracker writes it every half minute, and must never write over a setting
// changed meanwhile.
export const USAGE_KEY = "usage";
export const PASS_MINUTES = [5, 15, 60];
export const CUSTOM_KEYS = ["blockAll", "images", "videos"];
export const MAX_LIMIT = 24 * 60;

/** A daily limit in whole minutes; 0 is no limit. */
const limitOf = (value) =>
  Number.isInteger(value) && value > 0 && value <= MAX_LIMIT ? value : 0;

/** The local calendar day, the unit a daily limit counts in. */
export function dayOf(now = Date.now()) {
  const date = new Date(now);
  const two = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
}

/** The stored shape, with every site and feature the registry knows. */
function complete(stored, usage) {
  const state = { sites: {}, custom: {}, passes: {}, usage: { day: dayOf(), ms: {} } };
  for (const site of SITES) {
    const had = stored?.sites?.[site.id];
    const features = {};
    for (const feature of site.features) {
      features[feature.id] = had?.features?.[feature.id] === true;
    }
    state.sites[site.id] = { blockAll: had?.blockAll === true, limit: limitOf(had?.limit), features };
  }
  for (const [domain, entry] of Object.entries(stored?.custom ?? {})) {
    state.custom[domain] = {
      blockAll: entry.blockAll === true,
      images: entry.images === true,
      videos: entry.videos === true,
      limit: limitOf(entry.limit),
    };
  }
  for (const [domain, until] of Object.entries(stored?.passes ?? {})) {
    if (typeof until === "number") state.passes[domain] = until;
  }
  // Yesterday's count is not today's: a new day starts from nothing.
  if (usage?.day === state.usage.day) {
    for (const [key, ms] of Object.entries(usage.ms ?? {})) {
      if (typeof ms === "number" && ms > 0) state.usage.ms[key] = ms;
    }
  }
  return state;
}

export async function loadState() {
  const stored = await chrome.storage.local.get([KEY, USAGE_KEY]);
  return complete(stored[KEY], stored[USAGE_KEY]);
}

/** Saves the settings. The time spent is the tracker's (saveUsage). */
export async function saveState(state) {
  const { usage, ...settings } = state;
  await chrome.storage.local.set({ [KEY]: settings });
}

export async function saveUsage(usage) {
  await chrome.storage.local.set({ [USAGE_KEY]: usage });
}

/** The name a place's time is counted under. */
export function placeKey(place) {
  return place.kind === "site" ? place.site.id : place.domain;
}

/** True when the place has a daily limit and today's time is used up. */
export function isOverLimit(state, place) {
  const limit = place.entry.limit;
  return limit > 0 && (state.usage.ms[placeKey(place)] ?? 0) >= limit * 60_000;
}

/** Drops the passes that ran out. True when one did. */
export function prunePasses(state, now = Date.now()) {
  let changed = false;
  for (const [domain, until] of Object.entries(state.passes)) {
    if (until <= now) {
      delete state.passes[domain];
      changed = true;
    }
  }
  return changed;
}

/**
 * What a hostname belongs to: a built-in site, a site the owner added, or
 * nothing. The longest custom domain wins (`old.reddit.com` over `reddit.com`).
 */
export function locate(state, host) {
  for (const site of SITES) {
    if (site.domains.some((domain) => hostIn(host, domain))) {
      return { kind: "site", site, entry: state.sites[site.id], domains: site.domains };
    }
  }
  const domain = Object.keys(state.custom)
    .filter((candidate) => hostIn(host, candidate))
    .sort((a, b) => b.length - a.length)[0];
  if (domain) {
    return { kind: "custom", domain, entry: state.custom[domain], domains: [domain] };
  }
  return null;
}

export function hasPass(state, domains, now = Date.now()) {
  return domains.some((domain) => (state.passes[domain] ?? 0) > now);
}

/** True when the place is in the black zone, or out of time for today,
 * and no pass is running. */
export function isClosed(state, place, now = Date.now()) {
  return (
    (place.entry.blockAll || isOverLimit(state, place)) && !hasPass(state, place.domains, now)
  );
}

/**
 * What the timer drawn on a place's pages counts down (overlay/timer.js):
 * the rest of today's limit, or of the pass that keeps a closed place open.
 * `total` is the whole the rest is a part of; a pass has none. Null when
 * nothing is counting.
 */
export function timerOf(state, place, now = Date.now()) {
  const limit = place.entry.limit * 60_000;
  const left = limit - (state.usage.ms[placeKey(place)] ?? 0);
  if (place.entry.blockAll || isOverLimit(state, place)) {
    const until = Math.max(...place.domains.map((domain) => state.passes[domain] ?? 0));
    return until > now ? { left: until - now, total: null } : null;
  }
  return limit > 0 ? { left, total: limit } : null;
}

/** The CSS files a place has on, as paths from the extension's root. */
export function cssFor(place) {
  if (place.kind === "site") {
    return place.site.features
      .filter((feature) => feature.css && place.entry.features[feature.id])
      .map((feature) => `sites/${place.site.id}/${feature.css}`);
  }
  return ["images", "videos"].filter((key) => place.entry[key]).map((key) => GENERIC[key]);
}

/**
 * Where a page of a built-in site is sent when one of its features closes
 * it. A site whose subdomains are other products (a help centre, an ads
 * console) names the hosts its page rules hold on, `pathHosts`.
 */
export function pathRedirect(place, { hostname, pathname }) {
  if (place.kind !== "site") return null;
  if (place.site.pathHosts && !place.site.pathHosts.includes(hostname)) return null;
  for (const feature of place.site.features) {
    if (!place.entry.features[feature.id]) continue;
    for (const path of feature.paths ?? []) {
      if (new RegExp(path.regex).test(pathname)) return path.redirect;
    }
  }
  return null;
}

/** The picture the UI draws (CLAUDE.md, Message API). */
export function toView(state, unlockedUntil) {
  return {
    locked: unlockedUntil === null,
    unlockedUntil,
    sites: SITES.map((site) => ({
      id: site.id,
      name: site.name,
      domains: site.domains,
      blockAll: state.sites[site.id].blockAll,
      limit: state.sites[site.id].limit,
      usedMs: state.usage.ms[site.id] ?? 0,
      features: site.features.map((feature) => ({
        id: feature.id,
        label: feature.label,
        description: feature.description,
        on: state.sites[site.id].features[feature.id],
      })),
    })),
    custom: Object.entries(state.custom)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([domain, entry]) => ({ domain, ...entry, usedMs: state.usage.ms[domain] ?? 0 })),
    passes: Object.entries(state.passes)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([domain, until]) => ({ domain, until })),
  };
}
