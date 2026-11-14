// The toolbar popup: about the current tab. On a supported or listed site,
// its switches; on any other site, "Block this site"; on a browser page, a
// quiet line. Below, the lock, and the way to all settings.

import { send } from "./api.js";
import { blockedOriginal, button, h, icon, text, uid } from "./components.js";
import {
  createPage,
  customSwitches,
  failureNotice,
  feedback,
  limitRow,
  lockPanel,
  passRow,
  siteSwitches,
} from "./page.js";

const url = await currentUrl();
const host = hostOf(url);

const page = createPage({
  root: document.getElementById("app"),
  load: () => send("whereAmI", { url }),
  build,
});
page.start();

async function currentUrl() {
  let tab = null;
  try {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  } catch {
    tab = null;
  }
  const address = tab?.url || tab?.pendingUrl || "";
  // On the black zone page the tab is about the site it stands in for, so
  // the popup shows that site's switches (and its way out, with the
  // password), not "a browser page".
  const blockedPage = new URL("blocked.html", location.href).href;
  if (address.startsWith(`${blockedPage}#`)) {
    const original = blockedOriginal(address.slice(blockedPage.length));
    if (original) return original.href;
  }
  return address;
}

function hostOf(address) {
  try {
    return new URL(address).hostname.toLowerCase();
  } catch {
    return "";
  }
}

// A pass is stored by the hostname it was granted for (www.reddit.com);
// the tab may be on that host, a subdomain of it, or its parent.
function sameSite(domain, hostname) {
  if (!domain || !hostname) return false;
  return hostname === domain || hostname.endsWith(`.${domain}`) || domain.endsWith(`.${hostname}`);
}

function build(page) {
  if (!page.view) return [failureNotice(page)];
  return [failureNotice(page), herePanel(page), lockPanel(page), settingsLink()];
}

function herePanel(page) {
  const here = page.here ?? { kind: "none" };
  const { view } = page;
  if (here.kind === "site") {
    const site = view.sites.find((item) => item.id === here.siteId);
    if (site) return siteCard(page, site.name, `site:${site.id}:blockAll`, siteSwitches(page, site));
  }
  if (here.kind === "custom") {
    const custom = view.custom.find((item) => item.domain === here.domain);
    if (custom) {
      return siteCard(page, custom.domain, `custom:${custom.domain}:blockAll`, customSwitches(page, custom));
    }
  }
  if (here.kind === "other" && here.domain) return otherCard(page, here.domain);
  return text("small", "Nothing to block on this page.", { tone: "muted", class: "quiet" });
}

/** A listed site: its name, a pass running on it, its switches. */
function siteCard(page, title, firstKey, switches) {
  const id = uid("here");
  const passes = page.view.passes.filter((pass) => sameSite(pass.domain, host));
  const now = Date.now();
  return h(
    "section",
    { class: "card", "aria-labelledby": id },
    text("heading", title, { as: "h1", id }),
    passes.map((pass) => passRow(page, pass, { now, after: firstKey })),
    switches,
  );
}

/** A normal site not listed yet: one button puts it in the black zone. */
function otherCard(page, domain) {
  const id = uid("here");
  const key = "here:add";
  return h(
    "section",
    { class: "card", "aria-labelledby": id },
    h(
      "div",
      { class: "stack-tight" },
      text("heading", domain, { as: "h1", id }),
      text("small", "Not in the black zone.", { tone: "muted" }),
    ),
    h(
      "div",
      { class: "cluster" },
      button({
        key,
        variant: "primary",
        icon: "shield-ban",
        label: "Block this site",
        onClick: () =>
          page.act(
            key,
            async () => {
              const added = await send("addCustom", { input: domain });
              // The tab is now a listed site: ask again what it is.
              return added.ok ? send("whereAmI", { url }) : added;
            },
            { focus: `custom:${domain}:blockAll` },
          ),
      }),
    ),
    feedback(page, key),
    h("hr"),
    // Or leave it open, for so long a day.
    limitRow(page, {
      key: "here:limit",
      name: domain,
      item: { limit: 0, usedMs: 0 },
      run: async (minutes) => {
        const set = await send("setLimit", { domain, minutes });
        return set.ok ? send("whereAmI", { url }) : set;
      },
    }),
  );
}

function settingsLink() {
  return h(
    "a",
    {
      href: "options.html",
      class: "footer-link text-small",
      key: "settings",
      on: {
        click: (event) => {
          event.preventDefault();
          chrome.runtime.openOptionsPage();
        },
      },
    },
    icon("settings"),
    "All settings",
  );
}
