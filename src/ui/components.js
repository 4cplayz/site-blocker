// The shared DOM builders: every page is built from these parts, so a
// switch, a button or a password field is the same thing everywhere. Plain
// DOM: data only ever goes in as text nodes and attribute values, never as
// markup. The looks are the classes in ui.css; nothing here knows a colour.

const SVG_NS = "http://www.w3.org/2000/svg";

/*
 * Lucide drawings (lucide.dev, ISC licence), copied from the repository's
 * icons/<name>.svg. Each draws on a 24x24 grid with the house stroke set
 * in icon(): currentColor, 2 wide, round caps and joins, no fill.
 */
const ICONS = {
  lock: [
    ["rect", { width: "18", height: "11", x: "3", y: "11", rx: "2", ry: "2" }],
    ["path", { d: "M7 11V7a5 5 0 0 1 10 0v4" }],
  ],
  "lock-open": [
    ["rect", { width: "18", height: "11", x: "3", y: "11", rx: "2", ry: "2" }],
    ["path", { d: "M7 11V7a5 5 0 0 1 9.9-1" }],
  ],
  "shield-ban": [
    [
      "path",
      {
        d: "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",
      },
    ],
    ["path", { d: "m4.243 5.21 14.39 12.472" }],
  ],
  x: [
    ["path", { d: "M18 6 6 18" }],
    ["path", { d: "m6 6 12 12" }],
  ],
  plus: [
    ["path", { d: "M5 12h14" }],
    ["path", { d: "M12 5v14" }],
  ],
  "arrow-left": [
    ["path", { d: "m12 19-7-7 7-7" }],
    ["path", { d: "M19 12H5" }],
  ],
  settings: [
    [
      "path",
      {
        d: "M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915",
      },
    ],
    ["circle", { cx: "12", cy: "12", r: "3" }],
  ],
  trash: [
    ["path", { d: "M10 11v6" }],
    ["path", { d: "M14 11v6" }],
    ["path", { d: "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" }],
    ["path", { d: "M3 6h18" }],
    ["path", { d: "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" }],
  ],
};

/** A Lucide icon as an inline `<svg>`, hidden from screen readers. */
export function icon(name, className = "icon") {
  const svg = document.createElementNS(SVG_NS, "svg");
  const attrs = {
    class: className,
    width: "24",
    height: "24",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "2",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "aria-hidden": "true",
    focusable: "false",
  };
  for (const [key, value] of Object.entries(attrs)) svg.setAttribute(key, value);
  for (const [tag, shape] of ICONS[name] ?? []) {
    const part = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(shape)) part.setAttribute(key, value);
    svg.append(part);
  }
  return svg;
}

/** Joins the class names that are set. */
export function cx(...names) {
  return names.filter(Boolean).join(" ");
}

let lastId = 0;
/**
 * An id for wiring a label or a description to its control. Counted from
 * zero on each redraw, so the same page draws the same ids and an
 * unchanged tree compares equal (redraw).
 */
export function uid(prefix = "sb") {
  lastId += 1;
  return `${prefix}-${lastId}`;
}

let liveRegion = null;
/**
 * Says `message` to screen readers, once. One polite live region outlives
 * every redraw: a notice is redrawn with its page, and an alert inserted
 * again would be read again.
 */
export function announce(message) {
  if (!message) return;
  if (!liveRegion) {
    liveRegion = h("div", { class: "sr-only", role: "status", "aria-live": "polite" });
    document.body.append(liveRegion);
  }
  liveRegion.textContent = "";
  setTimeout(() => {
    liveRegion.textContent = message;
  }, 50);
}

/**
 * Builds an element. `props`: `class`, `key` (a stable `data-key`, which is
 * how focus survives a redraw), `on` ({ event: handler }), `value` (set as
 * the property), any other attribute (null, undefined and false leave it
 * out, true sets it empty). Children: nodes, strings (as text), arrays;
 * null and false are skipped.
 */
export function h(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(props ?? {})) {
    if (value == null || value === false) continue;
    if (name === "class") node.className = value;
    else if (name === "key") node.dataset.key = value;
    else if (name === "on") {
      for (const [type, handler] of Object.entries(value)) node.addEventListener(type, handler);
    } else if (name === "value") node.value = value;
    else node.setAttribute(name, value === true ? "" : String(value));
  }
  append(node, children);
  return node;
}

function append(node, children) {
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : String(child));
  }
}

const TEXT_TAGS = {
  display: "h1",
  title: "h2",
  heading: "h3",
  body: "p",
  small: "p",
  label: "span",
};

/**
 * The one way text is set: a step of the type scale (display, title,
 * heading, body, small, label), a colour role (`tone`: ink, muted, faint,
 * accent; none = the parent's), and the element when the step's default is
 * wrong (`as`).
 */
export function text(variant, content, { as, tone, class: extra, ...props } = {}) {
  return h(
    as ?? TEXT_TAGS[variant],
    { ...props, class: cx(`text-${variant}`, tone && `tone-${tone}`, extra) },
    content,
  );
}

/**
 * The text button. `variant`: primary (the one main action in a view),
 * secondary (default), ghost, danger. `icon` is a name from ICONS, set
 * before the label.
 */
export function button({
  label,
  variant = "secondary",
  icon: iconName,
  type = "button",
  disabled = false,
  key,
  onClick,
  ...props
}) {
  return h(
    "button",
    {
      ...props,
      type,
      key,
      disabled,
      class: cx("btn", `btn-${variant}`),
      on: onClick ? { click: onClick } : null,
    },
    iconName && icon(iconName),
    text("small", label, { as: "span" }),
  );
}

/**
 * An icon-only button: a grey glyph, blue under the pointer, red instead
 * when `danger`. `label` is its accessible name.
 */
export function iconButton({ icon: iconName, label, danger = false, key, onClick, disabled = false }) {
  return h(
    "button",
    {
      type: "button",
      key,
      disabled,
      class: cx("icon-btn", danger && "is-danger"),
      "aria-label": label,
      on: onClick ? { click: onClick } : null,
    },
    icon(iconName),
  );
}

/**
 * A refusal or an error said inline, on the soft accent, never red. With
 * `onDismiss`, an X clears it. Screen readers hear it through announce()
 * when it is first said, and through `aria-describedby` on its control.
 */
export function notice({ message, id, onDismiss, key }) {
  return h(
    "div",
    { class: "notice", id },
    text("small", message),
    onDismiss && iconButton({ icon: "x", label: "Dismiss", key, onClick: onDismiss }),
  );
}

/**
 * A setting: its label and one plain sentence on the left, a real
 * `<button role="switch">` on the right. The row is a `<label>`, so a
 * click anywhere on it presses the switch; the switch is named by the label
 * alone and described by the sentence (and `noteId`, a note that applies
 * to it). A press flips the switch at once and calls `onToggle(next)`; the
 * redraw from the answer's view puts it back if the change was refused.
 * `dormant` dims the row: the setting still works but changes nothing for
 * now (its site is closed anyway).
 */
export function switchRow({ key, label, description, checked, onToggle, dormant = false, noteId }) {
  const labelId = uid("label");
  const descriptionId = description ? uid("description") : null;
  const control = h(
    "button",
    {
      type: "button",
      role: "switch",
      class: "switch",
      key,
      "aria-checked": String(Boolean(checked)),
      "aria-labelledby": labelId,
      "aria-describedby": cx(descriptionId, noteId) || null,
      on: {
        click: () => {
          const next = control.getAttribute("aria-checked") !== "true";
          control.setAttribute("aria-checked", String(next));
          onToggle(next);
        },
      },
    },
    h("span", { class: "switch-knob", "aria-hidden": "true" }),
  );
  return h(
    "label",
    { class: cx("switch-row", dormant && "is-dormant") },
    h(
      "span",
      { class: "switch-text" },
      text("body", label, { as: "span", id: labelId }),
      description && text("small", description, { as: "span", id: descriptionId, tone: "muted" }),
    ),
    control,
  );
}

/**
 * A row of exclusive choices (pm-web's Segmented): each option a button,
 * the chosen one `aria-pressed`. `onChange` receives the option's value.
 */
export function segmented({ label, options, value, onChange, key }) {
  return h(
    "div",
    { class: "segmented", role: "group", "aria-label": label },
    options.map((option) =>
      h(
        "button",
        {
          type: "button",
          class: "segment",
          key: `${key}:${option.value}`,
          "aria-pressed": String(option.value === value),
          on: { click: () => onChange(option.value) },
        },
        text("small", option.label, { as: "span" }),
      ),
    ),
  );
}

/**
 * The password field: a form with the field and its submit button, an
 * optional `reason` line above (why the password is asked), its error said
 * inline below. Enter submits. Escape closes the prompt when it can be
 * closed (`onClose`, which also shows an X), else clears what was typed.
 * `held` keeps the submit button disabled (a wrong password's wait).
 * `busy` (the answer is coming) only ignores a second submit: disabling
 * the button under the keyboard would drop its focus. The field's
 * `data-key` is `key`, its button's `key:submit`.
 */
export function passwordField({
  key,
  value = "",
  reason,
  submitLabel = "Unlock",
  error,
  held = false,
  busy = false,
  onInput,
  onSubmit,
  onClose,
}) {
  const reasonId = reason ? uid("reason") : null;
  const errorId = error ? uid("error") : null;
  const input = h("input", {
    type: "password",
    class: "input",
    key,
    value,
    placeholder: "Password",
    "aria-label": "Password",
    // load-bearing: the password is meant to be typed, so the browser is
    // asked neither to fill it in nor to offer to save it.
    autocomplete: "off",
    autocapitalize: "off",
    spellcheck: "false",
    "aria-invalid": error ? "true" : null,
    "aria-describedby": cx(reasonId, errorId) || null,
    on: {
      input: (event) => onInput(event.target.value),
      keydown: (event) => {
        if (event.key !== "Escape") return;
        if (onClose) {
          event.preventDefault();
          onClose();
        } else if (event.target.value) {
          // An empty field lets Escape through: in the popup, it closes it.
          event.preventDefault();
          event.target.value = "";
          onInput("");
        }
      },
    },
  });
  return h(
    "form",
    {
      class: "field",
      novalidate: true,
      on: {
        submit: (event) => {
          event.preventDefault();
          if (!held && !busy) onSubmit();
        },
      },
    },
    reason && text("small", reason, { id: reasonId }),
    h(
      "div",
      { class: "field-row" },
      input,
      button({
        type: "submit",
        variant: "primary",
        label: submitLabel,
        disabled: held,
        key: `${key}:submit`,
        "aria-busy": busy ? "true" : null,
      }),
      onClose && iconButton({ icon: "x", label: "Close", key: `${key}:close`, onClick: onClose }),
    ),
    error && notice({ message: error, id: errorId }),
  );
}

/**
 * The lock, said in words: "Locked", or "Unlocked for 8 more minutes",
 * with the padlock open or shut and one line on what it means.
 */
export function lockStatus(view, now = Date.now()) {
  const open = !view.locked;
  const words = !open
    ? "Locked"
    : view.unlockedUntil
      ? `Unlocked for ${timeLeft(view.unlockedUntil - now)}`
      : "Unlocked";
  const hint = open
    ? "Loosening needs no password until it locks again."
    : "Tightening is free. Loosening anything needs the password.";
  return h(
    "div",
    { class: cx("lock-status", open && "is-open") },
    icon(open ? "lock-open" : "lock"),
    h("div", {}, text("body", words), text("small", hint, { tone: "muted" })),
  );
}

/* ------------------------------------------------------------------ */
/* Time in plain words. Whole minutes, rounded up, so it never says 0. */
/* ------------------------------------------------------------------ */

const MINUTE = 60_000;

function plural(count, word) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/** "8 more minutes", "1 more hour and 5 minutes". */
export function timeLeft(ms) {
  const minutes = Math.max(1, Math.ceil(ms / MINUTE));
  if (minutes < 60) return `${minutes} more minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const head = `${hours} more hour${hours === 1 ? "" : "s"}`;
  return rest ? `${head} and ${plural(rest, "minute")}` : head;
}

/** A length of time in whole minutes: "45 minutes", "1 hour", "1 hour and 30 minutes". */
export function minutesWords(minutes) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return plural(rest, "minute");
  return rest ? `${plural(hours, "hour")} and ${plural(rest, "minute")}` : plural(hours, "hour");
}

/** A wait, said once and not counted down: "30 seconds", "2 minutes". */
export function waitWords(ms) {
  const seconds = Math.max(1, Math.ceil(ms / 1000));
  if (seconds < 60) return plural(seconds, "second");
  return plural(Math.ceil(seconds / 60), "minute");
}

/**
 * How long until the next of `deadlines` (ms timestamps) changes its
 * minute in timeLeft(), plus a hair so the change has happened. At most a
 * minute. null when none is in the future.
 */
export function nextMinuteChange(deadlines, now = Date.now()) {
  let soonest = null;
  for (const until of deadlines) {
    if (typeof until !== "number" || until <= now) continue;
    const step = (until - now) % MINUTE || MINUTE;
    if (soonest == null || step < soonest) soonest = step;
  }
  return soonest == null ? null : soonest + 50;
}

/* ------------------------------------------------------------------ */
/* The blocked page's address                                          */
/* ------------------------------------------------------------------ */

function safeDecode(raw) {
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

/**
 * The page a black-zone redirect stands in for: the raw URL after `#` in
 * `ui/blocked.html#<url>`. A URL object when it is a web (http or https)
 * address, else null. Read as it stands first: decoding a valid URL would
 * change its query; decoded only when it is not one as it stands (the
 * whole address escaped).
 */
export function blockedOriginal(hash) {
  const raw = String(hash ?? "").replace(/^#/, "");
  if (!raw) return null;
  for (const candidate of [raw, safeDecode(raw)]) {
    if (!candidate) continue;
    try {
      const url = new URL(candidate);
      if (url.protocol === "http:" || url.protocol === "https:") return url;
    } catch {
      // Not an address as it stands; try the next reading.
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Redraw                                                              */
/* ------------------------------------------------------------------ */

function byKey(root, key) {
  if (key == null) return null;
  for (const node of root.querySelectorAll("[data-key]")) {
    if (node.dataset.key === key) return node;
  }
  return null;
}

function fieldsIn(nodes) {
  return nodes.flatMap((node) =>
    node.nodeType === Node.ELEMENT_NODE
      ? [...(node.matches("input") ? [node] : []), ...node.querySelectorAll("input")]
      : [],
  );
}

// Equal trees: same elements, attributes and words, and the same text in
// every field (a field's text is a property, which isEqualNode skips).
function sameTree(current, fresh) {
  if (current.length !== fresh.length) return false;
  if (!current.every((node, index) => node.isEqualNode(fresh[index]))) return false;
  const before = fieldsIn(current);
  const after = fieldsIn(fresh);
  return before.length === after.length && before.every((input, index) => input.value === after[index].value);
}

function swap(root, fresh) {
  const active = document.activeElement;
  const kept = active && active !== document.body && root.contains(active) ? active.dataset.key : null;
  let caret = null;
  if (kept && active instanceof HTMLInputElement) {
    try {
      caret = [active.selectionStart, active.selectionEnd, active.selectionDirection];
    } catch {
      caret = null;
    }
  }
  root.replaceChildren(...fresh);
  const target = byKey(root, kept);
  if (!target || target.disabled) return;
  target.focus({ preventScroll: true });
  if (caret && target instanceof HTMLInputElement) {
    try {
      target.setSelectionRange(...caret);
    } catch {
      // A field kind without a caret: nothing to keep.
    }
  }
}

/**
 * Draws `build()` into `root`, keeping the reader's place. When the new
 * tree equals what is shown, nothing is touched: a running clock or a
 * storage echo does not re-create the control under the keyboard, and a
 * switch that went through finishes its slide. Otherwise the children are
 * replaced and focus moves to the element with the same `data-key` as
 * before (with its caret, for a field). `focus` then moves it to that key;
 * `select` selects that field's text (after a wrong password, so typing
 * replaces it).
 */
export function redraw(root, build, { focus, select = false } = {}) {
  lastId = 0;
  const holder = document.createElement("div");
  append(holder, [build()]);
  const fresh = [...holder.childNodes];
  if (!sameTree([...root.childNodes], fresh)) swap(root, fresh);
  const target = byKey(root, focus);
  if (!target || target.disabled) return;
  target.focus();
  if (select && target instanceof HTMLInputElement) target.select();
}
