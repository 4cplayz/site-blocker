// The black zone page, opened as `ui/blocked.html#<the original URL>`.
// Calm and plain: which site, that it is in the black zone, and a way
// through: a timed pass for the password, then on to the page asked for.

import { send } from "./api.js";
import {
  announce,
  blockedOriginal,
  button,
  h,
  icon,
  minutesWords,
  passwordField,
  redraw,
  segmented,
  text,
  waitWords,
} from "./components.js";

const MINUTES = [5, 15, 60];
const root = document.getElementById("app");
const original = blockedOriginal(location.hash);
// Nothing to go back to in a fresh tab; the button is then left out
// rather than close the tab or do nothing.
const canGoBack = history.length > 1;

const state = {
  minutes: MINUTES[0],
  password: "",
  error: null,
  busy: false,
  heldUntil: 0,
  /** The daily limit in minutes, when the site is closed for using it up. */
  spent: 0,
};

if (original) document.title = `${original.hostname} is in the black zone`;
render();
if (original) why();

// Why the site is closed: the black zone, or its daily time used up. The
// page says "black zone" until the answer is in, then the truer line.
async function why() {
  const answer = await send("whereAmI", { url: original.href });
  const { here, view } = answer;
  if (!answer.ok || !here || !view) return;
  const item =
    here.kind === "site"
      ? view.sites.find((site) => site.id === here.siteId)
      : view.custom.find((custom) => custom.domain === here.domain);
  if (!item || item.blockAll || !(item.limit > 0 && item.usedMs >= item.limit * 60_000)) return;
  state.spent = item.limit;
  document.title = `${original.hostname} is closed for today`;
  render();
}

function render(place = {}) {
  redraw(root, build, place);
}

function build() {
  return [
    h(
      "section",
      { class: "card", "aria-labelledby": "blocked-title" },
      icon("shield-ban", "icon-lg"),
      h(
        "div",
        { class: "stack-tight" },
        text("title", original ? original.hostname : "This site", { as: "h1", id: "blocked-title" }),
        text(
          "body",
          state.spent
            ? `Today's ${minutesWords(state.spent)} here is used up. It opens again tomorrow.`
            : "This site is in the black zone.",
          { tone: "muted" },
        ),
      ),
      original && passForm(),
    ),
    canGoBack &&
      button({
        key: "back",
        variant: "ghost",
        icon: "arrow-left",
        label: "Go back",
        onClick: () => history.back(),
      }),
  ];
}

function passForm() {
  return h(
    "div",
    { class: "stack" },
    h(
      "div",
      { class: "stack-tight" },
      text("small", "Open it for", { tone: "muted" }),
      segmented({
        label: "Open it for",
        key: "minutes",
        value: state.minutes,
        options: MINUTES.map((minutes) => ({ value: minutes, label: `${minutes} minutes` })),
        onChange: (minutes) => {
          state.minutes = minutes;
          render();
        },
      }),
    ),
    passwordField({
      key: "password",
      value: state.password,
      submitLabel: `Open for ${state.minutes} minutes`,
      error: state.error,
      held: Date.now() < state.heldUntil,
      busy: state.busy,
      onInput: (value) => {
        state.password = value;
      },
      onSubmit: grant,
    }),
  );
}

async function grant() {
  if (state.busy || Date.now() < state.heldUntil) return;
  if (!state.password) {
    state.error = "Type the password first.";
    render({ focus: "password" });
    return;
  }
  state.busy = true;
  state.error = null;
  render();
  const answer = await send("grantPass", {
    domain: original.hostname,
    minutes: state.minutes,
    password: state.password,
  });
  state.busy = false;
  if (answer.ok) {
    location.replace(original.href);
    return;
  }
  let place = {};
  if (answer.error === "wrong-password") {
    hold(answer.retryInMs);
    place = { focus: "password", select: true };
  } else if (answer.error === "no-answer") {
    state.error = "The blocker is not answering. Reload the extension, then try again.";
  } else {
    state.error = answer.message || "That did not go through. Try again.";
  }
  announce(state.error);
  render(place);
}

// A wrong password: said once with its wait, not counted down; the
// button stays disabled until the wait is over.
function hold(retryInMs) {
  const wait = Number(retryInMs) || 0;
  if (wait <= 0) {
    state.error = "Wrong password.";
    return;
  }
  const message = `Wrong password. You can try again in ${waitWords(wait)}.`;
  state.heldUntil = Date.now() + wait;
  state.error = message;
  setTimeout(() => {
    if (state.error === message) state.error = "Wrong password.";
    render();
  }, wait + 50);
}
