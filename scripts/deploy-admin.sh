#!/usr/bin/env bash
#
# Build the web admin and put it live on the droplet.
#
#   bash scripts/deploy-admin.sh
#
# WHY THIS EXISTS
# ---------------
# The deploy used to be two blocks of shell pasted by hand, one on the local
# machine and one on the droplet. On 22 September 2026 that took the admin site
# down: a rollback line in the runbook contained the placeholder
# `dist.prev-<STAMP>`, bash read the angle brackets as a redirect, and the
# restore failed — while the `mv` immediately before it succeeded, renaming the
# live docroot away with nothing put back. Earlier the same day a stale
# /tmp/admin-dist.tar.gz from a previous deploy was extracted and shipped
# unnoticed, because tar succeeded and nothing compared what arrived against
# what was built.
#
# Every one of those failures came from a human transcribing values between
# steps. This script computes them instead, so there is nothing to mistype.
#
# WHAT IT GUARANTEES
# ------------------
#   * The archive on the droplet is byte-identical to what was just built
#     (sha256, checked remotely before anything is unpacked).
#   * The new bundle is asserted while STAGED, before the live docroot moves.
#   * The previous build is kept as dist.prev-<timestamp>; that is the rollback.
#   * `set -e` on both ends, so a failed check stops the deploy instead of
#     carrying on into the directory swap.
#   * The test suite passed. Not as ceremony: every test in tests/ guards a
#     bug that already reached the running system, and every one of those
#     typechecked and bundled cleanly on the way out.

set -euo pipefail

DROPLET="${DROPLET:-root@129.212.236.47}"
DOCROOT="${DOCROOT:-/var/www/ka-agapay-admin}"
ADMIN_URL="${ADMIN_URL:-https://rhu-kaagapay.129-212-236-47.sslip.io}"

cd "$(dirname "$0")/.."

# --- test -----------------------------------------------------------------
# Under a second, and it runs before the build so a failure costs nothing.
#
# SKIP_TESTS=1 exists on purpose. This is a clinic system, and there will be
# an evening when something is broken in front of patients and the fix has to
# go out now. Without a documented way past the gate, the way past it is
# pasting the deploy by hand -- which is precisely what took the site down on
# 22 September. An escape hatch that is used and logged beats a rule that is
# bypassed and silent.
if [ "${SKIP_TESTS:-}" = "1" ]; then
    echo "==> SKIPPING TESTS (SKIP_TESTS=1) — run npm test afterwards."
else
    echo "==> Testing"
    npm test
fi

# --- build ----------------------------------------------------------------
# check-api-url.mjs runs as prebuild and postbuild; it refuses to produce or
# ship a bundle pointing at localhost, a LAN IP, or anything but https .../api/v1.
echo "==> Building"
npm run build

BUNDLE="$(grep -oE 'index-[A-Za-z0-9_-]+\.js' dist/index.html | head -1)"
[ -n "$BUNDLE" ] || { echo "ERROR: no hashed entry script in dist/index.html"; exit 1; }

# --- is this deploy even needed? ------------------------------------------
# Vite names the entry script after a hash of its contents, so an identical
# hash means the droplet already serves this exact build.
LIVE="$(curl -fsS "$ADMIN_URL/" | grep -oE 'index-[A-Za-z0-9_-]+\.js' | head -1 || true)"

if [ "$LIVE" = "$BUNDLE" ]; then
    echo "==> $ADMIN_URL already serves $BUNDLE — nothing to do."
    exit 0
fi

echo "==> Live is ${LIVE:-unknown}; deploying $BUNDLE"

# --- pack -----------------------------------------------------------------
# The CONTENTS of dist/, not the folder: the droplet asserts
# dist.new/assets/..., and a top-level dist/ would land a level too deep.
ARCHIVE="admin-dist.tar.gz"
rm -f "$ARCHIVE"
tar -czf "$ARCHIVE" -C dist .

SUM="$(sha256sum "$ARCHIVE" | cut -d' ' -f1)"

# Name the remote copy after the bundle hash. A fixed filename survives between
# deploys and is how a stale archive once shipped.
REMOTE="/tmp/admin-dist-${BUNDLE}.tar.gz"

echo "==> Uploading to $DROPLET:$REMOTE"
scp -q "$ARCHIVE" "$DROPLET:$REMOTE"

# --- swap -----------------------------------------------------------------
# Values are interpolated here, on the machine that computed them, so the
# remote side has nothing to fill in.
ssh "$DROPLET" "bash -s" <<REMOTE_SCRIPT
set -euo pipefail

test "\$(sha256sum '$REMOTE' | cut -d' ' -f1)" = '$SUM'
echo "    archive verified"

rm -rf '$DOCROOT/dist.new'
mkdir -p '$DOCROOT/dist.new'
tar -xzf '$REMOTE' -C '$DOCROOT/dist.new'

test -f '$DOCROOT/dist.new/index.html'
test -f '$DOCROOT/dist.new/assets/$BUNDLE'
[ "\$(wc -c < '$DOCROOT/dist.new/assets/$BUNDLE')" -gt 500000 ]
echo "    staged copy asserted"

# Guarded: dist may be absent after a half-finished deploy, and an unguarded
# mv would abort under set -e and leave the site down.
if [ -d '$DOCROOT/dist' ]; then
    mv '$DOCROOT/dist' "$DOCROOT/dist.prev-\$(date +%Y-%m-%d-%H%M)"
fi

mv '$DOCROOT/dist.new' '$DOCROOT/dist'
chown -R www-data:www-data '$DOCROOT/dist'

rm -f '$REMOTE'
REMOTE_SCRIPT

# --- prove it -------------------------------------------------------------
# Over HTTP, not on disk: this is the only check that exercises nginx too.
SERVED="$(curl -fsS "$ADMIN_URL/" | grep -oE 'index-[A-Za-z0-9_-]+\.js' | head -1 || true)"

if [ "$SERVED" != "$BUNDLE" ]; then
    echo "ERROR: $ADMIN_URL serves '${SERVED:-nothing}', expected '$BUNDLE'."
    echo "Roll back with:  ssh $DROPLET 'ls -dt $DOCROOT/dist.prev-* | head -3'"
    exit 1
fi

rm -f "$ARCHIVE"

echo "==> Live: $BUNDLE"
echo "    Hard-refresh the browser (Ctrl+Shift+R) — index.html is not hashed"
echo "    and is routinely served stale."
