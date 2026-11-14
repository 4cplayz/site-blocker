// The page logic the popup and the options page share: the state a page
// draws from, what an answer does to it (CLAUDE.md § Message API), the
// password prompt a refused loosening opens and the retry after unlocking,
// and the parts both pages show (the lock, a site's switches, a pass).
// The background decides everything; a page only keeps what it is showing
// and what is being typed.

import { onStateChange, send } from "./api.js";
import {
  announce,
  button,
  h,
  lockStatus,
  minutesWords,
  nextMinuteChange,
  notice,
  passwordField,
  segmented,
  switchRow,
  text,
  timeLeft,
  uid,
  waitWords,
  redraw,
} from "./components.js";

const NO_ANSWER = "The blocker is not answering. Reload the extension, then open this again.";
const FAILED = "That did not go through. Try again.";
const DORMANT = "The whole site is blocked, so these wait until it opens again.";

/**
 * A page: `load()` fetches its answer (getView, or whereAmI for the
 * popup), `build(page)` returns its nodes from `page`. Every answer is
 * drawn at once; a change behind the page (onStateChange) and the next
 * minute of a running clock refetch.
 */
export function createPage({ root, load, build }) {
  const page = {
    view: null,
    /** whereAmI's `here`, for the popup. */
    here: null,
    /** A change refused while locked, waiting for the password:
     * { key, reason, run, focus, done }. One at a time. */
    prompt: null,
    /** A control's key -> the sentence said next to it. */
    errors: {},
    /** A field's key -> what is typed in it, so a redraw keeps it. */
    drafts: {},
    /** Keys whose call is out; a second press waits for the first. */
    busy: new Set(),
    /** A wrong password's wait, for every password field on the page. */
    heldUntil: 0,
    /** true = the last call found nobody answering. */
    failed: false,
  };
  let tick = 0;
  let place = {};

  function take(answer) {
    const failed = answer.error === "no-answer";
    if (failed && !page.failed) announce(NO_ANSWER);
    page.failed = failed;
    if (answer.view) page.view = answer.view;
    if ("here" in answer) page.here = answer.here;
  }

  /** Where focus goes on the next draw (else it stays where it was). */
  page.focus = (key, select = false) => {
    place = { focus: key, select };
  };

  page.render = () => {
    redraw(root, () => build(page), place);
    place = {};
    // Remaining times are whole minutes: draw again when one changes, by
    // asking again, so a lapsed unlock or pass shows as the background
    // now sees it.
    clearTimeout(tick);
    const delay = page.view ? nextMinuteChange(deadlines(page.view)) : null;
    if (delay != null) tick = setTimeout(page.refresh, delay);
  };

  page.refresh = async () => {
    take(await load());
    page.render();
  };

  page.held = () => Date.now() < page.heldUntil;

  /**
   * Runs a change. `run()` sends it and resolves to the answer to draw.
   * Refused while locked, the change waits in a password prompt opened at
   * `key`, saying `reason`; after a successful unlock it runs again.
   * `focus` is where focus goes once it went through, `done` what else.
   */
  page.act = async (key, run, { reason, focus, done } = {}) => {
    if (page.busy.has(key)) return;
    page.busy.add(key);
    delete page.errors[key];
    // Acting elsewhere drops a change still waiting for the password: it
    // must not run later, unasked.
    if (page.prompt && page.prompt.key !== key) dropPrompt();
    const answer = await run();
    page.busy.delete(key);
    take(answer);
    if (answer.ok) {
      if (page.prompt?.key === key) dropPrompt();
      done?.(answer);
      if (focus) page.focus(focus);
    } else if (answer.error === "locked") {
      page.prompt = { key, reason: reason ?? "This needs the password.", run, focus, done };
      page.drafts.prompt = "";
      delete page.errors.prompt;
      page.focus("prompt");
    } else if (answer.error !== "no-answer") {
      page.errors[key] = answer.message || FAILED;
      announce(page.errors[key]);
    }
    page.render();
  };

  /** Unlocks with what is typed in the field `field`, then runs the
   * change that was waiting, if any. */
  page.unlock = async (field) => {
    if (page.busy.has(field) || page.held()) return;
    const password = page.drafts[field] ?? "";
    if (!password) {
      page.errors[field] = "Type the password first.";
      page.focus(field);
      page.render();
      return;
    }
    page.busy.add(field);
    delete page.errors[field];
    page.render();
    const answer = await send("unlock", { password });
    page.busy.delete(field);
    take(answer);
    if (answer.ok) {
      page.drafts[field] = "";
      const waiting = page.prompt;
      dropPrompt();
      if (waiting) {
        await page.act(waiting.key, waiting.run, {
          reason: waiting.reason,
          focus: waiting.focus ?? waiting.key,
          done: waiting.done,
        });
        return;
      }
      page.focus("lock");
    } else if (answer.error === "wrong-password") {
      hold(field, answer.retryInMs);
      page.focus(field, true);
      announce(page.errors[field]);
    } else if (answer.error !== "no-answer") {
      page.errors[field] = answer.message || FAILED;
      announce(page.errors[field]);
    }
    page.render();
  };

  page.lock = async () => {
    const answer = await send("lock");
    take(answer);
    if (answer.ok) page.focus("unlock");
    else if (answer.error !== "no-answer") {
      page.errors.lock = answer.message || FAILED;
      announce(page.errors.lock);
    }
    page.render();
  };

  page.closePrompt = () => {
    const waiting = page.prompt;
    dropPrompt();
    if (waiting) page.focus(waiting.key);
    page.render();
  };

  page.dismiss = (key) => {
    delete page.errors[key];
    page.focus(key);
    page.render();
  };

  page.start = async () => {
    onStateChange(page.refresh);
    await page.refresh();
  };

  function dropPrompt() {
    page.prompt = null;
    page.drafts.prompt = "";
    delete page.errors.prompt;
  }

  // A wrong password: said once with its wait, not counted down; every
  // password button stays disabled until the wait is over.
  function hold(field, retryInMs) {
    const wait = Number(retryInMs) || 0;
    if (wait <= 0) {
      page.errors[field] = "Wrong password.";
      return;
    }
    const message = `Wrong password. You can try again in ${waitWords(wait)}.`;
    page.heldUntil = Date.now() + wait;
    page.errors[field] = message;
    setTimeout(() => {
      if (page.errors[field] === message) page.errors[field] = "Wrong password.";
      page.render();
    }, wait + 50);
  }

  return page;
}

function deadlines(view) {
  return [view.locked ? null : view.unlockedUntil, ...(view.passes ?? []).map((pass) => pass.until)];
}

/* ------------------------------------------------------------------ */
/* Parts both pages show                                               */
/* ------------------------------------------------------------------ */

/** The page's first line while the background is not answering. */
export function failureNotice(page) {
  return page.failed ? notice({ message: NO_ANSWER }) : null;
}

/** What follows a control: its error, and the password prompt it opened. */
export function feedback(page, key) {
  return [
    page.errors[key] &&
      notice({
        message: page.errors[key],
        key: `${key}:dismiss`,
        onDismiss: () => page.dismiss(key),
      }),
    page.prompt?.key === key && promptPanel(page),
  ];
}

function promptPanel(page) {
  return h(
    "div",
    { class: "prompt" },
    passwordField({
      key: "prompt",
      value: page.drafts.prompt ?? "",
      reason: page.prompt.reason,
      submitLabel: "Unlock",
      error: page.errors.prompt,
      held: page.held(),
      busy: page.busy.has("prompt"),
      onInput: (value) => {
        page.drafts.prompt = value;
      },
      onSubmit: () => page.unlock("prompt"),
      onClose: () => page.closePrompt(),
    }),
  );
}

/**
 * The lock: its status in words, then the unlock field or the Lock button.
 * While a prompt is open at a control the field is that prompt's, so this
 * one steps aside rather than show two.
 */
export function lockPanel(page) {
  const { view } = page;
  return h(
    "section",
    { class: "card", "aria-label": "Lock" },
    lockStatus(view),
    view.locked &&
      !page.prompt &&
      passwordField({
        key: "unlock",
        value: page.drafts.unlock ?? "",
        submitLabel: "Unlock",
        error: page.errors.unlock,
        held: page.held(),
        busy: page.busy.has("unlock"),
        onInput: (value) => {
          page.drafts.unlock = value;
        },
        onSubmit: () => page.unlock("unlock"),
      }),
    !view.locked &&
      h(
        "div",
        { class: "cluster" },
        button({ key: "lock", label: "Lock now", icon: "lock", onClick: () => page.lock() }),
      ),
    page.errors.lock && notice({ message: page.errors.lock, key: "lock:dismiss", onDismiss: () => page.dismiss("lock") }),
  );
}

/** "a.com", "a.com or b.com", "a.com, b.com or c.com". */
function orList(items) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} or ${items.at(-1)}`;
}

const LIMIT_CHOICES = [0, 15, 30, 60, 120];

/** True when a site's daily time is used up. */
export function isOverLimit(item) {
  return item.limit > 0 && item.usedMs >= item.limit * 60_000;
}

/**
 * A site's daily limit: the time used today in words, and the choices.
 * `item` carries `limit` (minutes, 0 = none) and `usedMs`; `run(minutes)`
 * sends the change and resolves to the answer to draw. A first limit or a
 * shorter one is free; a longer one or none asks for the password.
 */
export function limitRow(page, { key, name, item, run, dormant = false }) {
  const { limit = 0, usedMs = 0 } = item;
  const words =
    limit === 0
      ? "No limit. With one, the site closes for the rest of the day once the time is used."
      : isOverLimit(item)
        ? `Today's ${minutesWords(limit)} is used up. It opens again tomorrow.`
        : `${minutesWords(Math.floor(usedMs / 60_000))} of ${minutesWords(limit)} used today.`;
  const choices = LIMIT_CHOICES.includes(limit) ? LIMIT_CHOICES : [...LIMIT_CHOICES, limit];
  return [
    h(
      "div",
      { class: dormant ? "limit-row is-dormant" : "limit-row" },
      h(
        "span",
        { class: "switch-text" },
        text("body", "Daily time", { as: "span" }),
        text("small", words, { as: "span", tone: "muted" }),
      ),
      segmented({
        label: `Daily time on ${name}`,
        key,
        value: limit,
        options: choices.map((minutes) => ({
          value: minutes,
          label: minutes === 0 ? "No limit" : minutesWords(minutes),
        })),
        onChange: (minutes) => {
          if (minutes === limit) return;
          page.act(key, () => run(minutes), {
            reason: `Giving ${name} more time needs the password.`,
            focus: `${key}:${minutes}`,
          });
        },
      }),
    ),
    feedback(page, key),
  ];
}

/**
 * A built-in site's switches: "Block the whole site", then each feature
 * with its label and description. While the whole site is blocked the
 * features rest, dimmed, under a note saying why.
 */
export function siteSwitches(page, site) {
  const blockKey = `site:${site.id}:blockAll`;
  const rows = [
    switchRow({
      key: blockKey,
      label: "Block the whole site",
      description: `No page of ${orList(site.domains)} opens.`,
      checked: site.blockAll,
      onToggle: (on) =>
        page.act(blockKey, () => send("setBlockAll", { siteId: site.id, on }), {
          reason: `Taking ${site.name} out of the black zone needs the password.`,
        }),
    }),
    feedback(page, blockKey),
    limitRow(page, {
      key: `site:${site.id}:limit`,
      name: site.name,
      item: site,
      dormant: site.blockAll,
      run: (minutes) => send("setLimit", { siteId: site.id, minutes }),
    }),
  ];
  if (site.features.length > 0) {
    const noteId = site.blockAll ? uid("note") : null;
    rows.push(h("hr"));
    if (noteId) rows.push(text("small", DORMANT, { tone: "muted", id: noteId, class: "dormant-note" }));
    for (const feature of site.features) {
      const key = `site:${site.id}:feature:${feature.id}`;
      rows.push(
        switchRow({
          key,
          label: feature.label,
          description: feature.description,
          checked: feature.on,
          dormant: site.blockAll,
          noteId,
          onToggle: (on) =>
            page.act(key, () => send("setFeature", { siteId: site.id, featureId: feature.id, on }), {
              reason: `Turning off ${feature.label} needs the password.`,
            }),
        }),
        feedback(page, key),
      );
    }
  }
  return h("div", { class: "switch-list" }, rows);
}

/** The three switches every custom site has. */
const CUSTOM_SWITCHES = [
  {
    key: "blockAll",
    label: "Block the whole site",
    description: (domain) => `No page of ${domain} opens.`,
    reason: (domain) => `Taking ${domain} out of the black zone needs the password.`,
  },
  {
    key: "images",
    label: "Hide images",
    description: () => "Pictures on its pages are hidden.",
    reason: (domain) => `Showing images on ${domain} again needs the password.`,
  },
  {
    key: "videos",
    label: "Hide videos",
    description: () => "Videos on its pages are hidden.",
    reason: (domain) => `Showing videos on ${domain} again needs the password.`,
  },
];

/** A custom site's switches: block the whole site, hide images, hide
 * videos; the last two rest while the whole site is blocked. */
export function customSwitches(page, custom) {
  const { domain } = custom;
  const noteId = custom.blockAll ? uid("note") : null;
  const rows = [];
  for (const item of CUSTOM_SWITCHES) {
    const key = `custom:${domain}:${item.key}`;
    const part = item.key !== "blockAll";
    if (part && item.key === "images") {
      rows.push(
        limitRow(page, {
          key: `custom:${domain}:limit`,
          name: domain,
          item: custom,
          dormant: custom.blockAll,
          run: (minutes) => send("setLimit", { domain, minutes }),
        }),
      );
      rows.push(h("hr"));
      if (noteId) rows.push(text("small", DORMANT, { tone: "muted", id: noteId, class: "dormant-note" }));
    }
    rows.push(
      switchRow({
        key,
        label: item.label,
        description: item.description(domain),
        checked: custom[item.key],
        dormant: part && custom.blockAll,
        noteId: part ? noteId : null,
        onToggle: (on) =>
          page.act(key, () => send("setCustom", { domain, key: item.key, on }), {
            reason: item.reason(domain),
          }),
      }),
      feedback(page, key),
    );
  }
  return h("div", { class: "switch-list" }, rows);
}

/**
 * A running pass: the domain, its time left in words, and "End now".
 * `after` is the key focus moves to once the row is gone.
 */
export function passRow(page, pass, { now = Date.now(), after } = {}) {
  const key = `pass:${pass.domain}`;
  return [
    h(
      "div",
      { class: "split" },
      h(
        "div",
        {},
        text("body", pass.domain),
        text("small", `Open for ${timeLeft(pass.until - now)}`, { tone: "muted" }),
      ),
      button({
        key,
        label: "End now",
        onClick: () => page.act(key, () => send("revokePass", { domain: pass.domain }), { focus: after }),
      }),
    ),
    feedback(page, key),
  ];
}
