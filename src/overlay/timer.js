// The timer drawn on a site that has a daily limit (or a running pass): a
// small chip with the time left. A plain script, run in the isolated world
// of the top frame.
//
// It decides nothing and reads no storage: the background sends
// `{ type: "sb-timer", timer }` after every count (usage.js), with `timer`
// either null (nothing to show) or `{ left, total, running, at }`. Between
// two messages the chip counts down on its own from those numbers.
//
// It stays out of the way three ways:
// - it never takes a click (pointer-events: none), so whatever it covers
//   still works;
// - it fades when the pointer comes near, so what it covers can be seen;
// - it picks the spot along the window's edges that covers the least: see
//   place().
(() => {
  const FLAG = "__siteBlockerTimer";
  if (globalThis[FLAG]) return;
  globalThis[FLAG] = true;
  // A copy left by the extension before it was reloaded.
  for (const old of document.querySelectorAll("sb-timer")) old.remove();

  const MARGIN = 12; // from the window's edge
  const NEAR = 16; // the pointer this close fades the chip
  const KEEP = 4; // how much better another spot must be to move there
  const MOTION = 120;

  // The tokens of src/ui/ui.css, the chip being ink with the card's colour
  // on it so that it reads on a light page and on a dark one.
  // The system's font, not Inter: a page such as YouTube refuses a font
  // loaded from the extension, and logs an error for the attempt.
  const CSS = `
    .chip {
      --surface: #ffffff;
      --ink: #131316;
      --accent: oklch(55% 0.16 264);
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px 4px 6px;
      border: 1px solid color-mix(in oklab, var(--surface) 22%, var(--ink));
      border-radius: 5px;
      background: var(--ink);
      color: var(--surface);
      font: 500 14px/21px -apple-system, system-ui, "Segoe UI", sans-serif;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
      -webkit-font-smoothing: antialiased;
      transition: opacity ${MOTION}ms cubic-bezier(0.2, 0, 0, 1);
    }
    @media (prefers-color-scheme: dark) {
      .chip { --surface: #262626; --ink: #e6e6e6; }
    }
    .chip.faint { opacity: 0.12; }
    .chip.away { opacity: 0; }
    svg { width: 16px; height: 16px; flex: none; transform: rotate(-90deg); }
    circle { fill: none; stroke-width: 2.5; }
    .track { stroke: color-mix(in oklab, var(--surface) 28%, var(--ink)); }
    .arc { stroke: var(--accent); }
  `;

  // Built node by node: a page may forbid innerHTML (Trusted Types).
  const host = document.createElement("sb-timer");
  const shadow = host.attachShadow({ mode: "closed" });
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(CSS);
  shadow.adoptedStyleSheets = [sheet];

  const SVG = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  const ring = (name) => {
    const circle = document.createElementNS(SVG, "circle");
    for (const [key, value] of Object.entries({ cx: 12, cy: 12, r: 9, pathLength: 100 })) {
      circle.setAttribute(key, value);
    }
    circle.setAttribute("class", name);
    svg.append(circle);
    return circle;
  };
  ring("track");
  const arc = ring("arc");
  const time = document.createElement("span");
  const chip = document.createElement("div");
  chip.className = "chip";
  chip.append(svg, time);
  shadow.append(chip);

  host.setAttribute("role", "timer");
  host.setAttribute("popover", "manual");
  // Nothing of the page's CSS, nor the browser's popover box, reaches it.
  host.style.cssText = [
    "all: initial",
    "position: fixed",
    "inset: auto",
    "left: 0",
    "top: 0",
    "z-index: 2147483647",
    "display: none",
    "pointer-events: none",
  ]
    .map((rule) => `${rule} !important`)
    .join("; ");
  const set = (property, value) => host.style.setProperty(property, value, "important");

  let data = null; // the last `timer` from the background
  let shown = ""; // the text on the chip
  let spot = null; // the name of the spot the chip is in
  let box = null; // where it is: { x, y, w, h }
  let pointer = null;
  let asked = false; // the background was told the time ran out
  let ticking = null;
  let pending = null;

  /** Asks the background to count now; its answer is an "sb-timer" message. */
  function hello() {
    try {
      chrome.runtime.sendMessage({ type: "timerHello" }).catch(() => {});
    } catch {
      // The extension was reloaded: this copy is an orphan.
      stop();
      host.remove();
    }
  }

  function stop() {
    clearInterval(ticking);
    ticking = null;
    set("display", "none");
  }

  /** In the top layer, over the page's own layers and a full-screen video. */
  function raise() {
    if (!host.isConnected) document.documentElement.append(host);
    try {
      if (host.matches(":popover-open")) host.hidePopover();
      host.showPopover();
    } catch {
      // No popover here: the z-index does what it can.
    }
  }

  function format(ms) {
    const seconds = Math.ceil(ms / 1000);
    const two = (number) => String(number).padStart(2, "0");
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return hours > 0
      ? `${hours}:${two(minutes)}:${two(seconds % 60)}`
      : `${minutes}:${two(seconds % 60)}`;
  }

  function render() {
    if (!data) return;
    if (!host.isConnected) raise();
    const left = Math.max(0, data.left - (data.running ? Date.now() - data.at : 0));
    const text = format(left);
    if (text !== shown) {
      const resized = text.length !== shown.length;
      shown = text;
      time.textContent = text;
      host.setAttribute("aria-label", text);
      // A pass has no length to be a part of: its ring stays whole.
      const part = data.total ? Math.min(1, left / data.total) : 1;
      arc.setAttribute("stroke-dasharray", `${part * 100} 100`);
      arc.style.display = part > 0 ? "" : "none";
      if (resized) soon(0);
    }
    // Out of time: the background closes the site when it next counts.
    if (left <= 0 && !asked) {
      asked = true;
      hello();
    }
  }

  // ------------------------------------------------------------------
  // Where to sit
  // ------------------------------------------------------------------

  const CONTROL =
    'a[href], button, input, select, textarea, summary, label, [role="button"], ' +
    '[role="link"], [role="menuitem"], [role="tab"], [role="switch"], [role="checkbox"], ' +
    '[role="slider"], [role="textbox"], [role="combobox"], [contenteditable=""], ' +
    '[contenteditable="true"], [tabindex]:not([tabindex="-1"]), [onclick], [aria-haspopup]';
  const MEDIA = "img, picture, video, canvas, svg, iframe";

  /** True when the element stays put as the page scrolls (a header, a nav,
   * a chat button): what the chip covers there, it covers for good. */
  function pinned(element, seen) {
    const path = [];
    let answer = false;
    for (let each = element; each && each !== document.documentElement; each = each.parentElement) {
      if (seen.has(each)) {
        answer = seen.get(each);
        break;
      }
      path.push(each);
      const { position } = getComputedStyle(each);
      if (position === "fixed" || position === "sticky") {
        answer = true;
        break;
      }
    }
    for (const each of path) seen.set(each, answer);
    return answer;
  }

  /** What covering this point costs: a control most, a picture or words
   * less, bare background nothing; and much less for what scrolls away. */
  function costAt(x, y, seen) {
    const element = document.elementFromPoint(x, y);
    if (!element || element === document.documentElement || element === document.body) return 0;
    let cost = 0;
    if (element.closest(CONTROL) || getComputedStyle(element).cursor === "pointer") cost = 10;
    else if (element.closest(MEDIA)) cost = 3;
    else if ([...element.childNodes].some((node) => node.nodeType === 3 && node.data.trim())) cost = 3;
    if (cost === 0) return 0;
    return pinned(element, seen) ? cost : cost * 0.3;
  }

  /** The spots, best liked first: the corners, then along the edges. */
  function spots(w, h) {
    const W = Math.min(window.innerWidth, document.documentElement.clientWidth || Infinity);
    const H = window.innerHeight;
    const x = (part) => MARGIN + (W - w - 2 * MARGIN) * part;
    const y = (part) => MARGIN + (H - h - 2 * MARGIN) * part;
    const at = (name, px, py, liking) => ({ name, x: Math.round(x(px)), y: Math.round(y(py)), liking });
    return [
      at("bottom-left", 0, 1, 0),
      at("bottom-right", 1, 1, 0.25),
      at("top-right", 1, 0, 0.5),
      at("top-left", 0, 0, 0.75),
      at("bottom", 0.5, 1, 2),
      at("top", 0.5, 0, 2.25),
      at("left", 0, 0.5, 2.5),
      at("right", 1, 0.5, 2.75),
      at("bottom-1", 0.25, 1, 3),
      at("bottom-3", 0.75, 1, 3),
      at("top-1", 0.25, 0, 3.25),
      at("top-3", 0.75, 0, 3.25),
      at("left-1", 0, 0.25, 3.5),
      at("left-3", 0, 0.75, 3.5),
      at("right-1", 1, 0.25, 3.75),
      at("right-3", 1, 0.75, 3.75),
    ];
  }

  /**
   * Picks the spot that covers the least. Each spot is probed at nine
   * points (the chip does not count: it takes no pointer); the cheapest
   * wins, and the chip only leaves where it is for a clearly better one,
   * so that it does not wander as the page scrolls.
   */
  function place() {
    pending = null;
    if (!data || document.hidden) return;
    const { width: w, height: h } = chip.getBoundingClientRect();
    if (w === 0) return;
    const seen = new Map();
    const list = spots(w, h);
    for (const each of list) {
      each.cost = each.liking;
      for (const px of [0, 0.5, 1]) {
        for (const py of [0, 0.5, 1]) {
          // A little wider than the chip: near a control is in its way too.
          each.cost += costAt(each.x - 6 + (w + 12) * px, each.y - 6 + (h + 12) * py, seen);
        }
      }
    }
    const best = list.reduce((a, b) => (b.cost < a.cost ? b : a));
    const here = list.find((each) => each.name === spot);
    const next = here && here.cost - best.cost < KEEP ? here : best;
    const move = () => {
      set("left", `${next.x}px`);
      set("top", `${next.y}px`);
      box = { x: next.x, y: next.y, w, h };
      chip.classList.remove("away");
      fade();
    };
    if (next.name === spot || spot === null) move();
    else {
      // Out, over, in: a chip sliding across the page would draw the eye.
      chip.classList.add("away");
      setTimeout(move, MOTION);
    }
    spot = next.name;
  }

  /** Looks for a spot again in `delay` ms; `restart` pushes back a look
   * already planned (the end of a scroll), otherwise it is left to come. */
  function soon(delay, restart = false) {
    if (!data) return;
    if (pending !== null) {
      if (!restart) return;
      clearTimeout(pending);
    }
    pending = setTimeout(place, delay);
  }

  function fade() {
    const near =
      pointer !== null &&
      box !== null &&
      pointer.x > box.x - NEAR &&
      pointer.x < box.x + box.w + NEAR &&
      pointer.y > box.y - NEAR &&
      pointer.y < box.y + box.h + NEAR;
    chip.classList.toggle("faint", near);
  }

  const passive = { passive: true, capture: true };
  window.addEventListener("pointermove", (event) => {
    pointer = { x: event.clientX, y: event.clientY };
    if (data) fade();
  }, passive);
  document.documentElement.addEventListener("pointerleave", () => {
    pointer = null;
    fade();
  });
  window.addEventListener("scroll", () => soon(300, true), passive);
  window.addEventListener("resize", () => soon(150, true), passive);
  document.addEventListener("visibilitychange", () => soon(0));
  document.addEventListener("fullscreenchange", () => {
    // Whatever went full screen is now over the chip: back on top.
    if (data) raise();
    soon(100, true);
  });
  // The page changed under the chip (a menu opened, a new view came in).
  new MutationObserver(() => soon(1000)).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  // A page brought back from the back-forward cache missed what was sent.
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) hello();
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type !== "sb-timer") return;
    data = message.timer;
    if (!data) {
      stop();
      return;
    }
    asked = false;
    if (ticking === null) {
      set("display", "block");
      raise();
      ticking = setInterval(render, 250);
    }
    render();
    soon(0);
  });

  hello();
})();
