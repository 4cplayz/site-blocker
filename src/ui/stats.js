// The "Time spent" page: the daily average and today, a bar per day, and
// how the average splits between the sites. It only draws getStats's
// answer (background/stats.js); the page refetches as the count moves.

import { send } from "./api.js";
import { cx, h, hoursMinutes, icon, segmented, text, uid } from "./components.js";
import { createPage, failureNotice } from "./page.js";

const RANGES = [
  { value: 7, label: "7 days" },
  { value: 30, label: "30 days" },
];
/** The sites listed by name; the rest are summed in one last row. */
const LISTED = 10;

let range = RANGES[0].value;

const page = createPage({
  root: document.getElementById("app"),
  load: () => send("getStats", { days: range }),
  build,
});
page.start();

function build(page) {
  const head = h(
    "header",
    { class: "section-head" },
    text("display", "Time spent"),
    text(
      "small",
      "Counted while a site is in front of you or playing sound. The numbers stay on this computer.",
      { tone: "muted" },
    ),
  );
  const { stats } = page;
  if (!stats) return [head, failureNotice(page), settingsLink()];
  return [
    head,
    failureNotice(page),
    segmented({
      label: "Days shown",
      key: "range",
      value: range,
      options: RANGES,
      onChange: (value) => {
        range = value;
        page.focus(`range:${value}`);
        page.refresh();
      },
    }),
    summary(stats),
    bySite(stats),
    settingsLink(),
  ];
}

function plural(count, word) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/** The two figures, then a bar per day. */
function summary(stats) {
  const note =
    stats.averageDays === 0
      ? "Today so far. The average starts tomorrow."
      : `Over ${plural(stats.averageDays, "full day")}, today left out.`;
  return h(
    "section",
    { class: "card", "aria-label": "Summary" },
    h(
      "div",
      { class: "stats" },
      stat("Daily average", hoursMinutes(stats.averageMs), note),
      stat("Today", hoursMinutes(stats.todayMs)),
    ),
    chart(stats),
  );
}

function stat(label, value, note) {
  return h(
    "div",
    { class: "stat" },
    text("small", label, { tone: "muted" }),
    text("title", value, { as: "p" }),
    note && text("small", note, { tone: "muted" }),
  );
}

function dateOf(day) {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date);
}

/**
 * A bar per day, the tallest day filling the height. Seven days are named
 * under their bars; thirty have a date under every seventh.
 */
function chart(stats) {
  const { days } = stats;
  const most = Math.max(1, ...days.map((each) => each.ms));
  const week = days.length <= 7;
  return h(
    "ul",
    { class: "chart", "aria-label": "Time per day" },
    days.map((each, index) => {
      const fromEnd = days.length - 1 - index;
      const date = dateOf(each.day);
      const long = date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
      const short =
        fromEnd === 0
          ? "Today"
          : week
            ? date.toLocaleDateString("en-GB", { weekday: "short" })
            : fromEnd % 7 === 0
              ? date.toLocaleDateString("en-GB", { day: "numeric", month: "short" })
              : " ";
      const bar = h("div", { class: cx("chart-bar", each.ms === 0 && "is-empty") });
      bar.style.setProperty("--share", (each.ms / most).toFixed(4));
      const said = `${long}: ${hoursMinutes(each.ms)}`;
      return h(
        "li",
        { class: "chart-col", title: said },
        h("div", { class: "chart-track", "aria-hidden": "true" }, bar),
        h("span", { class: "sr-only" }, said),
        text("label", short, { tone: "muted", class: "chart-label", "aria-hidden": "true" }),
      );
    }),
  );
}

/** The average, site by site: its time a day, its share, its time today. */
function bySite(stats) {
  const id = uid("by-site");
  const averaged = stats.averageDays > 0;
  const listed = stats.sites.slice(0, LISTED);
  const rest = stats.sites.slice(LISTED);
  const rows = listed.map((site) => shareRow(stats, site));
  if (rest.length > 0) {
    rows.push(
      shareRow(stats, {
        name: plural(rest.length, "other site"),
        averageMs: rest.reduce((sum, site) => sum + site.averageMs, 0),
        todayMs: rest.reduce((sum, site) => sum + site.todayMs, 0),
      }),
    );
  }
  return h(
    "section",
    { class: "card", "aria-labelledby": id },
    h(
      "div",
      { class: "stack-tight" },
      text("heading", "By site", { id }),
      text("small", averaged ? "Each site's time a day, over the same days." : "Today so far.", {
        tone: "muted",
      }),
    ),
    rows.length > 0
      ? h("ul", { class: "rows" }, rows)
      : text("small", "Nothing counted yet. Time shows up here as you browse.", { tone: "muted" }),
  );
}

function shareRow(stats, site) {
  const share = stats.averageMs > 0 ? site.averageMs / stats.averageMs : 0;
  const percent = share > 0 && share < 0.01 ? "Under 1%" : `${Math.round(share * 100)}%`;
  const fill = h("div", { class: "meter-fill" });
  fill.style.setProperty("--share", share.toFixed(4));
  const today = stats.averageDays > 0 ? ` · ${hoursMinutes(site.todayMs)} today` : "";
  return h(
    "li",
    { class: "stack-tight" },
    h(
      "div",
      { class: "split" },
      text("body", site.name),
      text("body", hoursMinutes(site.averageMs), { as: "span" }),
    ),
    h("div", { class: "meter", "aria-hidden": "true" }, fill),
    text("small", `${percent} of the time${today}`, { tone: "muted" }),
  );
}

function settingsLink() {
  return h(
    "a",
    { href: "options.html", class: "footer-link text-small", key: "settings" },
    icon("settings"),
    "All settings",
  );
}
