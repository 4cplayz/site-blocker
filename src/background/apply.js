// Turns the state into what the browser enforces: declarativeNetRequest
// rules (the black zone, closed pages, blocked endpoints), registered
// content scripts (the hiding CSS, at document_start), and the tabs already
// open. Everything is rebuilt from the state each time: no rule is patched.
import { SITES } from "../sites/index.js";
import { escapeDomain, pathRegexForUrl } from "./domains.js";
import { cssFor, isClosed, locate, pathRedirect } from "./state.js";

export const PASS_ALARM = "passes";
const SCRIPT_PREFIX = "sb-";
/** A page being closed beats a part of it being closed. */
const PRIORITY = { network: 1, path: 2, zone: 3 };

/** The blocked page for a URL: the original rides in the fragment. */
export function blockedUrl(url) {
  return `${chrome.runtime.getURL("ui/blocked.html")}#${url}`;
}

// Chrome compiles each regexFilter into at most 2 KB, so the regex stays
// small: which site it is goes in `requestDomains` (a domain and all its
// subdomains), and the regex only skips over the host.
const ANY_HOST = "^https?://[^/?#]+";
/** A regex head for one exact hostname, no subdomain in front. */
const exactHost = (host) => `^https?://${escapeDomain(host)}(?::[0-9]+)?`;

/** Every place the state knows: the built-in sites, then the added ones. */
function places(state) {
  return [
    ...SITES.map((site) => locate(state, site.domains[0])),
    ...Object.keys(state.custom).map((domain) => locate(state, domain)),
  ];
}

function buildRules(state, now) {
  const rules = [];
  const add = (rule) => rules.push({ id: rules.length + 1, ...rule });

  for (const place of places(state)) {
    if (isClosed(state, place, now)) {
      add({
        priority: PRIORITY.zone,
        action: {
          type: "redirect",
          // \0 is the whole matched URL.
          redirect: { regexSubstitution: `${blockedUrl("")}\\0` },
        },
        condition: {
          regexFilter: "^https?://.*",
          requestDomains: place.domains,
          resourceTypes: ["main_frame"],
        },
      });
      // The site embedded in another page is closed too.
      add({
        priority: PRIORITY.zone,
        action: { type: "block" },
        condition: { requestDomains: place.domains, resourceTypes: ["sub_frame"] },
      });
    }
    if (place.kind !== "site") continue;
    for (const feature of place.site.features) {
      if (!place.entry.features[feature.id]) continue;
      for (const path of feature.paths ?? []) {
        const [pathname, query = ""] = path.redirect.split("?");
        // One rule per exact host, where the site names them: an
        // alternation of hosts in one regex costs too much of the 2 KB.
        const heads = place.site.pathHosts?.map(exactHost) ?? [ANY_HOST];
        for (const head of heads) add({
          priority: PRIORITY.path,
          action: {
            type: "redirect",
            redirect: {
              transform: { path: pathname, query: query ? `?${query}` : "", fragment: "" },
            },
          },
          condition: {
            regexFilter: head + pathRegexForUrl(path.regex),
            // A path means what it says: /shorts is not /Shorts.
            isUrlFilterCaseSensitive: true,
            requestDomains: place.domains,
            resourceTypes: ["main_frame"],
          },
        });
      }
      for (const rule of feature.network ?? []) {
        const condition = { resourceTypes: rule.resourceTypes };
        for (const key of ["urlFilter", "regexFilter", "requestDomains", "initiatorDomains"]) {
          if (rule[key]) condition[key] = rule[key];
        }
        add({ priority: PRIORITY.network, action: { type: "block" }, condition });
      }
    }
  }
  return rules;
}

function buildScripts(state) {
  const scripts = [];
  for (const place of places(state)) {
    const css = cssFor(place);
    if (css.length === 0) continue;
    const script = {
      id: SCRIPT_PREFIX + (place.kind === "site" ? place.site.id : place.domains[0]),
      matches: place.domains.flatMap((domain) => [`*://${domain}/*`, `*://*.${domain}/*`]),
      css,
      runAt: "document_start",
      allFrames: true,
    };
    const classifiers = place.kind === "site" ? (place.site.scripts ?? []) : [];
    if (classifiers.length > 0) {
      script.js = classifiers.map((file) => `sites/${place.site.id}/${file}`);
    }
    scripts.push(script);
  }
  return scripts;
}

/**
 * Brings the open tabs in line. A page going closed is sent away; CSS newly
 * on is injected as the page stands; CSS going off needs a reload, since a
 * registered stylesheet cannot be taken back out of a loaded page.
 */
async function syncTabs(state, before, after, now) {
  const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });
  await Promise.all(
    tabs.map(async (tab) => {
      try {
        const url = new URL(tab.url);
        const place = locate(state, url.hostname);
        if (!place) return;
        if (isClosed(state, place, now)) {
          await chrome.tabs.update(tab.id, { url: blockedUrl(tab.url) });
          return;
        }
        const redirect = pathRedirect(place, url);
        if (redirect) {
          await chrome.tabs.update(tab.id, { url: url.origin + redirect });
          return;
        }
        const id = SCRIPT_PREFIX + (place.kind === "site" ? place.site.id : place.domains[0]);
        const was = before.get(id)?.css ?? [];
        const is = after.get(id)?.css ?? [];
        if (was.some((file) => !is.includes(file))) {
          await chrome.tabs.reload(tab.id);
          return;
        }
        const added = is.filter((file) => !was.includes(file));
        if (added.length === 0) return;
        const target = { tabId: tab.id, allFrames: true };
        await chrome.scripting.insertCSS({ target, files: added });
        const js = after.get(id)?.js;
        if (js && was.length === 0) await chrome.scripting.executeScript({ target, files: js });
      } catch {
        // A tab that closed meanwhile, or a page Chrome keeps to itself.
      }
    }),
  );
}

let queue = Promise.resolve();

/** Applies the state. Calls run one after the other, never interleaved. */
export function apply(state) {
  queue = queue.catch(() => {}).then(() => applyNow(state));
  return queue;
}

async function applyNow(state) {
  const now = Date.now();

  const rules = buildRules(state, now);
  // Chrome refuses a whole update for one regex it cannot take, with only
  // a rule number. Name the regex instead, so the site module can be fixed.
  for (const rule of rules) {
    const { regexFilter: regex, isUrlFilterCaseSensitive: isCaseSensitive } = rule.condition;
    if (!regex) continue;
    const verdict = await chrome.declarativeNetRequest.isRegexSupported({ regex, isCaseSensitive });
    if (!verdict.isSupported) throw new Error(`Chrome refuses the rule ${regex} (${verdict.reason})`);
  }

  const old = await chrome.declarativeNetRequest.getDynamicRules();
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: old.map((rule) => rule.id),
    addRules: rules,
  });

  const registered = (await chrome.scripting.getRegisteredContentScripts()).filter((script) =>
    script.id.startsWith(SCRIPT_PREFIX),
  );
  const scripts = buildScripts(state);
  if (registered.length > 0) {
    await chrome.scripting.unregisterContentScripts({ ids: registered.map((s) => s.id) });
  }
  if (scripts.length > 0) await chrome.scripting.registerContentScripts(scripts);

  const byId = (list) => new Map(list.map((script) => [script.id, script]));
  await syncTabs(state, byId(registered), byId(scripts), now);

  // Wake up when the next pass runs out, to close the site again.
  const next = Math.min(...Object.values(state.passes).filter((until) => until > now));
  if (Number.isFinite(next)) await chrome.alarms.create(PASS_ALARM, { when: next });
  else await chrome.alarms.clear(PASS_ALARM);
}

/**
 * A page just committed or changed its URL in place. The rules above stop
 * a load from the network; this catches what never reaches it: an in-page
 * (history) navigation, a page restored from the back-forward cache.
 */
export async function guardNavigation(state, tabId, rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return;
  const place = locate(state, url.hostname);
  if (!place) return;
  try {
    if (isClosed(state, place)) {
      await chrome.tabs.update(tabId, { url: blockedUrl(rawUrl) });
      return;
    }
    const redirect = pathRedirect(place, url);
    if (redirect) await chrome.tabs.update(tabId, { url: url.origin + redirect });
  } catch {
    // The tab is gone.
  }
}
