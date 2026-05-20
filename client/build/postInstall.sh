#!/bin/bash
# Set SUID root on chrome-sandbox so the Electron sandbox works without --no-sandbox.
SANDBOX="/opt/KokoMovie/chrome-sandbox"
if [ -f "$SANDBOX" ]; then
  chown root "$SANDBOX"
  chmod 4755 "$SANDBOX"
fi
