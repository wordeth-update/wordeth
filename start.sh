#!/bin/bash

fuser -k 5000/tcp 2>/dev/null
sleep 1

while true; do
  echo "[Wrapper] Starting server..."
  node server.js
  EXIT_CODE=$?
  echo "[Wrapper] Server exited with code $EXIT_CODE, restarting in 2s..."
  fuser -k 5000/tcp 2>/dev/null
  sleep 2
done
