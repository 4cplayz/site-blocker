// The numbers of the "Time spent" page (ui/stats.js): the time per day, the
// daily average, and how that average splits between the sites. Read from
// what the tracker counted (usage.js): today's count and the history.
import { SITES } from "../sites/index.js";
import { dayOf, loadHistory } from "./state.js";

/** The ranges the page offers, in days ending today. */
export const STATS_RANGES = [7, 30];

/** The last `count` local days, oldest first, today last. */
function lastDays(count, now) {
  const date = new Date(now);
  // Noon: a step of one day never lands on the wrong side of a clock change.
  date.setHours(12, 0, 0, 0);
  const days = [];
  for (let i = 0; i < count; i++) {
    days.unshift(dayOf(date.getTime()));
    date.setDate(date.getDate() - 1);
  }
  return days;
}

const total = (ms) =>
  Object.values(ms ?? {}).reduce((sum, value) => sum + (typeof value === "number" ? value : 0), 0);

const nameOf = (key) => SITES.find((site) => site.id === key)?.name ?? key;

/**
 * The picture of the last `range` days:
 *   days         [{ day, ms }], oldest first, today last
 *   todayMs      the time counted today
 *   averageMs    the time per day, over the full days of the range
 *   averageDays  how many full days that is; 0 = none yet, and the
 *                "average" is today so far
 *   sites        [{ key, name, averageMs, todayMs }], the most used first
 * Today is not over, so it stays out of the average; so does any day
 * before the first one counted. A day without a record in between (the
 * browser stayed shut) is a day of no time.
 */
export async function statsFor(state, range, now = Date.now()) {
  const count = STATS_RANGES.includes(range) ? range : STATS_RANGES[0];
  const history = await loadHistory();
  const days = lastDays(count, now);
  const today = days.at(-1);
  const of = (day) => (day === today ? state.usage.ms : history[day]) ?? {};

  const first = Object.keys(history).sort()[0] ?? today;
  const full = days.slice(0, -1).filter((day) => day >= first);
  const averaged = full.length > 0 ? full : [today];

  const sums = {};
  for (const day of averaged) {
    for (const [key, ms] of Object.entries(of(day))) {
      if (typeof ms === "number" && ms > 0) sums[key] = (sums[key] ?? 0) + ms;
    }
  }
  const keys = new Set([...Object.keys(sums), ...Object.keys(state.usage.ms)]);
  const sites = [...keys]
    .map((key) => ({
      key,
      name: nameOf(key),
      averageMs: Math.round((sums[key] ?? 0) / averaged.length),
      todayMs: Math.round(state.usage.ms[key] ?? 0),
    }))
    .sort((a, b) => b.averageMs - a.averageMs || b.todayMs - a.todayMs || a.name.localeCompare(b.name));

  return {
    range: count,
    days: days.map((day) => ({ day, ms: Math.round(total(of(day))) })),
    todayMs: Math.round(total(state.usage.ms)),
    averageMs: Math.round(total(sums) / averaged.length),
    averageDays: full.length,
    sites,
  };
}
