// Validates site modules against the contract in CLAUDE.md.
//   node scripts/check-sites.mjs            every folder in src/sites
//   node scripts/check-sites.mjs youtube    one site
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sitesDir = join(root, "src", "sites");
const RESOURCE_TYPES = new Set([
  "main_frame",
  "sub_frame",
  "stylesheet",
  "script",
  "image",
  "font",
  "object",
  "xmlhttprequest",
  "ping",
  "media",
  "websocket",
  "other",
]);
// What RE2 (declarativeNetRequest) refuses and JavaScript accepts.
const NOT_RE2 = /\(\?[=!<]|\\[1-9]/;
// A generated class name: the selector would not survive a deploy.
const HASHED_CLASS = /\.(x[0-9a-z]{5,8}|css-[0-9a-z]{5,}|r-[0-9a-z]{5,}|_a[0-9a-z_-]{3,})\b/;

const only = process.argv[2];
const ids = only
  ? [only]
  : readdirSync(sitesDir).filter(
      (name) => name !== "generic" && statSync(join(sitesDir, name)).isDirectory(),
    );

const problems = [];
const warnings = [];

for (const id of ids) {
  const dir = join(sitesDir, id);
  const say = (text) => problems.push(`${id}: ${text}`);
  const warn = (text) => warnings.push(`${id}: ${text}`);
  const file = join(dir, "site.js");
  if (!existsSync(file)) {
    say("no site.js");
    continue;
  }
  const site = (await import(pathToFileURL(file).href)).default;
  if (!site || typeof site !== "object") {
    say("site.js has no default export object");
    continue;
  }
  if (site.id !== id) say(`id "${site.id}" is not the folder name`);
  if (!/^[a-z]+$/.test(site.id ?? "")) say("id must be lowercase letters");
  if (!site.name) say("no name");
  if (!Array.isArray(site.domains) || site.domains.length === 0) say("no domains");
  for (const domain of site.domains ?? []) {
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) say(`bad domain "${domain}"`);
  }
  for (const script of site.scripts ?? []) {
    if (!existsSync(join(dir, script))) say(`script ${script} is missing`);
  }
  if (!Array.isArray(site.features) || site.features.length === 0) say("no features");
  const seen = new Set();
  for (const feature of site.features ?? []) {
    const at = `feature "${feature.id}"`;
    if (!/^[a-z-]+$/.test(feature.id ?? "")) say(`${at}: bad id`);
    if (seen.has(feature.id)) say(`${at}: declared twice`);
    seen.add(feature.id);
    if (!feature.label) say(`${at}: no label`);
    if (!feature.description) say(`${at}: no description`);
    if (!feature.css && !feature.paths?.length && !feature.network?.length) {
      say(`${at}: blocks nothing (no css, paths or network)`);
    }
    if (feature.css) {
      const cssFile = join(dir, feature.css);
      if (!existsSync(cssFile)) {
        say(`${at}: css ${feature.css} is missing`);
      } else {
        const css = readFileSync(cssFile, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
        const bodies = [...css.matchAll(/\{([^}]*)\}/g)].map((m) => m[1].trim());
        if (bodies.length === 0) say(`${at}: ${feature.css} has no rule`);
        for (const body of bodies) {
          if (!/^display:\s*none\s*!important;?$/.test(body)) {
            say(`${at}: ${feature.css} does more than hide: "${body}"`);
          }
        }
        if (HASHED_CLASS.test(css)) {
          warn(`${at}: ${feature.css} uses what looks like a generated class`);
        }
      }
    }
    for (const path of feature.paths ?? []) {
      if (!path.regex?.startsWith("^/")) say(`${at}: path regex must start with ^/`);
      if (NOT_RE2.test(path.regex ?? "")) say(`${at}: path regex is not RE2`);
      try {
        new RegExp(path.regex);
      } catch {
        say(`${at}: path regex does not compile`);
      }
      if (!path.redirect?.startsWith("/")) say(`${at}: redirect must be a path`);
      if (path.regex && path.redirect && new RegExp(path.regex).test(path.redirect)) {
        say(`${at}: redirect "${path.redirect}" matches its own regex (a loop)`);
      }
    }
    for (const rule of feature.network ?? []) {
      if (!rule.urlFilter && !rule.regexFilter) say(`${at}: network rule has no filter`);
      if (rule.regexFilter && NOT_RE2.test(rule.regexFilter)) {
        say(`${at}: network regexFilter is not RE2`);
      }
      if (!Array.isArray(rule.resourceTypes) || rule.resourceTypes.length === 0) {
        say(`${at}: network rule has no resourceTypes`);
      }
      for (const type of rule.resourceTypes ?? []) {
        if (!RESOURCE_TYPES.has(type)) say(`${at}: unknown resource type "${type}"`);
        if (type === "main_frame") say(`${at}: a page is closed with paths, not network`);
      }
    }
  }
}

for (const line of warnings) console.warn(`warn  ${line}`);
for (const line of problems) console.error(`FAIL  ${line}`);
if (problems.length > 0) process.exit(1);
console.log(`ok    ${ids.join(", ")}`);
