// Copies src/ to dist/ and writes dist/generated/secret.js from .env.
// The password itself never reaches dist: only a salted PBKDF2 digest does,
// so reading the extension's files does not give it away.
import { pbkdf2Sync, randomBytes } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envFile = join(root, ".env");
const ITERATIONS = 150_000;

function readPassword() {
  if (!existsSync(envFile)) {
    throw new Error("No .env file. Copy .env.example to .env and set BLOCKER_PASSWORD.");
  }
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const match = /^\s*BLOCKER_PASSWORD\s*=(.*)$/.exec(line);
    if (!match) continue;
    let value = match[1].trim();
    const quoted = /^(["'])(.*)\1$/.exec(value);
    if (quoted) value = quoted[2];
    if (value) return value;
  }
  throw new Error("BLOCKER_PASSWORD is empty in .env.");
}

try {
  const password = readPassword();
  const dist = join(root, "dist");
  rmSync(dist, { recursive: true, force: true });
  cpSync(join(root, "src"), dist, { recursive: true });

  const salt = randomBytes(16);
  const digest = pbkdf2Sync(password, salt, ITERATIONS, 32, "sha256");
  mkdirSync(join(dist, "generated"), { recursive: true });
  writeFileSync(
    join(dist, "generated", "secret.js"),
    `// Written by scripts/build.mjs. Not the password: a salted digest of it.\n` +
      `export const SECRET = ${JSON.stringify(
        { salt: salt.toString("hex"), digest: digest.toString("hex"), iterations: ITERATIONS },
        null,
        2,
      )};\n`,
  );

  console.log("Built dist/. Load it in chrome://extensions (Load unpacked), or press its reload arrow.");
  if (password === "change-me") {
    console.warn("\nThe password is still the placeholder \"change-me\". Set your own in .env and build again.");
  } else if (password.length < 12) {
    console.warn("\nThe password is short. The longer it is to type, the better it works.");
  }
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
