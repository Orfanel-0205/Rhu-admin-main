# Ka-Agapay — web admin

The dashboard RHU staff use every day: queue, appointments, SOAP consultations,
e-prescriptions and lab requests, telemedicine, health follow-ups, inventory,
events and announcements, SMS, analytics and the heatmaps, reports, team chat,
users and settings.

It is a single-page app that talks to the Ka-Agapay backend at `/api/v1`
(repository `PROMAIN-BE`, folder `ka-agapay-backend`). Production is served from
the same server as the API.

## Stack

React 18 · TypeScript · Vite 6 · React Router 6 · axios · Leaflet (maps) ·
Vitest (tests). No UI framework: components and styles are in this repository.

## Running it on your computer

Requirements: Node 20+, and the backend running locally (see its README).

```bash
npm install
npm run dev          # http://localhost:5173
```

In development it calls `http://127.0.0.1:8000/api/v1`, the backend's
`php artisan serve` address — nothing to configure.

Sign in with a staff account from the backend's seeders (or one created under
Users). Residents cannot sign in here; they use the mobile app.

## Tests

```bash
npm test             # Vitest, 89 tests as of October 2026
npx tsc --noEmit     # type check
```

## Building and deploying

The API address is baked into the bundle when it is built. Copy `.env.example`
to `.env.production` and set `VITE_API_URL` to the public address ending in
`/api/v1`. `npm run build` refuses to build — and refuses to ship — a bundle
that points at localhost, plain http, or the wrong path (`scripts/check-api-url.mjs`).

Deploy with the script, from Git Bash on Windows or any shell:

```bash
bash scripts/deploy-admin.sh
```

It builds, skips the upload if the server already has that bundle, uploads,
checks the archive's checksum on the server, swaps the web root (keeping the
previous one as `dist.prev-<timestamp>` for rollback) and confirms over HTTPS.
Details and rollback: the backend's `docs/OPERATIONS.md` §4.

**Changing the domain** means rebuilding with the new `VITE_API_URL` and
redeploying (and a new mobile app build — see its README).

## Where things are

```
src/pages            one file per screen (Queue, Consultations, Telemedicine, Events, …)
src/components       shared pieces; queue/, events/, chat/, ui/ (ActionMenu, pagination, …)
src/services         one file per API area — every server call goes through these
src/lib/apiClient.ts axios with the token, error toasts, and the duck screens for 403/500/maintenance
src/lib/tableFit.ts  each .responsive-table decides rows or cards by the space it has
src/lib/idleSignOut  Settings → Session timeout: sign out after idle minutes
src/store            signed-in user and language
src/i18n             English / Tagalog / Pangasinan strings
src/styles/globals.css
tests/               Vitest
```

## Conventions worth knowing

- **The server decides who may do what.** The dashboard hides buttons a role
  cannot use (for example Cancel on telemedicine, account creation for walk-ins),
  but every rule is enforced by the backend; hiding is only courtesy.
- **Tables**: wrap a table in `<div className="responsive-table">` and give each
  cell a `data-label`. It shows rows when they fit and cards when they do not, on
  any screen. Grids that hold tables use `minmax(0, 1fr)` columns so they can shrink.
- **Errors**: `apiClient` shows a toast, or the duck screen for "not allowed",
  "server error" and maintenance. Pass `suppressErrorToast: true` when a screen
  shows the error itself.
- **Time** is shown in Philippine time (`Asia/Manila`) whatever the computer's
  clock zone.
- **Comments explain why.** Most non-obvious code says what went wrong before it
  existed. Keep that up.
