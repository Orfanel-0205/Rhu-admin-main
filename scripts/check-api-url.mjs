#!/usr/bin/env node
// scripts/check-api-url.mjs
//
// Refuses to produce an admin bundle that talks to the wrong server.
//
// WHY THIS EXISTS
// ---------------
// src/lib/apiClient.ts reads import.meta.env.VITE_API_URL and falls back to
// http://127.0.0.1:8000/api/v1 when it is unset. Vite inlines that value at
// BUILD time, so a build made without it succeeds, zips, uploads, deploys and
// loads -- and then every staff member's browser sends its API calls to
// 127.0.0.1, i.e. to their own laptop. Nothing in the toolchain objects.
//
// That is not hypothetical. On 2026-09-09 the mobile app was found to have
// shipped exactly this defect in every EAS build: its equivalent fallback
// (http://192.168.51.37:8000, a developer's LAN IP) was baked into the
// production bundle, so push tokens could never reach the backend and sign-in
// failed. It went unnoticed because the only copy of the real value lived in
// an untracked .env on one machine. The same day, this repo was found to have
// no .env at all and no .env.example either, despite .gitignore re-admitting
// one -- so a fresh clone had nothing telling anyone the variable existed.
//
// Two modes, wired as npm lifecycle hooks around `npm run build`:
//
//   prebuild   (default)   validate the value BEFORE anything is built
//   postbuild  --artifact  prove the value actually landed in the bundle
//
// The second mode is not redundant. It checks the artifact rather than the
// configuration, so it still catches the case where this script and Vite ever
// disagree about which value wins.
//
// ESCAPE HATCH: set KAAGAPAY_ALLOW_NONPROD_API=1 to downgrade the prebuild
// rules to warnings, for a deliberate build against a local backend. It is
// loud on purpose. Such a bundle must never be deployed.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// `vite build` with no --mode flag builds in 'production'. Resolving through
// Vite's own loadEnv means the precedence rules are Vite's, not a copy of them:
// shell environment first, then .env.production.local, .env.production,
// .env.local, .env.
const MODE = 'production';

// Must match the fallback literal in src/lib/apiClient.ts.
const FALLBACK_MARKER = '127.0.0.1:8000';

const artifactMode = process.argv.includes('--artifact');
const allowNonProd = process.env.KAAGAPAY_ALLOW_NONPROD_API === '1';

function fail(lines) {
  console.error('\nADMIN API URL CHECK FAILED\n');
  for (const line of lines) console.error(`  ${line}`);
  console.error('');
  process.exit(1);
}

function resolveApiUrl() {
  const env = loadEnv(MODE, ROOT, 'VITE_');
  return (env.VITE_API_URL ?? '').trim();
}

function isNonPublicHost(hostname) {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');

  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local')) return true;
  if (h === '0.0.0.0' || h === '::1') return true;
  if (/^127\./.test(h)) return true;
  if (/^10\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^169\.254\./.test(h)) return true;

  const m = /^172\.(\d{1,3})\./.exec(h);
  if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return true;

  return false;
}

function checkConfig() {
  const value = resolveApiUrl();
  const problems = [];

  if (!value) {
    fail([
      'VITE_API_URL is not set.',
      '',
      'Without it the bundle silently falls back to http://127.0.0.1:8000/api/v1,',
      "so every staff browser would call its OWN machine instead of the server.",
      '',
      'Set it in .env.production (gitignored) -- see .env.example -- e.g.',
      '  VITE_API_URL=https://rhu-kaagapay.129-212-236-47.sslip.io/api/v1',
    ]);
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    fail([`VITE_API_URL is not a valid URL: ${JSON.stringify(value)}`]);
  }

  if (url.protocol !== 'https:') {
    problems.push(
      `Uses ${url.protocol}// -- the admin is served over HTTPS, so browsers block`,
      'plain-http API calls from it as mixed content. Use https://.'
    );
  }

  if (isNonPublicHost(url.hostname)) {
    problems.push(
      `Points at ${url.hostname}, which is not reachable from staff browsers.`,
      'That is a local-development value; a deployed bundle needs the server host.'
    );
  }

  // Unlike the mobile client, apiClient.ts uses this value AS the base URL and
  // appends nothing. Omitting /api/v1 sends /login instead of /api/v1/login,
  // and the build still looks completely fine.
  const pathname = url.pathname.replace(/\/+$/, '');
  if (!pathname.endsWith('/api/v1')) {
    problems.push(
      `Path is ${JSON.stringify(url.pathname || '/')} but must end in /api/v1.`,
      'apiClient.ts uses VITE_API_URL verbatim as its base URL and appends nothing.'
    );
  }

  if (problems.length > 0) {
    const report = [`VITE_API_URL=${value}`, '', ...problems];

    if (!allowNonProd) {
      fail([
        ...report,
        '',
        'If you are DELIBERATELY building against a local backend, re-run with',
        'KAAGAPAY_ALLOW_NONPROD_API=1. Never deploy the result.',
      ]);
    }

    console.warn('\nWARNING: KAAGAPAY_ALLOW_NONPROD_API=1 is set -- building anyway.\n');
    for (const line of report) console.warn(`  ${line}`);
    console.warn('\n  THIS BUNDLE MUST NOT BE DEPLOYED.\n');
    return;
  }

  console.log(`  ok    VITE_API_URL=${value}`);
}

function checkArtifact() {
  const value = resolveApiUrl().replace(/\/+$/, '');
  const indexPath = path.join(ROOT, 'dist', 'index.html');

  if (!existsSync(indexPath)) {
    fail(['dist/index.html not found -- the build did not produce an artifact.']);
  }

  // Same technique as the droplet-side assertion in docs/OPERATIONS.md: follow
  // the entry script index.html actually references, rather than guessing.
  const html = readFileSync(indexPath, 'utf8');
  const ref = /\/assets\/[^"]+\.js/.exec(html)?.[0];

  if (!ref) {
    fail(['dist/index.html references no /assets/*.js entry script.']);
  }

  const bundlePath = path.join(ROOT, 'dist', ref);
  if (!existsSync(bundlePath)) {
    fail([`index.html references ${ref}, but that file does not exist in dist/.`]);
  }

  const bundle = readFileSync(bundlePath, 'utf8');

  if (!value || !bundle.includes(value)) {
    fail([
      `The built bundle (${ref}) does not contain the configured API URL:`,
      `  ${value || '(empty)'}`,
      '',
      'The configuration check passed but the artifact disagrees, so this bundle',
      'would talk to a different server than intended. Do not deploy it.',
    ]);
  }

  if (bundle.includes(FALLBACK_MARKER) && !allowNonProd) {
    fail([
      `The built bundle (${ref}) still contains the ${FALLBACK_MARKER} fallback.`,
      'The configured URL was inlined, but the localhost fallback survived minification,',
      'so part of the app may still call the staff member\'s own machine. Do not deploy it.',
    ]);
  }

  console.log(`  ok    ${ref} calls ${value}`);
}

if (artifactMode) {
  checkArtifact();
} else {
  checkConfig();
}
