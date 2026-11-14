# What this is

Site Blocker: a personal Chrome extension (Manifest V3, no dependencies, no
bundler). Two things:

- **Black zone**: a site in it cannot be opened at all. Every page load is
  redirected to `ui/blocked.html`.
- **Part blockers**: per site, switches that hide one kind of content (image
  posts, video posts, short-form video) while the rest of the site works.

Loosening anything (switching a blocker off, taking a site out of the black
zone, a timed pass) needs the password from `.env`. Tightening is free.

# Run it

- `.env` holds `BLOCKER_PASSWORD=...`. `npm run build` copies `src/` to
  `dist/` and writes `dist/generated/secret.js` (a salted SHA-256 of the
  password, never the password itself).
- Load `dist/` in `chrome://extensions` (Developer mode, Load unpacked).
  After a change: `npm run build`, then the reload arrow on the extension.
- `npm run check` validates every site module against the contract below.

# Layout

- `src/background/` — the service worker: the one authority. It owns the
  state, checks the password, and turns the state into browser rules.
- `src/sites/<id>/` — one folder per supported site (contract below).
  `src/sites/index.js` is the registry. `src/sites/generic/` holds the two
  blockers offered on any custom site.
- `src/ui/` — popup, options page, blocked page, the shared stylesheet.
- `src/overlay/timer.js` — the timer drawn on a page of a limited site.
- `scripts/` — `build.mjs`, `check-sites.mjs`.

# Site module contract

A site is a folder `src/sites/<id>/` with a `site.js` and the files it names.
Nothing outside the folder changes when a site's markup changes.

```js
// src/sites/youtube/site.js
export default {
  id: "youtube", // = folder name, lowercase letters only
  name: "YouTube",
  domains: ["youtube.com"], // registrable domains; subdomains are included
  scripts: ["classify.js"], // optional, see "Classifier"
  features: [
    {
      id: "shorts", // "images" | "videos" | "shorts", or an extra id
      label: "Shorts",
      description: "One plain sentence: what disappears.",
      css: "shorts.css", // optional
      paths: [{ regex: "^/shorts(/|$)", redirect: "/" }], // optional
      network: [
        // optional; each entry becomes a declarativeNetRequest BLOCK rule
        { urlFilter: "||youtube.com/youtubei/v1/reel/", resourceTypes: ["xmlhttprequest"] },
      ],
    },
  ],
};
```

The three standard feature ids mean the same thing on every site:

- `images` — posts whose main content is a photo or a photo carousel.
- `videos` — posts whose main content is a normal (long or in-feed) video.
- `shorts` — the short-form vertical video product (Reels, Shorts, the
  TikTok feed, LinkedIn's video tab) and every door into it: nav entries,
  shelves, tabs, and the pages themselves.

A site leaves out a standard feature that has no meaning there, and may add
extra features with their own ids (comments, recommendations, stories).

## Feature CSS

- A feature's CSS only HIDES: `selector { display: none !important; }`.
  No layout, colour or restyling.
- It is injected at `document_start`, before the page draws, and removed
  again when the feature goes off. So it must be correct on its own, with
  no script having run.
- Selector order of preference: custom element names (`ytd-reel-shelf-renderer`),
  `href` patterns (`a[href^="/reels/"]`), `data-testid`, `aria-label`, `role`.
  Never a hashed or generated class name (`x1lliihq`, `css-1dbjc4n`): they
  change every deploy.
- `:has()` is available (Chrome 105+) and is how a post is matched by what
  it contains: `article:has(video)`.
- An `aria-label` or visible-text match must cover English and French
  (`[aria-label="Reels"]` is the same in both; `"Accueil"` is not `"Home"`).
- Hide the smallest element that leaves no hole: the whole post, the whole
  nav entry (its `li` or wrapper), not just the icon inside it.
- Each rule carries a one-line comment: what it targets, and where it is on
  the site.

## Classifier (`scripts`)

Only when CSS cannot tell the kinds apart. A classifier is a plain script
(not a module) run at `document_start` in the isolated world while at least
one of the site's features is on.

- It MARKS, it never hides or removes: it sets `data-sb` on a post to a
  space-separated list of `image`, `video`, `short`. The feature CSS then
  hides `[data-sb~="video"]`. A mark with no feature on changes nothing.
- Idempotent (guard on a global), one `MutationObserver` on
  `document.documentElement`, work batched per animation frame, no network,
  no `chrome.*` calls.

## Paths

`paths` closes a page of the site: `regex` is tested against
`location.pathname` (JavaScript) AND compiled into a declarativeNetRequest
`regexFilter` (RE2: no lookahead, no lookbehind, no backreferences). It must
start with `^/`. `redirect` is a path on the same site. Keep it small: Chrome
compiles each rule into at most 2 KB, which a counted repeat (`{2,4}`) or a
long alternation nested in another overruns. `npm run e2e` names the regex
Chrome refused; split it into two entries. The background
applies it on full loads and on in-page (history) navigation.

A site whose subdomains are other products (TikTok's help centre and ads
console) adds `pathHosts: ["www.tiktok.com", …]` beside `domains`: its page
rules then hold on those exact hosts only. The black zone and the CSS still
cover every subdomain.

## Network

Only an endpoint whose ONLY job is the blocked content, and whose failure
the site survives. A feed endpoint that also serves the rest of the page is
not one. When in doubt leave it out: the CSS and the path rule already do
the job, the network rule only saves bandwidth.

# Message API (UI to background)

The UI never writes storage and never decides anything. It calls
`chrome.runtime.sendMessage({ type, ...args })` and draws the answer. Every
answer is `{ ok: true, view }` or `{ ok: false, error, view }`, with `error`
one of `"locked"` (a loosening change while locked), `"wrong-password"`
(carries `retryInMs`), `"invalid"` (carries `message`, a sentence to show).

`view` is the whole picture, the same shape from every call:

```js
{
  locked: true,              // false while a password unlock is running
  unlockedUntil: null,       // ms timestamp while unlocked
  sites: [{                  // the built-in sites, in registry order
    id: "youtube", name: "YouTube", domains: ["youtube.com"],
    blockAll: false,         // true = the site is in the black zone
    features: [{ id: "shorts", label: "Shorts", description: "…", on: true }],
  }],
  custom: [{                 // sites the owner added, by domain
    domain: "reddit.com", blockAll: true, images: false, videos: false,
  }],
  passes: [{ domain: "reddit.com", until: 1731540000000 }], // timed passes
}
```

| type           | args                              | loosening? |
| -------------- | --------------------------------- | ---------- |
| `getView`      |                                   |            |
| `unlock`       | `password`                        |            |
| `lock`         |                                   |            |
| `setFeature`   | `siteId`, `featureId`, `on`       | when `on` is false |
| `setBlockAll`  | `siteId`, `on`                    | when `on` is false |
| `addCustom`    | `input` (a domain or a pasted URL) | no (starts with `blockAll: true`) |
| `setCustom`    | `domain`, `key` (`blockAll`, `images`, `videos`), `on` | when `on` is false |
| `setLimit`     | `siteId` or `domain`, `minutes` (0 = no limit) | when a limit gets longer or goes away |
| `removeCustom` | `domain`                          | yes        |
| `grantPass`    | `domain`, `minutes` (5, 15 or 60), `password` | checks the password itself, locked or not |
| `revokePass`   | `domain`                          | no         |
| `whereAmI`     | `url`                             | answers `{ ok, view, here }` |

Every entry of `sites` and `custom` also carries `limit` (its daily limit in
minutes, 0 = none) and `usedMs` (the time counted today).

## Daily limits (`src/background/usage.js`)

A site with a limit is closed like a black-zone site once today's time is
used (`isClosed` in `state.js`), until local midnight; a pass opens it.
`track()` does the counting: each call adds the time since the last call to
the sites that were in use then (the front tab of the focused window, and
any tab playing sound; nothing while the computer is locked), at most 90 s
per call. It is called on tab, window, navigation and idle events and by the
`tick` alarm every 30 s while a limit exists. The count lives under its own
storage key, `usage` (`{ day, ms: { <site id or domain>: ms } }`), which
only the tracker writes; what is in use lives in `storage.session`.

## The timer on the page (`src/overlay/timer.js`)

A site with time counting down (a daily limit not yet used, or a pass
holding a closed site open: `timerOf` in `state.js`) draws a small chip with
the time left. `apply.js` registers the script for those sites (id `sbt:…`,
top frame, `document_idle`) and runs it in the tabs already open.

The chip decides nothing and reads no storage. After every count `track()`
sends each open page of a listed site `{ type: "sb-timer", timer }`, with
`timer` null (hide) or `{ left, total, running, at }`; between two messages
the chip counts down from those numbers. Its one message to the background
is `timerHello` ("count now"): on load, and when it reaches zero.

It keeps out of the way: it takes no click (`pointer-events: none`), fades
when the pointer is near, and sits in the spot that covers the least. Each
of 16 spots along the window's edges is probed at nine points with
`elementFromPoint`: a control costs most, a picture or words less, and
anything that scrolls away far less than what is pinned (`fixed`, `sticky`).
Corners win ties, bottom left first; it moves only for a clearly better
spot, and looks again after a scroll, a resize, a change of the page.

It lives in a closed shadow root on an `sb-timer` element in the top layer
(`popover`), built without `innerHTML` or a `style` element so a strict page
(CSP, Trusted Types) lets it through. Its colours are `ui.css`'s tokens,
copied: a web page cannot link the stylesheet. Its font is the system's:
a strict page refuses one loaded from the extension.

`whereAmI` tells the popup what the active tab is: `here` is
`{ kind: "site", siteId }`, `{ kind: "custom", domain }`,
`{ kind: "other", domain }` (a normal site not yet listed; `domain` is what
`addCustom` would store) or `{ kind: "none" }` (a browser page).

The state changes behind an open page too (a pass runs out, the lock comes
back): a page refetches on `chrome.storage.onChanged`.

The blocked page is opened as `ui/blocked.html#<the full original URL>`.

# Design rules (the PM tool's, `24-PM-tools/pm-web`)

- Inter, self-hosted; nothing in uppercase. Content 16/24px, chrome 14/21px.
- Three colours: ink, paper, one blue accent `oklch(55% 0.16 264)`; every
  other tone is a `color-mix`, named by role. Light, dark by the system.
- Danger red on destructive hovers only. No shadows. One radius, 2.5px.
- Cards have no border. Icons are Lucide drawings. Motion is 120 ms,
  transform and opacity only. Text wraps, never truncates.
- Everything goes through `src/ui/ui.css`; no page carries its own colours.
