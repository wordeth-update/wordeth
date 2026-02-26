#!/bin/bash
while true; do
  echo "[Wrapper] Starting server..."
  node server.js
  EXIT_CODE=$?
  echo "[Wrapper] Server exited with code $EXIT_CODE, restarting in 2s..."
  sleep 2
done
