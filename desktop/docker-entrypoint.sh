#!/bin/bash
set -e

PORT=${WEBUI_PORT:-3000}
PRINTERS=${PRINTER_SPEC:-""}
PASSWORD=${WEBUI_PASSWORD:-""}

echo "=============================================="
echo " Starting YourPrinter Headless Server"
echo " WebUI Port:     $PORT"
echo " Configured:     ${PRINTERS:-'(using saved printers)'}"
echo "=============================================="

# Clean up stale locks
rm -f /tmp/.X*-lock /tmp/.X11-unix/X* /root/.config/YourPrinter/Singleton* || true

# Start Xvfb directly
echo "[+] Starting Xvfb virtual display on :99..."
Xvfb :99 -screen 0 1024x768x24 -nolisten tcp &
XVFB_PID=$!
export DISPLAY=:99
sleep 1

# Ensure resources and binaries exist in both root and out/main
mkdir -p out/main
cp -rn resources out/main/ 2>/dev/null || true
chmod -R +x resources/bin/ 2>/dev/null || true
chmod -R +x out/main/resources/bin/ 2>/dev/null || true

APP_ARGS="--headless --enable-logging --webui-port=$PORT"

if [ -n "$PRINTERS" ]; then
    APP_ARGS="$APP_ARGS --printers=$PRINTERS"
else
    APP_ARGS="$APP_ARGS --all-saved-printers"
fi

if [ -n "$PASSWORD" ]; then
    APP_ARGS="$APP_ARGS --webui-password=$PASSWORD"
fi

echo "[+] Launching Electron headless process..."
mkdir -p /root/.config/YourPrinter/logs
./node_modules/.bin/electron \
    --no-sandbox \
    --disable-dev-shm-usage \
    --disable-gpu \
    --disable-software-rasterizer \
    out/main/index.js \
    $APP_ARGS 2>&1 | tee -a /root/.config/YourPrinter/logs/headless.log
