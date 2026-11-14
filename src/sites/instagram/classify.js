// Instagram classifier: marks the grid cell around each post tile (Explore,
// profile, hashtag, "more posts" grids) with data-sb = image | video | short.
// It never hides anything; the feature CSS does.
//
// Why a script at all: a photo tile is a tile WITHOUT a video sign, and the
// wrapper that holds it could only be named in CSS as
// `div:has(> a:not(:has(video)))`, which is invalid (:has() does not nest).
// The CSS can hide the photo's link but not its cell, which would leave an
// empty square in the grid. Feed posts, nav entries and video or reel tiles
// need no script: the CSS tells them apart on its own.
(() => {
  "use strict";
  if (globalThis.__siteBlockerInstagramClassify) return;
  globalThis.__siteBlockerInstagramClassify = true;

  // Post tiles: profile grids link "/<user>/p/<code>/" or "/<user>/reel/<code>/",
  // Explore and hashtag grids "/p/<code>/".
  const TILE = 'main a[href*="/p/"], main a[href*="/reel/"]';
  // Reel glyphs: "Reel" on Explore tiles, "Clip" on profile tiles (same in French).
  const SHORT_SIGN = 'svg[aria-label="Reel"], svg[aria-label="Clip"]';
  // Any other video: a playing <video>, or the "Video" / "Vidéo" glyph.
  const VIDEO_SIGN = 'video, svg[aria-label="Video"], svg[aria-label="Vidéo"]';
  // Stop climbing at these: past them the wrapper is the page, not the cell.
  const STOP = 'main, body, article, [role="tablist"], [role="dialog"]';
  const MAX_CLIMB = 5;

  let marked = new Map(); // element -> the data-sb value this script set
  let pending = false;

  function kindOf(tile) {
    if (tile.matches('a[href*="/reel/"]') || tile.querySelector(SHORT_SIGN)) return "short video";
    if (tile.querySelector(VIDEO_SIGN)) return "video";
    if (tile.querySelector("img")) return "image";
    return "";
  }

  // The tile plus every wrapper that holds nothing else: the grid cell.
  function cellOf(tile) {
    let cell = tile;
    for (let i = 0; i < MAX_CLIMB; i += 1) {
      const parent = cell.parentElement;
      if (!parent || parent.childElementCount !== 1 || parent.matches(STOP)) break;
      cell = parent;
    }
    return cell;
  }

  function isTile(link) {
    const href = link.getAttribute("href") || "";
    // Comment and "liked by" links are not tiles; a feed post is CSS's job.
    return !href.includes("/c/") && !href.includes("/liked_by/") && !link.closest("article");
  }

  function pass() {
    pending = false;
    const next = new Map();
    // Messages are left alone: a shared post there is a message, not a grid.
    if (!location.pathname.startsWith("/direct/")) {
      for (const link of document.querySelectorAll(TILE)) {
        if (!isTile(link)) continue;
        const kind = kindOf(link);
        if (kind) next.set(cellOf(link), kind);
      }
    }
    for (const element of marked.keys()) {
      if (!next.has(element)) element.removeAttribute("data-sb");
    }
    for (const [element, kind] of next) {
      if (element.getAttribute("data-sb") !== kind) element.setAttribute("data-sb", kind);
    }
    marked = next;
  }

  function schedule() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(pass);
  }

  // Only node changes and href changes can change a tile; data-sb writes do not
  // come back here.
  new MutationObserver(schedule).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["href"],
  });
  schedule();
})();
