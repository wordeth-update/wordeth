#!/bin/bash
# Runs automatically after a task agent's work is merged into the main app.
# Keep idempotent, non-interactive, and fast.
set -e

# Install any new dependencies the merged task added
npm install --no-audit --no-fund
