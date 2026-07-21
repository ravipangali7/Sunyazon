/**
 * Flatten TanStack Start SPA output into a traditional static layout:
 *   dist/index.html
 *   dist/favicon.ico
 *   dist/assets/*
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const client = path.join(dist, "client");

if (!fs.existsSync(client)) {
  console.error("[flatten-dist] Missing dist/client — build may have failed.");
  process.exit(1);
}

const staging = path.join(dist, "_static_staging");
if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true });
fs.mkdirSync(staging, { recursive: true });

for (const entry of fs.readdirSync(client)) {
  fs.cpSync(path.join(client, entry), path.join(staging, entry), {
    recursive: true,
  });
}

// Clear dist and move staged static files to dist root
for (const entry of fs.readdirSync(dist)) {
  if (entry === "_static_staging") continue;
  fs.rmSync(path.join(dist, entry), { recursive: true, force: true });
}

for (const entry of fs.readdirSync(staging)) {
  fs.renameSync(path.join(staging, entry), path.join(dist, entry));
}
fs.rmSync(staging, { recursive: true, force: true });

const required = ["index.html", "favicon.ico", "assets"];
for (const name of required) {
  if (!fs.existsSync(path.join(dist, name))) {
    console.error(`[flatten-dist] Missing dist/${name}`);
    process.exit(1);
  }
}

console.log("[flatten-dist] Ready: dist/index.html, dist/favicon.ico, dist/assets/");
