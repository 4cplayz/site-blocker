// Facebook classifier: marks the slot around each feed post (home feed,
// groups, Pages, profiles) with data-sb = a list of image, video, short.
// It never hides anything; the feature CSS does.
//
// Why a script at all: a post is an `[aria-posinset]` element sitting in a
// stack of wrappers that hold nothing else (nine of them on the home feed,
// five in groups), and one of those wrappers carries the 12 px gap to the
// next post. The CSS hides the post itself, which is right on its own but
// leaves that gap; the wrappers have no name CSS could use (hashed classes
// only), so this script finds the top one and marks it.
(() => {
  "use strict";
  if (globalThis.__siteBlockerFacebookClassify) return;
  globalThis.__siteBlockerFacebookClassify = true;

  const POST = "[aria-posinset]";
  // The same signs as images.css, videos.css and shorts.css. A sign inside
  // a comment (a [data-commentid] block) does not make the post that kind.
  const SHORT_SIGN = 'a[href*="/reel/"]';
  const VIDEO_SIGN = [
    // A video player with a poster frame. A photo post with music also has
    // a <video>, for its sound, but 0 by 0 and without a poster.
    "video[poster]",
    'a[href*="/watch/"]',
    'a[href*="/videos/"]',
    'a[href*="youtube.com/watch"]',
    'a[href*="youtube.com%2Fwatch"]',
    'a[href*="youtu.be"]',
    'iframe[src*="youtube.com/embed"]',
    'iframe[src*="player.vimeo.com"]',
  ].join(", ");
  const IMAGE_SIGN = 'a[href*="/photo/"], a[href*="/photo?"], a[href*="/photo.php"], a[href*="/photos/"]';
  // Stop climbing at these: past them the wrapper is the page, not the slot.
  const STOP = 'main, body, [role="main"], [role="feed"], [role="dialog"], [role="article"]';
  const MAX_CLIMB = 14;

  let marked = new Map(); // element -> the data-sb value this script set
  let pending = false;

  function shows(post, sign) {
    for (const element of post.querySelectorAll(sign)) {
      if (!element.closest("[data-commentid]")) return true;
    }
    return false;
  }

  function kindOf(post) {
    const kinds = [];
    const short = shows(post, SHORT_SIGN);
    if (short) kinds.push("short");
    if (short || shows(post, VIDEO_SIGN)) kinds.push("video");
    if (shows(post, IMAGE_SIGN)) kinds.push("image");
    return kinds.join(" ");
  }

  // The post plus every wrapper that holds nothing else: its slot in the feed.
  function slotOf(post) {
    let slot = post;
    for (let i = 0; i < MAX_CLIMB; i += 1) {
      const parent = slot.parentElement;
      if (!parent || parent.childElementCount !== 1 || parent.matches(STOP)) break;
      slot = parent;
    }
    return slot;
  }

  function pass() {
    pending = false;
    const next = new Map();
    for (const post of document.querySelectorAll(POST)) {
      // A post inside another (a shared post) goes with the outer one.
      if (post.parentElement?.closest(POST)) continue;
      const slot = slotOf(post);
      // Far from the screen Facebook empties a post and keeps its place; an
      // emptied post keeps its mark, or its slot would show as a blank band.
      const kind = post.querySelector("a") ? kindOf(post) : marked.get(slot);
      if (kind) next.set(slot, kind);
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

  // Posts mount and unmount as the feed scrolls; a link gets its real href
  // on hover, a player its poster when it loads. data-sb writes do not come
  // back here.
  new MutationObserver(schedule).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["href", "poster"],
  });
  schedule();
})();
