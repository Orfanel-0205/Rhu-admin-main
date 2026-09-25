#!/usr/bin/env node
//
// Check every API path this app calls against the routes the server actually
// serves.
//
//   node scripts/check-api-routes.mjs <routes.json>
//
// where routes.json comes from the backend:
//
//   php artisan route:list --json > routes.json
//
// WHY THIS EXISTS
// ---------------
// On 25 September 2026 the admin's Log out button had been calling
// POST /admin/logout since it was written. No such route exists. The request
// 404'd, the handler swallowed the error, and the browser cleared its own
// session -- so logout looked completely normal while the server-side token
// stayed valid. 172 tokens had built up, the oldest from 19 June, none ever
// revoked by anyone pressing Log out.
//
// Nothing in the interface could have revealed that. The button was wired, the
// handler ran, the user was returned to the login screen. Only comparing the
// paths the client calls against the routes the server exposes finds it.
//
// This is deliberately a script and not a unit test: it needs a live backend
// to be truthful, and a test that silently skips when the backend is absent
// would give false assurance. Run it before a release, or whenever routes move.

import fs from "node:fs";
import path from "node:path";

const ROUTES_FILE = process.argv[2];

if (!ROUTES_FILE) {
  console.error("usage: node scripts/check-api-routes.mjs <routes.json>");
  console.error("generate it with: php artisan route:list --json > routes.json");
  process.exit(2);
}

/** Every .ts/.tsx file under src/. */
function sources(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sources(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

/** Paths passed to apiClient, with template holes turned into :param. */
function calledPaths() {
  const found = new Map();
  const call = /apiClient\.(get|post|put|patch|delete)\(\s*(`[^`]+`|"[^"]+"|'[^']+')/g;

  for (const file of sources("src")) {
    const text = fs.readFileSync(file, "utf8");
    let match;

    while ((match = call.exec(text)) !== null) {
      const raw = match[2]
        .slice(1, -1)
        .replace(/\$\{[^}]*\}/g, ":param")
        .replace(/\?.*$/, "")
        .replace(/^\/+/, "")
        .replace(/\/+$/, "");

      if (!found.has(raw)) found.set(raw, `${file} (${match[1].toUpperCase()})`);
    }
  }

  return found;
}

const routes = JSON.parse(fs.readFileSync(ROUTES_FILE, "utf8"));

const served = new Set(
  routes
    .filter((route) => route.uri.startsWith("api/v1/"))
    .map((route) =>
      route.uri
        .replace(/^api\/v1\//, "")
        .replace(/\{[^}]*\}/g, ":param")
        .replace(/\/+$/, "")
    )
);

const called = calledPaths();
const missing = [...called].filter(([p]) => !served.has(p));

console.log(`server routes under api/v1 : ${served.size}`);
console.log(`paths this app calls       : ${called.size}`);
console.log(`paths with no such route   : ${missing.length}`);

for (const [p, where] of missing) {
  const prefix = p.split("/")[0];
  const near = [...served].filter((s) => s.startsWith(prefix)).slice(0, 3);

  console.log(`\n  NO ROUTE: /${p}`);
  console.log(`    called from: ${where}`);
  if (near.length) console.log(`    did you mean: ${near.join(", ")}`);
}

if (missing.length > 0) {
  console.log("\nThese calls will 404. If the caller swallows the error, the");
  console.log("failure will be completely invisible in the interface.");
  process.exit(1);
}

console.log("\nok: every path this app calls exists on the server.");
