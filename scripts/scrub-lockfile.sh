#!/bin/bash
# Replaces Replit-internal package-proxy URLs in package-lock.json with the
# public npm registry. Safe to run any time; package checksums are unchanged.
set -e
LOCK="$(dirname "$0")/../package-lock.json"
if grep -q 'package-firewall.replit.local' "$LOCK" 2>/dev/null; then
  sed -i 's|http://package-firewall.replit.local/npm|https://registry.npmjs.org|g' "$LOCK"
  echo "[scrub-lockfile] Replaced Replit-internal registry URLs with registry.npmjs.org"
else
  echo "[scrub-lockfile] Lockfile clean"
fi
