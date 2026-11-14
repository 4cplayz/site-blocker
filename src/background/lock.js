// The lock. Loosening anything needs the password; the worker is the only
// place that checks it. The build puts a salted PBKDF2 digest of the .env
// password in generated/secret.js, never the password.
import { SECRET } from "../generated/secret.js";

/** How long one unlock lasts. */
export const UNLOCK_MINUTES = 10;
export const RELOCK_ALARM = "relock";
/** Wrong tries before the waits start, and the waits' ceiling. */
const FREE_TRIES = 3;
const MAX_WAIT_MS = 15 * 60_000;

const toBytes = (hex) => Uint8Array.from(hex.match(/../g), (pair) => parseInt(pair, 16));
const toHex = (buffer) =>
  [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");

async function digestOf(password) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: toBytes(SECRET.salt), iterations: SECRET.iterations },
    key,
    256,
  );
  return toHex(bits);
}

/**
 * Checks a password. `{ ok: true }`, or `{ ok: false, retryInMs }` when it
 * is wrong or a wait is running. The count of wrong tries is kept on disk,
 * so restarting the browser does not reset the waits.
 */
export async function checkPassword(password) {
  const now = Date.now();
  const { tries = { count: 0, nextAt: 0 } } = await chrome.storage.local.get("tries");
  if (tries.nextAt > now) return { ok: false, retryInMs: tries.nextAt - now };

  const given = await digestOf(String(password ?? ""));
  // Same length always, so a plain compare leaks nothing useful.
  if (given === SECRET.digest) {
    await chrome.storage.local.remove("tries");
    return { ok: true };
  }
  const count = tries.count + 1;
  const wait =
    count < FREE_TRIES ? 0 : Math.min(30_000 * 2 ** (count - FREE_TRIES), MAX_WAIT_MS);
  await chrome.storage.local.set({ tries: { count, nextAt: now + wait } });
  return { ok: false, retryInMs: wait };
}

/** The end of the running unlock, or null when locked. */
export async function unlockedUntil() {
  const { unlockedUntil: until } = await chrome.storage.session.get("unlockedUntil");
  return typeof until === "number" && until > Date.now() ? until : null;
}

export async function openLock() {
  const until = Date.now() + UNLOCK_MINUTES * 60_000;
  // Session storage: closing the browser locks again.
  await chrome.storage.session.set({ unlockedUntil: until });
  await chrome.alarms.create(RELOCK_ALARM, { when: until });
}

export async function closeLock() {
  await chrome.storage.session.remove("unlockedUntil");
  await chrome.alarms.clear(RELOCK_ALARM);
}
