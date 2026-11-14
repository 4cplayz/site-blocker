// YouTube classifier. CSS can tell every YouTube kind apart except one
// door into Shorts: the "Shorts" filter chip on the search page
// (yt-chip-cloud-chip-renderer) carries its label only as text, with no
// attribute to match. This marks such a chip data-sb="short" so that
// shorts.css can hide it; it marks nothing else, and never hides anything.
// Chips are reused when the results change, so every chip is re-checked
// and a mark is taken off a chip whose label is no longer "Shorts".
(() => {
  if (globalThis.__siteBlockerYoutubeClassifier) return;
  globalThis.__siteBlockerYoutubeClassifier = true;

  // "Shorts" is the label in English and in French.
  const SHORTS_LABEL = /^\s*shorts\s*$/i;
  const CHIP_TAGS = ["yt-chip-cloud-chip-renderer", "chip-view-model", "ytm-chip-cloud-chip-renderer"];
  const chipLists = CHIP_TAGS.map((tag) => document.getElementsByTagName(tag));
  let queued = false;

  function classify() {
    queued = false;
    for (const chips of chipLists) {
      for (const chip of chips) {
        const isShorts = SHORTS_LABEL.test(chip.textContent || "");
        const marked = chip.getAttribute("data-sb") === "short";
        if (isShorts && !marked) chip.setAttribute("data-sb", "short");
        else if (!isShorts && marked) chip.removeAttribute("data-sb");
      }
    }
  }

  function queue() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(classify);
  }

  new MutationObserver(queue).observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  queue();
})();
