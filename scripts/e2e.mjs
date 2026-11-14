// End-to-end check: loads dist/ into a throwaway Chromium profile and drives
// the real extension over the DevTools protocol. No dependencies.
//   npm run build && npm run e2e
// CHROME_PATH picks the browser; it must be a Chromium that still accepts
// --load-extension (Playwright's Chromium does; branded Chrome 137+ does not).
// SHOTS=<folder> also saves a screenshot of each page of the UI there.
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const PORT = 9339;
// example.com and example.org resolve to this machine (--host-resolver-rules),
// so the run needs no network and touches no real site.
const WEB = 8123;
const SITE = `http://example.com:${WEB}`;
const server = createServer((request, response) => {
  // /strict is a page as locked down as the big sites are.
  const strict = request.url.startsWith("/strict")
    ? { "content-security-policy": "default-src 'self'; require-trusted-types-for 'script'" }
    : {};
  response.writeHead(200, { "content-type": "text/html", ...strict });
  // /busy has a control pinned in three corners: the timer must keep off them.
  const pin = (where) => `<button style="position:fixed;${where};width:160px;height:60px">menu</button>`;
  const busy = request.url.startsWith("/busy")
    ? pin("left:0;bottom:0") + pin("right:0;bottom:0") + pin("right:0;top:0")
    : "";
  response.end(`<!doctype html><title>test</title><p>A page.</p><img alt=''><video></video>${busy}`);
}).listen(WEB, "127.0.0.1");

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const base = join(process.env.LOCALAPPDATA ?? "", "ms-playwright");
  if (existsSync(base)) {
    const build = readdirSync(base)
      .filter((name) => /^chromium-\d+$/.test(name))
      .sort()
      .at(-1);
    if (build) return join(base, build, "chrome-win64", "chrome.exe");
  }
  throw new Error("No Chromium found. Set CHROME_PATH.");
}

function readPassword() {
  const line = readFileSync(join(root, ".env"), "utf8")
    .split(/\r?\n/)
    .find((l) => /^\s*BLOCKER_PASSWORD\s*=/.test(l));
  return line.replace(/^[^=]*=/, "").trim().replace(/^(["'])(.*)\1$/, "$2");
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** A flat-session DevTools connection. */
class Browser {
  #socket;
  #next = 1;
  #waiting = new Map();
  errors = [];

  static async connect() {
    for (let i = 0; i < 100; i++) {
      try {
        const info = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
        const browser = new Browser();
        await browser.#open(info.webSocketDebuggerUrl);
        return browser;
      } catch {
        await sleep(100);
      }
    }
    throw new Error("The browser did not start.");
  }

  #open(url) {
    this.#socket = new WebSocket(url);
    this.#socket.addEventListener("message", ({ data }) => {
      const message = JSON.parse(data);
      if (message.id) {
        const { resolve, reject } = this.#waiting.get(message.id);
        this.#waiting.delete(message.id);
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result);
      } else if (message.method === "Runtime.exceptionThrown") {
        const details = message.params.exceptionDetails;
        this.errors.push(details.exception?.description ?? details.text);
      } else if (message.method === "Log.entryAdded" && message.params.entry.level === "error") {
        this.errors.push(`${message.params.entry.text} (${message.params.entry.url ?? ""})`);
      }
    });
    return new Promise((resolve, reject) => {
      this.#socket.addEventListener("open", resolve);
      this.#socket.addEventListener("error", reject);
    });
  }

  send(method, params = {}, sessionId) {
    const id = this.#next++;
    this.#socket.send(JSON.stringify({ id, method, params, sessionId }));
    return new Promise((resolve, reject) => this.#waiting.set(id, { resolve, reject }));
  }

  async targets() {
    return (await this.send("Target.getTargets")).targetInfos;
  }

  async open(url, { width = 1100, height = 800 } = {}) {
    const { targetId } = await this.send("Target.createTarget", { url });
    const { sessionId } = await this.send("Target.attachToTarget", { targetId, flatten: true });
    const page = new Page(this, targetId, sessionId);
    await this.send("Page.enable", {}, sessionId);
    await this.send("Runtime.enable", {}, sessionId);
    await this.send("Log.enable", {}, sessionId);
    await this.send(
      "Emulation.setDeviceMetricsOverride",
      { width, height, deviceScaleFactor: 1, mobile: false },
      sessionId,
    );
    await sleep(400);
    return page;
  }

  close() {
    this.#socket.close();
  }
}

class Page {
  constructor(browser, targetId, sessionId) {
    Object.assign(this, { browser, targetId, sessionId });
  }
  async goto(url) {
    await this.browser.send("Page.navigate", { url }, this.sessionId).catch(() => {});
    await sleep(400);
  }
  async url() {
    const all = await this.browser.targets();
    return all.find((target) => target.targetId === this.targetId)?.url ?? "";
  }
  /** Waits until the tab's URL passes `test`; returns the URL either way. */
  async settle(test, ms = 8000) {
    const end = Date.now() + ms;
    let url = await this.url();
    while (!test(url) && Date.now() < end) {
      await sleep(150);
      url = await this.url();
    }
    return url;
  }
  async eval(expression) {
    const result = await this.browser.send(
      "Runtime.evaluate",
      { expression, awaitPromise: true, returnByValue: true },
      this.sessionId,
    );
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    }
    return result.result.value;
  }
  ask(type, args = {}) {
    return this.eval(`chrome.runtime.sendMessage(${JSON.stringify({ type, ...args })})`);
  }
  async shot(name) {
    if (!process.env.SHOTS) return;
    mkdirSync(process.env.SHOTS, { recursive: true });
    const { data } = await this.browser.send(
      "Page.captureScreenshot",
      { format: "png", captureBeyondViewport: true },
      this.sessionId,
    );
    writeFileSync(join(process.env.SHOTS, `${name}.png`), Buffer.from(data, "base64"));
  }
  async close() {
    await this.browser.send("Target.closeTarget", { targetId: this.targetId }).catch(() => {});
  }
}

let failed = 0;
function check(name, pass, detail = "") {
  if (!pass) failed++;
  console.log(`${pass ? "ok  " : "FAIL"}  ${name}${pass || !detail ? "" : `\n        ${detail}`}`);
}

const profile = mkdtempSync(join(tmpdir(), "site-blocker-e2e-"));
const chrome = spawn(
  findChrome(),
  [
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${PORT}`,
    `--disable-extensions-except=${dist}`,
    `--load-extension=${dist}`,
    "--headless=new",
    "--no-first-run",
    "--no-default-browser-check",
    "--host-resolver-rules=MAP example.com 127.0.0.1, MAP *.example.com 127.0.0.1, MAP example.org 127.0.0.1, MAP youtube.com 127.0.0.1",
    "--disable-features=DisableLoadExtensionCommandLineSwitch",
    "about:blank",
  ],
  { stdio: "ignore" },
);

let browser;
try {
  browser = await Browser.connect();
  const password = readPassword();

  // The extension's id, from its service worker or the options page it opens.
  let id;
  for (let i = 0; i < 80 && !id; i++) {
    const own = (await browser.targets()).find((t) =>
      t.url.endsWith("/background/service-worker.js"),
    );
    id = own && new URL(own.url).host;
    if (!id) await sleep(150);
  }
  if (!id) throw new Error("The extension did not load (is dist/ built?).");
  const ext = (path) => `chrome-extension://${id}/${path}`;
  const blocked = (url) => ext(`ui/blocked.html#${url}`);

  const options = await browser.open(ext("ui/options.html"));
  await sleep(600);
  let answer = await options.ask("getView");
  check("the options page talks to the worker", answer?.ok === true && answer.view.locked === true);
  check(
    "five sites, each with the three standard blockers or a reason not to",
    answer.view.sites.length === 5 && answer.view.sites.every((s) => s.features.length > 0),
    JSON.stringify(answer.view.sites.map((s) => [s.id, s.features.map((f) => f.id)])),
  );
  await options.shot("options-start");

  // --- the black zone -------------------------------------------------
  answer = await options.ask("addCustom", { input: "https://www.example.com/some/page?x=1" });
  check(
    "a pasted URL is stored as its domain, blocked",
    answer.ok && answer.view.custom.some((c) => c.domain === "example.com" && c.blockAll),
  );
  answer = await options.ask("addCustom", { input: "not a site" });
  check("nonsense is refused with a sentence", answer.error === "invalid" && !!answer.message);

  const tab = await browser.open(`${SITE}/`);
  let url = await tab.settle((u) => u.startsWith(ext("")));
  check("a black-zone site lands on the blocked page", url === blocked(`${SITE}/`), url);
  await sleep(500);
  await tab.shot("blocked");
  await tab.goto(`http://sub.example.com:${WEB}/a/b?c=d#e`);
  url = await tab.settle((u) => u.includes("sub.example.com"));
  check("its subdomains too, the whole URL kept", url === blocked(`http://sub.example.com:${WEB}/a/b?c=d#e`), url);

  // --- the lock -------------------------------------------------------
  answer = await options.ask("removeCustom", { domain: "example.com" });
  check("loosening while locked is refused", answer.error === "locked" && answer.view.custom.length === 1);
  answer = await options.ask("setCustom", { domain: "example.com", key: "images", on: true });
  check("tightening while locked is free", answer.ok === true);
  answer = await options.ask("unlock", { password: `${password}-wrong` });
  check("a wrong password is refused", answer.error === "wrong-password" && answer.view.locked);

  answer = await options.ask("grantPass", { domain: "www.example.com", minutes: 5, password: "nope" });
  check("a pass needs the password", answer.error === "wrong-password");
  answer = await options.ask("grantPass", { domain: "www.example.com", minutes: 7, password });
  check("a pass is 5, 15 or 60 minutes", answer.error === "invalid");
  answer = await options.ask("grantPass", { domain: "www.example.com", minutes: 5, password });
  check("the right password gives a pass", answer.ok && answer.view.passes.length === 1);
  check("a pass does not open the lock", answer.view.locked === true);
  await tab.goto(`${SITE}/`);
  url = await tab.settle((u) => u.startsWith(SITE));
  check("with a pass the site opens", url === `${SITE}/`, url);
  const hidden = await tab.eval(
    `[getComputedStyle(document.querySelector("img")).display, getComputedStyle(document.querySelector("video")).display].join()`,
  );
  check("and its images are hidden, its videos not", hidden === "none,inline", hidden);
  answer = await options.ask("revokePass", { domain: "example.com" });
  url = await tab.settle((u) => u.startsWith(ext("")));
  check("ending the pass closes the open tab", url === blocked(`${SITE}/`), url);

  answer = await options.ask("unlock", { password });
  check("the right password opens the lock", answer.ok && answer.view.locked === false);
  await options.shot("options-unlocked");
  answer = await options.ask("removeCustom", { domain: "example.com" });
  check("unlocked, the site can be removed", answer.ok && answer.view.custom.length === 0);
  await tab.goto(`${SITE}/`);
  url = await tab.settle((u) => u.startsWith(SITE));
  check("and opens again", url === `${SITE}/`, url);

  // --- daily limits ---------------------------------------------------
  const ORG = `http://example.org:${WEB}`;
  const today = await options.eval(
    `(() => { const d = new Date(); const two = (n) => String(n).padStart(2, "0"); return d.getFullYear() + "-" + two(d.getMonth() + 1) + "-" + two(d.getDate()); })()`,
  );
  const org = async () => (await options.ask("getView")).view.custom.find((c) => c.domain === "example.org");
  const setUsage = (day, ms) =>
    options.eval(`chrome.storage.local.set({ usage: { day: ${JSON.stringify(day)}, ms: { "example.org": ${ms} } } })`);

  answer = await options.ask("setLimit", { domain: "example.org", minutes: 30 });
  check(
    "a daily limit lists an unlisted site, left open",
    answer.ok && answer.view.custom.some((c) => c.domain === "example.org" && c.limit === 30 && !c.blockAll),
  );
  answer = await options.ask("setLimit", { domain: "example.org", minutes: 2.5 });
  check("a limit is whole minutes", answer.error === "invalid");
  const timed = await browser.open(`${ORG}/`);
  url = await timed.settle((u) => u.startsWith(ORG));
  check("under its limit the site opens", url === `${ORG}/`, url);
  const chip = (page) =>
    page.eval(`(() => {
      const timer = document.querySelector("sb-timer");
      if (!timer) return null;
      const box = timer.getBoundingClientRect();
      return { text: timer.getAttribute("aria-label"), left: box.left < 60, top: box.top < 60,
        bottom: box.bottom > innerHeight - 60, shown: box.width > 0,
        covers: [...document.querySelectorAll("button")].filter((button) => {
          const b = button.getBoundingClientRect();
          return box.left < b.right && b.left < box.right && box.top < b.bottom && b.top < box.bottom;
        }).length };
    })()`);
  await sleep(1500);
  let drawn = await chip(timed);
  check("and draws its timer, the time left today", drawn?.shown && /^(29:\d\d|30:00)$/.test(drawn.text), JSON.stringify(drawn));
  check("in the bottom left corner of an empty page", drawn?.left && drawn?.bottom, JSON.stringify(drawn));
  await timed.goto(`${ORG}/busy`);
  await sleep(1500);
  drawn = await chip(timed);
  check(
    "and clear of the controls pinned in the corners of a busy one",
    drawn?.shown && drawn.covers === 0 && !(drawn.left && drawn.bottom),
    JSON.stringify(drawn),
  );
  await timed.shot("timer");
  await timed.goto(`${ORG}/strict`);
  await sleep(1500);
  drawn = await chip(timed);
  check("a strict page (CSP, Trusted Types) gets its timer too", drawn?.shown === true, JSON.stringify(drawn));
  check("without an error", browser.errors.length === 0, browser.errors.join(" | "));
  await timed.goto(`${ORG}/`);
  await options.ask("lock");
  answer = await options.ask("setLimit", { domain: "example.org", minutes: 15 });
  check("a shorter limit is free while locked", answer.ok && (await org()).limit === 15);
  console.log(`      tracked ${(await org()).usedMs} ms in front`);
  answer = await options.ask("setLimit", { domain: "example.org", minutes: 60 });
  check("a longer limit while locked is refused", answer.error === "locked" && (await org()).limit === 15);
  answer = await options.ask("setLimit", { domain: "example.org", minutes: 0 });
  check("so is taking the limit away", answer.error === "locked" && (await org()).limit === 15);
  answer = await options.ask("removeCustom", { domain: "example.org" });
  check("and removing the site", answer.error === "locked");

  await sleep(300);
  await setUsage(today, 15 * 60_000);
  await timed.goto(`${ORG}/again`);
  url = await timed.settle((u) => u.startsWith(ext("")));
  check("its time used up, the site is closed", url === blocked(`${ORG}/again`), url);
  await sleep(500);
  const line = await timed.eval(`document.querySelector(".card").textContent`);
  check("and the blocked page says why", /used up/.test(line), line);
  await timed.shot("blocked-limit");
  answer = await options.ask("grantPass", { domain: "example.org", minutes: 5, password });
  check("the password still gives a pass", answer.ok === true, answer.message);
  await timed.goto(`${ORG}/`);
  url = await timed.settle((u) => u.startsWith(ORG));
  check("which opens it", url === `${ORG}/`, url);
  await options.ask("revokePass", { domain: "example.org" });
  url = await timed.settle((u) => u.startsWith(ext("")));
  check("and ending the pass closes it again", url === blocked(`${ORG}/`), url);

  await sleep(300);
  await setUsage("2000-01-01", 15 * 60_000);
  // The first load still meets yesterday's rule; it also wakes the
  // tracker, which sees the new day and opens the site (as the half-minute
  // tick does on its own).
  await timed.goto(`${ORG}/`);
  await sleep(1000);
  await timed.goto(`${ORG}/`);
  url = await timed.settle((u) => u.startsWith(ORG));
  check("a new day starts from nothing", url === `${ORG}/` && (await org()).usedMs < 60_000, url);
  await timed.close();
  await options.ask("unlock", { password });
  answer = await options.ask("removeCustom", { domain: "example.org" });
  check("unlocked, the limited site can be removed", answer.ok === true);

  // --- every site module, everything on --------------------------------
  const { view } = await options.ask("getView");
  for (const site of view.sites) {
    for (const feature of site.features) {
      answer = await options.ask("setFeature", { siteId: site.id, featureId: feature.id, on: true });
      check(`${site.id} / ${feature.id} applies`, answer.ok === true, answer.message);
    }
  }
  const rules = await options.eval("chrome.declarativeNetRequest.getDynamicRules()");
  const scripts = await options.eval("chrome.scripting.getRegisteredContentScripts()");
  check("one registered stylesheet set per site", scripts.length === 5, `${scripts.length}`);
  console.log(`      ${rules.length} network rules, ${scripts.flatMap((s) => s.css).length} stylesheets`);

  const outcome = async (target) =>
    (
      await options.eval(
        `chrome.declarativeNetRequest.testMatchOutcome({ url: ${JSON.stringify(target)}, type: "main_frame" })`,
      )
    ).matchedRules.length > 0;
  check("youtube.com/shorts/… is closed", await outcome("https://www.youtube.com/shorts/abc123"));
  check("youtube.com/shorts?x is closed", await outcome("https://www.youtube.com/shorts?feature=x"));
  check("youtube.com/watch stays open", !(await outcome("https://www.youtube.com/watch?v=abc123")));
  check("instagram.com/reels/ is closed", await outcome("https://www.instagram.com/reels/"));
  check("tiktok.com/explore?lang=fr is closed", await outcome("https://www.tiktok.com/explore?lang=fr"));
  check("tiktok.com/en (a language home) is closed", await outcome("https://www.tiktok.com/en"));
  check("support.tiktok.com/en (the help centre) stays open", !(await outcome("https://support.tiktok.com/en")));
  check("a TikTok profile stays open", !(await outcome("https://www.tiktok.com/@tiktok")));
  check("a single X post stays open", !(await outcome("https://x.com/NASA/status/123")));
  check("instagram.com/ stays open", !(await outcome("https://www.instagram.com/")));
  for (const home of [
    "https://www.youtube.com/",
    "https://www.instagram.com/direct/inbox/",
    "https://x.com/home",
    "https://www.tiktok.com/search?q=cats",
    "https://www.linkedin.com/feed/",
    "https://www.linkedin.com/messaging/",
  ]) {
    check(`no path rule swallows ${home}`, !(await outcome(home)));
  }

  // Every path rule of every site: a URL made to match it is closed, and
  // where it is sent is not closed itself.
  const { SITES } = await import(`file://${join(root, "src", "sites", "index.js").replace(/\\/g, "/")}`);
  for (const site of SITES) {
    for (const feature of site.features) {
      for (const path of feature.paths ?? []) {
        const target = `https://www.${site.domains[0]}${path.redirect}`;
        check(
          `${site.id} / ${feature.id}: ${path.regex} sends to an open page (${path.redirect})`,
          !(await outcome(target)),
        );
      }
    }
  }

  // An in-page navigation never reaches the network: the worker catches it.
  const yt = await browser.open(`http://youtube.com:${WEB}/watch`);
  await yt.eval(`history.pushState({}, "", "/shorts/abc123")`);
  url = await yt.settle((u) => !u.includes("/watch") && !u.includes("/shorts"));
  check("an in-page move to a closed page is sent away", !url.includes("/shorts"), url);
  await yt.close();

  const spa = await browser.open(`${SITE}/`);
  await spa.settle((u) => u.startsWith(SITE));
  answer = await options.ask("addCustom", { input: "example.com" });
  url = await spa.settle((u) => u.startsWith(ext("")));
  check("blocking a site closes its open tabs", url === blocked(`${SITE}/`), url);

  const tall = await browser.open(ext("ui/options.html"), { width: 1100, height: 5200 });
  await sleep(700);
  await tall.shot("options-full");
  const popup = await browser.open(ext("ui/popup.html"), { width: 360, height: 600 });
  await sleep(700);
  await popup.shot("popup");

  check("no page threw or logged an error", browser.errors.length === 0, browser.errors.join("\n        "));
} catch (error) {
  failed++;
  console.error(`FAIL  the run stopped: ${error.stack ?? error}`);
} finally {
  server.close();
  await browser?.send("Browser.close").catch(() => {});
  browser?.close();
  await sleep(800);
  chrome.kill();
  try {
    rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  } catch {
    // Windows still holds a file of the profile; the temp folder is cleaned later.
  }
}
console.log(failed === 0 ? "\nAll checks passed." : `\n${failed} check(s) failed.`);
process.exit(failed === 0 ? 0 : 1);
