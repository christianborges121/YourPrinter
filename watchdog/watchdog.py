#!/usr/bin/env python3
"""
Obico Stream Watchdog with FlashForgeUI (YourPrinter) Fleet Integration
----------------------------------------------------------------------
Watches all configured 3D printer camera streams (Flashforge, Bambu Lab, Klipper, HTTP camera streams),
runs local AI failure/spaghetti inference using Darknet YOLO on GPU,
sends rich rate-limited Discord notifications with bounding boxes,
and provides a REST API + Auto-Pause integration for the WebUI.
"""

import os
import sys
import time
import json
import socket
import urllib.request
import urllib.parse
import threading
import http.server
import socketserver
import glob
import re
from datetime import datetime
import cv2
import numpy as np
import requests

# Load optional .env file if available
def load_dotenv():
    candidate_paths = [
        os.path.join(os.path.dirname(__file__), '.env'),
        os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env'),
        os.path.join(os.getcwd(), '.env'),
        '/app/.env',
        '/media/Safe-Storage/Projects/YourPrinter/.env',
        '/media/Safe-Storage/Projects/obico-stream-watchdog/.env'
    ]
    for env_path in candidate_paths:
        if os.path.exists(env_path) and os.path.isfile(env_path):
            try:
                with open(env_path, 'r', encoding='utf-8') as f:
                    for line in f:
                        line = line.strip()
                        if line and not line.startswith('#') and '=' in line:
                            key, val = line.split('=', 1)
                            key = key.strip()
                            val = val.strip().strip('"').strip("'")
                            current = os.environ.get(key)
                            if key and (current is None or not str(current).strip()):
                                os.environ[key] = val
            except Exception as e:
                print(f"[!] Error reading {env_path}: {e}", flush=True)

load_dotenv()

# ==================== CONFIGURATION ====================
PRINTER_NAME = os.getenv("PRINTER_NAME", "3D Printer")
DISCORD_WEBHOOK = os.getenv("DISCORD_WEBHOOK", "")
CAMERA_STREAM_URL = os.getenv("CAMERA_STREAM_URL", "")

# Print State Gating (Zero camera usage when idle)
WATCH_ONLY_WHILE_PRINTING = os.getenv("WATCH_ONLY_WHILE_PRINTING", "true").lower() == "true"
PRINTER_TYPE = os.getenv("PRINTER_TYPE", "flashforge").lower()  # flashforge, moonraker, octoprint, none
PRINTER_IP = os.getenv("PRINTER_IP", "")
IDLE_POLL_INTERVAL_SEC = int(os.getenv("IDLE_POLL_INTERVAL_SEC", "15"))

# Flashforge-specific settings
FLASHFORGE_CHECK_CODE = os.getenv("FLASHFORGE_CHECK_CODE", "")
FLASHFORGE_SERIAL = os.getenv("FLASHFORGE_SERIAL", "")
FLASHFORGE_PORT = int(os.getenv("FLASHFORGE_PORT", "8898"))

# Moonraker / OctoPrint settings
MOONRAKER_PORT = int(os.getenv("MOONRAKER_PORT", "7125"))
OCTOPRINT_API_KEY = os.getenv("OCTOPRINT_API_KEY", "")

# Detection & Throttling
CHECK_INTERVAL_SEC = int(os.getenv("CHECK_INTERVAL_SEC", "15"))
CONFIDENCE_THRESHOLD = float(os.getenv("CONFIDENCE_THRESHOLD", "0.20"))
CONSECUTIVE_REQUIRED = int(os.getenv("CONSECUTIVE_REQUIRED", "2"))
ALERT_COOLDOWN_SEC = int(os.getenv("ALERT_COOLDOWN_SEC", "60"))  # Max 1 message every minute

# Discord Notification Toggles
SEND_STARTUP_ALERT = os.getenv("SEND_STARTUP_ALERT", "true").lower() == "true"
SEND_PRINT_START_ALERT = os.getenv("SEND_PRINT_START_ALERT", "true").lower() == "true"
SEND_PRINT_PROGRESS_ALERT = os.getenv("SEND_PRINT_PROGRESS_ALERT", "true").lower() == "true"
SEND_PRINT_PAUSE_ALERT = os.getenv("SEND_PRINT_PAUSE_ALERT", "true").lower() == "true"
SEND_PRINT_RESUME_ALERT = os.getenv("SEND_PRINT_RESUME_ALERT", "true").lower() == "true"
SEND_PRINT_COMPLETE_ALERT = os.getenv("SEND_PRINT_COMPLETE_ALERT", "true").lower() == "true"
SEND_RESOLVED_ALERT = os.getenv("SEND_RESOLVED_ALERT", "true").lower() == "true"

# WebUI API Integration & Auto-Pause Settings
WATCHDOG_API_PORT = int(os.getenv("WATCHDOG_API_PORT", "8085"))
AUTO_PAUSE_ON_FAILURE = os.getenv("AUTO_PAUSE_ON_FAILURE", "true").lower() == "true"
FLASHFORGE_UI_URL = os.getenv("FLASHFORGE_UI_URL", "http://yourprinter:3000").rstrip("/")
SNAPSHOTS_DIR = os.getenv("SNAPSHOTS_DIR", "/app/snapshots")
WATCHDOG_CONFIG_FILE = os.path.join(SNAPSHOTS_DIR, "watchdog_config.json")
# =======================================================


def load_local_config():
    """Loads locally persisted watchdog config from SNAPSHOTS_DIR if present."""
    global CONFIDENCE_THRESHOLD, CONSECUTIVE_REQUIRED, CHECK_INTERVAL_SEC, AUTO_PAUSE_ON_FAILURE
    if not os.path.exists(WATCHDOG_CONFIG_FILE):
        return False
    try:
        with open(WATCHDOG_CONFIG_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        if "threshold" in data and data["threshold"] is not None:
            CONFIDENCE_THRESHOLD = float(data["threshold"])
        if "consecutive_required" in data and data["consecutive_required"] is not None:
            CONSECUTIVE_REQUIRED = int(data["consecutive_required"])
        if "check_interval_sec" in data and data["check_interval_sec"] is not None:
            CHECK_INTERVAL_SEC = int(data["check_interval_sec"])
        if "auto_pause_enabled" in data and data["auto_pause_enabled"] is not None:
            AUTO_PAUSE_ON_FAILURE = bool(data["auto_pause_enabled"])
        print(f"[⚙️ Config Loaded: Local File] Threshold: {CONFIDENCE_THRESHOLD}, Consecutive: {CONSECUTIVE_REQUIRED}, Interval: {CHECK_INTERVAL_SEC}s, Auto-Pause: {AUTO_PAUSE_ON_FAILURE}", flush=True)
        return True
    except Exception as e:
        print(f"[!] Warning: Could not read {WATCHDOG_CONFIG_FILE}: {e}", flush=True)
        return False


def save_local_config():
    """Persists current watchdog config to SNAPSHOTS_DIR."""
    try:
        os.makedirs(SNAPSHOTS_DIR, exist_ok=True)
        cfg = {
            "threshold": CONFIDENCE_THRESHOLD,
            "consecutive_required": CONSECUTIVE_REQUIRED,
            "check_interval_sec": CHECK_INTERVAL_SEC,
            "auto_pause_enabled": AUTO_PAUSE_ON_FAILURE,
            "updated_at": datetime.utcnow().isoformat(),
        }
        with open(WATCHDOG_CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(cfg, f, indent=2)
    except Exception as e:
        print(f"[!] Warning: Could not write {WATCHDOG_CONFIG_FILE}: {e}", flush=True)


def fetch_and_apply_remote_config():
    """Fetches saved Watchdog configuration from YourPrinter backend (/api/watchdog/config)."""
    global CONFIDENCE_THRESHOLD, CONSECUTIVE_REQUIRED, CHECK_INTERVAL_SEC, AUTO_PAUSE_ON_FAILURE
    if not FLASHFORGE_UI_URL:
        return False

    url = f"{FLASHFORGE_UI_URL.rstrip('/')}/api/watchdog/config"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Obico-Stream-Watchdog/2.0"})
        with urllib.request.urlopen(req, timeout=4) as resp:
            if resp.status == 200:
                data = json.loads(resp.read().decode('utf-8', errors='ignore'))
                if data.get("success") and "config" in data:
                    cfg = data["config"]
                    changed = False
                    if "threshold" in cfg and cfg["threshold"] is not None:
                        new_th = float(cfg["threshold"])
                        if abs(new_th - CONFIDENCE_THRESHOLD) > 0.001:
                            CONFIDENCE_THRESHOLD = new_th
                            changed = True
                    if "consecutive_required" in cfg and cfg["consecutive_required"] is not None:
                        new_cr = int(cfg["consecutive_required"])
                        if new_cr != CONSECUTIVE_REQUIRED:
                            CONSECUTIVE_REQUIRED = new_cr
                            changed = True
                    if "check_interval_sec" in cfg and cfg["check_interval_sec"] is not None:
                        new_ci = int(cfg["check_interval_sec"])
                        if new_ci != CHECK_INTERVAL_SEC:
                            CHECK_INTERVAL_SEC = new_ci
                            changed = True
                    if "auto_pause_enabled" in cfg and cfg["auto_pause_enabled"] is not None:
                        new_ap = bool(cfg["auto_pause_enabled"])
                        if new_ap != AUTO_PAUSE_ON_FAILURE:
                            AUTO_PAUSE_ON_FAILURE = new_ap
                            changed = True

                    if changed:
                        with state_lock:
                            for t in printer_trackers.values():
                                t["threshold"] = CONFIDENCE_THRESHOLD
                                t["consecutive_required"] = CONSECUTIVE_REQUIRED
                                t["auto_pause_enabled"] = AUTO_PAUSE_ON_FAILURE
                                t["check_interval_sec"] = CHECK_INTERVAL_SEC
                        update_aggregate_state()
                        save_local_config()
                        print(f"[⚙️ Config Synced from WebUI] Threshold: {CONFIDENCE_THRESHOLD}, Consecutive: {CONSECUTIVE_REQUIRED}, Interval: {CHECK_INTERVAL_SEC}s, Auto-Pause: {AUTO_PAUSE_ON_FAILURE}", flush=True)
                    return True
    except Exception:
        pass
    return False

# Load Obico ML libraries
sys.path.insert(0, '/app/obico/ml_api')
try:
    from lib.detection_model import load_net, detect
except ImportError:
    print("[-] Error: Obico ML detection libraries not found in /app/obico/ml_api", flush=True)
    print("[-] Ensure you run this inside the ghcr.io/imagegenius/obico:cuda container.", flush=True)
    sys.exit(1)


# ==================== SHARED RUNTIME STATE ====================
state_lock = threading.Lock()
latest_frame_lock = threading.Lock()
latest_annotated_jpeg = None

# Trackers for all fleet printers keyed by context_id or serial
printer_trackers = {}

# Aggregate watchdog status for backward compatibility and overall fleet overview
watchdog_state = {
    "online": True,
    "state": "idle",  # "idle", "monitoring", "alert", "paused"
    "confidence": 0.0,
    "max_confidence": 0.0,
    "consecutive_failures": 0,
    "consecutive_required": CONSECUTIVE_REQUIRED,
    "threshold": CONFIDENCE_THRESHOLD,
    "inference_time_ms": 0,
    "last_check": None,
    "active_job": None,
    "layer": None,
    "auto_pause_enabled": AUTO_PAUSE_ON_FAILURE,
    "auto_pause_triggered": False,
    "total_inspections": 0,
    "total_failures_detected": 0,
    "last_alert_time": None,
    "printer_status": "idle",
    "check_interval_sec": CHECK_INTERVAL_SEC,
    "printers": {},
}


def update_state(**kwargs):
    with state_lock:
        watchdog_state.update(kwargs)


def printer_to_slug(name):
    """Generates a clean file-safe slug from a printer name."""
    clean = re.sub(r'[^a-zA-Z0-9_-]', '_', (name or "printer").lower()).strip('_')
    return clean or "printer"


def clean_job_name(name):
    """Strips file extensions for clean Discord card titles."""
    if not name:
        return "Print Job"
    clean = name
    for ext in ('.gcode.3mf', '.gcode', '.3mf', '.gx', '.g'):
        if clean.lower().endswith(ext):
            clean = clean[:-len(ext)]
            break
    return clean


def trigger_printer_auto_pause(tracker, reason, job_name, layer):
    """Sends a pause command to FlashForgeUI WebUI for the specific printer."""
    printer_name = tracker.get("name", PRINTER_NAME)
    context_id = tracker.get("context_id")
    print(f"[🚨 AUTO-PAUSE] Triggering print pause for {printer_name}: {reason}", flush=True)
    success = False

    # 1. Primary: call FlashForgeUI WebUI pause endpoint with contextId
    if FLASHFORGE_UI_URL:
        try:
            url = f"{FLASHFORGE_UI_URL}/api/printer/control/pause"
            body = {
                "reason": reason,
                "jobName": job_name,
                "layer": layer,
            }
            if context_id:
                body["contextId"] = context_id

            payload = json.dumps(body).encode('utf-8')
            req = urllib.request.Request(
                url,
                data=payload,
                headers={"Content-Type": "application/json", "User-Agent": "Obico-Stream-Watchdog/2.0"},
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=5) as resp:
                print(f"[🚨 AUTO-PAUSE] FlashForgeUI pause confirmed for {printer_name} (HTTP {resp.status})", flush=True)
                success = True
        except Exception as e:
            print(f"[-] FlashForgeUI pause call failed for {printer_name}: {e}", flush=True)

    # 2. Fallback: if Flashforge direct hardware IP is available, call printer HTTP API directly
    if not success and tracker.get("ip") and tracker.get("client_type") != "bambu":
        try:
            url = f"http://{tracker['ip']}:{FLASHFORGE_PORT}/control"
            body = {
                "serialNumber": tracker.get("serial", FLASHFORGE_SERIAL),
                "checkCode": tracker.get("check_code", FLASHFORGE_CHECK_CODE),
                "payload": {"cmd": "pause"}
            }
            req = urllib.request.Request(
                url,
                data=json.dumps(body).encode('utf-8'),
                headers={"Content-Type": "application/json"},
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=5) as resp:
                print(f"[🚨 AUTO-PAUSE] Direct printer pause confirmed for {printer_name} (HTTP {resp.status})", flush=True)
                success = True
        except Exception as e:
            print(f"[-] Direct printer pause fallback failed for {printer_name}: {e}", flush=True)

    if success:
        tracker["auto_pause_triggered"] = True
        tracker["state"] = "paused"
        tracker["last_state"] = "paused"
    return success


def cleanup_old_snapshots(folder, max_count=30):
    try:
        files = sorted(glob.glob(os.path.join(folder, "failure_*.jpg")), key=os.path.getmtime)
        if len(files) > max_count:
            for f in files[:-max_count]:
                try:
                    os.remove(f)
                    json_f = f.replace(".jpg", ".json")
                    if os.path.exists(json_f):
                        os.remove(json_f)
                except Exception:
                    pass
    except Exception:
        pass


def save_printer_snapshot(tracker, annotated_bytes, is_failure=False, confidence=0.0, layer="N/A"):
    global latest_annotated_jpeg
    tracker["latest_frame"] = annotated_bytes
    with latest_frame_lock:
        latest_annotated_jpeg = annotated_bytes

    printer_slug = printer_to_slug(tracker.get("name", "printer"))
    printer_name = tracker.get("name", PRINTER_NAME)

    try:
        os.makedirs(SNAPSHOTS_DIR, exist_ok=True)
        # Always update both global latest and printer-specific latest
        with open(os.path.join(SNAPSHOTS_DIR, "latest.jpg"), "wb") as f:
            f.write(annotated_bytes)
        with open(os.path.join(SNAPSHOTS_DIR, f"latest_{printer_slug}.jpg"), "wb") as f:
            f.write(annotated_bytes)

        if is_failure:
            ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
            pct = int(confidence * 100)
            filename = f"failure_{printer_slug}_{ts}_{pct}pct.jpg"
            path = os.path.join(SNAPSHOTS_DIR, filename)
            with open(path, "wb") as f:
                f.write(annotated_bytes)

            meta_path = os.path.join(SNAPSHOTS_DIR, f"failure_{printer_slug}_{ts}_{pct}pct.json")
            with open(meta_path, "w", encoding="utf-8") as f:
                json.dump({
                    "filename": filename,
                    "timestamp": datetime.utcnow().isoformat(),
                    "confidence": round(confidence, 3),
                    "layer": layer,
                    "printer": printer_name,
                    "printer_slug": printer_slug,
                    "context_id": tracker.get("context_id", ""),
                }, f)
            cleanup_old_snapshots(SNAPSHOTS_DIR, max_count=30)
    except Exception as err:
        print(f"[-] Snapshot save error ({printer_name}): {err}", flush=True)


def list_snapshots(folder, filter_slug=None):
    results = []
    try:
        if not os.path.exists(folder):
            return results
        meta_files = sorted(glob.glob(os.path.join(folder, "failure_*.json")), key=os.path.getmtime, reverse=True)
        for mf in meta_files[:30]:
            try:
                with open(mf, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if filter_slug:
                        if data.get("printer_slug") == filter_slug or data.get("context_id") == filter_slug:
                            results.append(data)
                    else:
                        results.append(data)
            except Exception:
                pass
    except Exception:
        pass
    return results


_last_webhook_fetch = 0
_cached_webui_webhook = None


def get_effective_discord_webhook():
    """Returns the active Discord webhook URL, resolving from WebUI settings first, then environment."""
    global DISCORD_WEBHOOK, _last_webhook_fetch, _cached_webui_webhook
    now = time.time()

    # Query WebUI notification endpoint every 10 seconds for dynamic updates
    if now - _last_webhook_fetch > 10:
        _last_webhook_fetch = now
        try:
            url = f"{FLASHFORGE_UI_URL.rstrip('/')}/api/notifications/discord"
            req = urllib.request.Request(url, headers={"User-Agent": "Obico-Stream-Watchdog/2.0"})
            with urllib.request.urlopen(req, timeout=3) as resp:
                if resp.status == 200:
                    data = json.loads(resp.read().decode('utf-8', errors='ignore'))
                    wh = (data.get("webhookUrl") or "").strip()
                    if wh and wh.startswith("http"):
                        _cached_webui_webhook = wh
                    elif data.get("success"):
                        _cached_webui_webhook = ""  # Explicitly cleared in WebUI
        except Exception:
            pass

    if _cached_webui_webhook:
        return _cached_webui_webhook

    if DISCORD_WEBHOOK and DISCORD_WEBHOOK.strip():
        return DISCORD_WEBHOOK.strip()

    return ""


def send_discord_alert(title, description, color, image_bytes=None, is_alert=False, printer_name=None):
    """Sends a clean embed message to the configured Discord webhook."""
    webhook_url = get_effective_discord_webhook()
    if not webhook_url:
        now = time.time()
        if now - getattr(send_discord_alert, "_last_missing_log", 0) > 120:
            send_discord_alert._last_missing_log = now
            print(f"[⚠️ Discord] Notice: Alert '{title}' not delivered (no DISCORD_WEBHOOK configured in .env or WebUI)", flush=True)
        return

    pname = printer_name or PRINTER_NAME
    payload = {
        "embeds": [{
            "title": title,
            "description": description,
            "color": color,
            "timestamp": datetime.utcnow().isoformat(),
            "footer": {"text": f"Printer: {pname}"}
        }]
    }
    if is_alert:
        payload["content"] = f"🚨 **Attention: {pname}**"

    try:
        headers = {"User-Agent": "Obico-Stream-Watchdog/2.0"}
        if image_bytes:
            payload["embeds"][0]["image"] = {"url": "attachment://detection.jpg"}
            files = {
                "payload_json": (None, json.dumps(payload), "application/json"),
                "file": ("detection.jpg", image_bytes, "image/jpeg")
            }
            resp = requests.post(webhook_url, files=files, headers=headers, timeout=10)
        else:
            resp = requests.post(webhook_url, json=payload, headers=headers, timeout=10)

        print(f"[+] Discord notification sent for {pname} (HTTP {resp.status_code}): {title}", flush=True)
    except Exception as err:
        print(f"[-] Discord delivery failed for {pname}: {err}", flush=True)


# ==================== CAMERA FRAME CAPTURE ====================

def capture_frame_from_stream(stream_url):
    """Extracts a single JPEG image frame from a continuous camera stream and closes connection."""
    stream = None
    try:
        req = urllib.request.Request(stream_url, headers={"User-Agent": "Obico-Stream-Watchdog/2.0"})
        stream = urllib.request.urlopen(req, timeout=6)
        buf = b""
        while True:
            chunk = stream.read(4096)
            if not chunk:
                break
            buf += chunk
            a = buf.find(b"\xff\xd8")  # JPEG Start
            b = buf.find(b"\xff\xd9", a + 2) if a != -1 else -1  # JPEG End
            if a != -1 and b != -1:
                return buf[a:b + 2]
    except Exception as err:
        print(f"[-] Camera stream capture error ({stream_url}): {err}", flush=True)
        return None
    finally:
        if stream:
            try:
                stream.close()
            except Exception:
                pass


def capture_printer_frame(tracker):
    """
    Captures a frame for a specific printer:
    1. First tries the WebUI snapshot proxy (/api/camera/snapshot?contextId=...)
    2. Fallback: tries direct camera stream URL if known
    """
    context_id = tracker.get("context_id")
    printer_name = tracker.get("name", "Printer")

    # 1. Primary: FlashForgeUI snapshot endpoint
    if FLASHFORGE_UI_URL and context_id:
        url = f"{FLASHFORGE_UI_URL}/api/camera/snapshot?contextId={urllib.parse.quote(context_id)}"
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Obico-Stream-Watchdog/2.0"})
            with urllib.request.urlopen(req, timeout=6) as resp:
                if resp.status == 200:
                    data = resp.read()
                    if len(data) > 100:
                        return data
        except Exception as e:
            # Fallback will attempt direct streaming
            pass

    # 2. Fallback: direct camera stream URL
    cam_url = tracker.get("camera_url")
    if not cam_url and tracker.get("ip"):
        cam_url = f"http://{tracker['ip']}:8080/?action=stream"
    if not cam_url and (tracker.get("id") == "default" or not context_id):
        cam_url = CAMERA_STREAM_URL

    if cam_url:
        return capture_frame_from_stream(cam_url)

    print(f"[-] No valid camera source reachable for {printer_name}", flush=True)
    return None


# ==================== FLEET SYNCHRONIZATION ====================

def fetch_fleet_printers():
    """Queries FlashForgeUI /api/printers/overview to discover all configured printers."""
    if not FLASHFORGE_UI_URL:
        return None

    url = f"{FLASHFORGE_UI_URL}/api/printers/overview"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Obico-Stream-Watchdog/2.0"})
        with urllib.request.urlopen(req, timeout=5) as resp:
            if resp.status == 200:
                data = json.loads(resp.read().decode('utf-8', errors='ignore'))
                if data.get("success") and "printers" in data:
                    return data["printers"]
    except Exception:
        pass
    return None


def sync_fleet_trackers():
    """Synchronizes local printer trackers with configured printers in FlashForgeUI."""
    fetch_and_apply_remote_config()
    fleet = fetch_fleet_printers()
    with state_lock:
        if fleet and isinstance(fleet, list) and len(fleet) > 0:
            current_ids = set()
            for p in fleet:
                context_id = p.get("contextId") or p.get("serialNumber") or p.get("name")
                if not context_id:
                    continue
                current_ids.add(context_id)

                # Match existing tracker by context_id, serialNumber, or name (to preserve state across WebUI restarts)
                existing_key = None
                if context_id in printer_trackers:
                    existing_key = context_id
                else:
                    p_serial = p.get("serialNumber")
                    p_name = p.get("name")
                    for k, tr in list(printer_trackers.items()):
                        if p_serial and tr.get("serial") == p_serial:
                            existing_key = k
                            break
                        if p_name and tr.get("name") == p_name:
                            existing_key = k
                            break

                if existing_key and existing_key != context_id:
                    # Context ID updated (e.g. WebUI restart); migrate existing tracker state cleanly
                    printer_trackers[context_id] = printer_trackers.pop(existing_key)
                    existing_key = context_id

                if not existing_key:
                    printer_trackers[context_id] = {
                        "id": context_id,
                        "context_id": p.get("contextId") or context_id,
                        "name": p.get("name") or p.get("model") or "3D Printer",
                        "model": p.get("model", ""),
                        "serial": p.get("serialNumber", ""),
                        "ip": p.get("ipAddress", ""),
                        "check_code": p.get("checkCode", ""),
                        "client_type": p.get("clientType", ""),
                        "has_camera": p.get("hasCamera", True),
                        "camera_url": p.get("customCameraUrl") or "",
                        "is_connected": p.get("isConnected", False),
                        "state": "idle",
                        "printer_status": "idle",
                        "confidence": 0.0,
                        "max_confidence": 0.0,
                        "consecutive_failures": 0,
                        "consecutive_required": CONSECUTIVE_REQUIRED,
                        "threshold": CONFIDENCE_THRESHOLD,
                        "check_interval_sec": CHECK_INTERVAL_SEC,
                        "inference_time_ms": 0,
                        "last_check": None,
                        "active_job": None,
                        "layer": None,
                        "auto_pause_enabled": AUTO_PAUSE_ON_FAILURE,
                        "auto_pause_triggered": False,
                        "auto_pause_alerted": False,
                        "total_inspections": 0,
                        "total_failures_detected": 0,
                        "last_alert_time": 0,
                        "was_in_failure_state": False,
                        "last_state": "idle",
                        "last_filename": "",
                        "notified_milestones": set(),
                        "latest_frame": None,
                    }
                else:
                    # Update dynamic info
                    t = printer_trackers[context_id]
                    t["name"] = p.get("name") or t["name"]
                    t["model"] = p.get("model") or t["model"]
                    t["serial"] = p.get("serialNumber") or t["serial"]
                    t["ip"] = p.get("ipAddress") or t["ip"]
                    t["is_connected"] = p.get("isConnected", t["is_connected"])
                    t["has_camera"] = p.get("hasCamera", t["has_camera"])
                    if p.get("contextId"):
                        t["context_id"] = p["contextId"]

                # Attach latest status payload
                status_obj = p.get("status")
                if status_obj and isinstance(status_obj, dict):
                    printer_trackers[context_id]["live_status"] = status_obj
        else:
            # Standalone fallback if FlashForgeUI is unreachable
            if not printer_trackers:
                default_id = "default"
                printer_trackers[default_id] = {
                    "id": default_id,
                    "context_id": default_id,
                    "name": PRINTER_NAME,
                    "model": PRINTER_NAME,
                    "serial": FLASHFORGE_SERIAL,
                    "ip": PRINTER_IP,
                    "check_code": FLASHFORGE_CHECK_CODE,
                    "client_type": PRINTER_TYPE,
                    "has_camera": True,
                    "camera_url": CAMERA_STREAM_URL,
                    "is_connected": True,
                    "state": "idle",
                    "printer_status": "idle",
                    "confidence": 0.0,
                    "max_confidence": 0.0,
                    "consecutive_failures": 0,
                    "consecutive_required": CONSECUTIVE_REQUIRED,
                    "threshold": CONFIDENCE_THRESHOLD,
                    "check_interval_sec": CHECK_INTERVAL_SEC,
                    "inference_time_ms": 0,
                    "last_check": None,
                    "active_job": None,
                    "layer": None,
                    "auto_pause_enabled": AUTO_PAUSE_ON_FAILURE,
                    "auto_pause_triggered": False,
                    "auto_pause_alerted": False,
                    "total_inspections": 0,
                    "total_failures_detected": 0,
                    "last_alert_time": 0,
                    "was_in_failure_state": False,
                    "last_state": "idle",
                    "last_filename": "",
                    "notified_milestones": set(),
                    "latest_frame": None,
                }


def tracker_to_public_status(t):
    """Converts a printer tracker dictionary into a clean public WatchdogStatus dictionary."""
    return {
        "online": True,
        "state": t.get("state", "idle"),
        "confidence": round(t.get("confidence", 0.0), 3),
        "max_confidence": round(t.get("max_confidence", 0.0), 3),
        "consecutive_failures": t.get("consecutive_failures", 0),
        "consecutive_required": t.get("consecutive_required", CONSECUTIVE_REQUIRED),
        "threshold": t.get("threshold", CONFIDENCE_THRESHOLD),
        "inference_time_ms": t.get("inference_time_ms", 0),
        "last_check": t.get("last_check"),
        "active_job": t.get("active_job"),
        "layer": t.get("layer"),
        "auto_pause_enabled": t.get("auto_pause_enabled", True),
        "auto_pause_triggered": t.get("auto_pause_triggered", False),
        "total_inspections": t.get("total_inspections", 0),
        "total_failures_detected": t.get("total_failures_detected", 0),
        "printer_status": t.get("printer_status", "idle"),
        "printer_name": t.get("name", PRINTER_NAME),
        "printer_model": t.get("model", ""),
        "context_id": t.get("context_id", ""),
        "check_interval_sec": t.get("check_interval_sec", CHECK_INTERVAL_SEC),
    }


def update_aggregate_state():
    """Aggregates all individual printer states into the root watchdog_state."""
    with state_lock:
        trackers = list(printer_trackers.values())
        if not trackers:
            return

        # Build public dictionary of all printers
        public_printers = {}
        for t in trackers:
            cid = t.get("context_id") or t.get("id")
            public_printers[cid] = tracker_to_public_status(t)
            # Also key by slug and name for friendly lookup
            public_printers[printer_to_slug(t.get("name", ""))] = public_printers[cid]

        # Prioritize states: alert > monitoring > paused > idle
        alert_trackers = [t for t in trackers if t.get("state") == "alert"]
        monitoring_trackers = [t for t in trackers if t.get("state") == "monitoring"]
        paused_trackers = [t for t in trackers if t.get("state") == "paused"]

        if alert_trackers:
            primary = alert_trackers[0]
            root_state = "alert"
        elif monitoring_trackers:
            primary = monitoring_trackers[0]
            root_state = "monitoring"
        elif paused_trackers:
            primary = paused_trackers[0]
            root_state = "paused"
        else:
            primary = trackers[0]
            root_state = "idle"

        watchdog_state.update({
            "online": True,
            "state": root_state,
            "confidence": round(primary.get("confidence", 0.0), 3),
            "max_confidence": round(primary.get("max_confidence", 0.0), 3),
            "consecutive_failures": primary.get("consecutive_failures", 0),
            "consecutive_required": primary.get("consecutive_required", CONSECUTIVE_REQUIRED),
            "threshold": CONFIDENCE_THRESHOLD,
            "inference_time_ms": primary.get("inference_time_ms", 0),
            "last_check": primary.get("last_check"),
            "active_job": primary.get("active_job"),
            "layer": primary.get("layer"),
            "auto_pause_enabled": AUTO_PAUSE_ON_FAILURE,
            "auto_pause_triggered": primary.get("auto_pause_triggered", False),
            "total_inspections": sum(t.get("total_inspections", 0) for t in trackers),
            "total_failures_detected": sum(t.get("total_failures_detected", 0) for t in trackers),
            "printer_status": primary.get("printer_status", "idle"),
            "check_interval_sec": CHECK_INTERVAL_SEC,
            "printers": public_printers,
        })


# ==================== LEGACY FALLBACK PRINTER QUERIES ====================

def discover_flashforge_serial(ip, timeout=2.0):
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(timeout)
        s.sendto(b'', (ip, 19000))
        data, _ = s.recvfrom(512)
        s.close()
        if len(data) >= 276:
            serial = data[0x92:0x92 + 128].decode('utf-8', errors='ignore').split('\x00', 1)[0].strip()
            if serial:
                return serial
    except Exception:
        pass
    return None


def get_flashforge_state(ip, serial_number, check_code, port=8898):
    url = f"http://{ip}:{port}/detail"
    payload = {"serialNumber": serial_number or "", "checkCode": check_code or ""}
    try:
        req = urllib.request.Request(url, data=json.dumps(payload).encode('utf-8'), headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode('utf-8', errors='ignore'))

        code = data.get("code", -1)
        if code != 0:
            return False, "unknown_error", {}, f"API code {code}"

        detail = data.get("detail", {})
        raw_status = (detail.get("status") or "").lower()
        is_printing = raw_status in ("printing", "heating", "busy", "pausing", "paused", "pause")

        nozzle_temps = detail.get("nozzleTemps") or []
        active_nozzle_temp = max(nozzle_temps) if nozzle_temps else detail.get("rightTemp", None)
        raw_prog = detail.get("printProgress", 0)
        progress_pct = round(raw_prog * 100, 1) if raw_prog <= 1.0 else round(raw_prog, 1)
        cur_layer = detail.get('printLayer', 0)
        tgt_layer = detail.get('targetPrintLayer', 0)
        duration_sec = detail.get("printDuration") or detail.get("PrintDuration") or 0
        est_sec = detail.get("estimatedTime") or detail.get("EstimatedTime") or 0

        # Primary: True time-weighted overall print progress
        if duration_sec > 0 and est_sec > 0:
            total_sec = duration_sec + est_sec
            progress_pct = round((duration_sec / total_sec) * 100, 1)
        elif raw_status in ("heating", "busy", "preparing", "calibrating"):
            progress_pct = 0.0
        # Guard against stale 100% / 1.0 progress from previous print during job start or warmup
        elif progress_pct >= 90 and (cur_layer < max(1, tgt_layer * 0.5)):
            progress_pct = 0.0

        job_info = {
            "status": raw_status,
            "filename": detail.get("printFileName", ""),
            "progress": progress_pct,
            "raw_progress": raw_prog,
            "layer": f"{cur_layer}/{tgt_layer}",
            "print_duration": detail.get("printDuration", 0),
            "nozzle_temp": active_nozzle_temp,
            "bed_temp": detail.get("platTemp", None),
        }
        return is_printing, raw_status, job_info, None
    except Exception as e:
        return False, "connection_error", {}, str(e)


# ==================== EMBEDDED HTTP API SERVER ====================

class WatchdogAPIHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # Quiet logger
        pass

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path.rstrip('/')
        query = urllib.parse.parse_qs(parsed.query)

        context_id = query.get("contextId", [None])[0] or query.get("printer", [None])[0]

        if path == "" or path == "/status":
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()

            with state_lock:
                if context_id and context_id in printer_trackers:
                    resp_obj = tracker_to_public_status(printer_trackers[context_id])
                elif context_id and printer_to_slug(context_id) in watchdog_state.get("printers", {}):
                    resp_obj = watchdog_state["printers"][printer_to_slug(context_id)]
                else:
                    resp_obj = dict(watchdog_state)
                data = json.dumps(resp_obj).encode('utf-8')
            self.wfile.write(data)

        elif path == "/snapshot/latest":
            data = None
            if context_id:
                with state_lock:
                    tracker = printer_trackers.get(context_id)
                if tracker and tracker.get("latest_frame"):
                    data = tracker["latest_frame"]
                else:
                    slug = printer_to_slug(context_id)
                    slug_path = os.path.join(SNAPSHOTS_DIR, f"latest_{slug}.jpg")
                    if os.path.exists(slug_path):
                        try:
                            with open(slug_path, "rb") as f:
                                data = f.read()
                        except Exception:
                            pass

            if not data:
                with latest_frame_lock:
                    data = latest_annotated_jpeg
                if not data:
                    latest_file = os.path.join(SNAPSHOTS_DIR, "latest.jpg")
                    if os.path.exists(latest_file):
                        try:
                            with open(latest_file, "rb") as f:
                                data = f.read()
                        except Exception:
                            pass

            if data:
                self.send_response(200)
                self.send_header('Content-Type', 'image/jpeg')
                self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
                self.end_headers()
                self.wfile.write(data)
            else:
                self.send_response(404)
                self.end_headers()

        elif path == "/snapshots":
            filter_slug = printer_to_slug(context_id) if context_id else None
            snapshots = list_snapshots(SNAPSHOTS_DIR, filter_slug=filter_slug)
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"snapshots": snapshots}).encode('utf-8'))

        elif path.startswith("/snapshot/"):
            fname = os.path.basename(path.replace("/snapshot/", ""))
            fpath = os.path.join(SNAPSHOTS_DIR, fname)
            if os.path.exists(fpath) and fname.endswith(".jpg"):
                self.send_response(200)
                self.send_header('Content-Type', 'image/jpeg')
                self.send_header('Cache-Control', 'public, max-age=86400')
                self.end_headers()
                with open(fpath, "rb") as f:
                    self.wfile.write(f.read())
            else:
                self.send_response(404)
                self.end_headers()
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        global CONFIDENCE_THRESHOLD, CONSECUTIVE_REQUIRED, CHECK_INTERVAL_SEC, AUTO_PAUSE_ON_FAILURE
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path.rstrip('/')

        if path == "/config":
            try:
                content_len = int(self.headers.get('Content-Length', 0))
                body = json.loads(self.rfile.read(content_len).decode('utf-8'))
                if "threshold" in body:
                    CONFIDENCE_THRESHOLD = float(body["threshold"])
                if "consecutive_required" in body:
                    CONSECUTIVE_REQUIRED = int(body["consecutive_required"])
                if "auto_pause_enabled" in body:
                    AUTO_PAUSE_ON_FAILURE = bool(body["auto_pause_enabled"])
                if "check_interval_sec" in body:
                    CHECK_INTERVAL_SEC = int(body["check_interval_sec"])

                with state_lock:
                    for t in printer_trackers.values():
                        t["threshold"] = CONFIDENCE_THRESHOLD
                        t["consecutive_required"] = CONSECUTIVE_REQUIRED
                        t["auto_pause_enabled"] = AUTO_PAUSE_ON_FAILURE
                        t["check_interval_sec"] = CHECK_INTERVAL_SEC

                update_aggregate_state()
                save_local_config()
                print(f"[⚙️ Config Updated] Threshold: {CONFIDENCE_THRESHOLD}, Consecutive: {CONSECUTIVE_REQUIRED}, Interval: {CHECK_INTERVAL_SEC}s, Auto-Pause: {AUTO_PAUSE_ON_FAILURE}", flush=True)

                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                with state_lock:
                    resp_data = json.dumps({"success": True, "config": watchdog_state}).encode('utf-8')
                self.wfile.write(resp_data)
            except Exception as e:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"success": False, "error": str(e)}).encode('utf-8'))

        elif path == "/pause":
            try:
                content_len = int(self.headers.get('Content-Length', 0))
                body = json.loads(self.rfile.read(content_len).decode('utf-8')) if content_len > 0 else {}
            except Exception:
                body = {}

            target_context = body.get("contextId")
            with state_lock:
                target_tracker = printer_trackers.get(target_context) if target_context else None
                if not target_tracker and printer_trackers:
                    target_tracker = next((t for t in printer_trackers.values() if t.get("state") in ("alert", "monitoring")), list(printer_trackers.values())[0])

            ok = False
            if target_tracker:
                job_name = target_tracker.get("active_job", "")
                layer = target_tracker.get("layer", "")
                ok = trigger_printer_auto_pause(target_tracker, "Manual pause from WebUI Watchdog", job_name, layer)

            self.send_response(200 if ok else 500)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"success": ok}).encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()


class ThreadedTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    daemon_threads = True
    allow_reuse_address = True


def start_api_server(port):
    server = ThreadedTCPServer(("0.0.0.0", port), WatchdogAPIHandler)
    print(f"[🌐 API] Watchdog REST API server listening on 0.0.0.0:{port}", flush=True)
    server.serve_forever()


# ==================== MAIN WATCHDOG LOOP ====================

def main():
    print(f"[*] Starting Obico Multi-Printer Watchdog for YourPrinter...", flush=True)
    print(f"    YourPrinter Backend: {FLASHFORGE_UI_URL}", flush=True)

    # 1. Load locally cached config file if present
    load_local_config()
    # 2. Fetch persistent config from YourPrinter backend
    fetch_and_apply_remote_config()

    print(f"    Check Interval: {CHECK_INTERVAL_SEC}s", flush=True)
    print(f"    Alert Cooldown: {ALERT_COOLDOWN_SEC}s", flush=True)
    print(f"    Confidence Threshold: {CONFIDENCE_THRESHOLD}", flush=True)
    print(f"    Consecutive Required: {CONSECUTIVE_REQUIRED}", flush=True)
    print(f"    Auto-Pause On Failure: {AUTO_PAUSE_ON_FAILURE}", flush=True)
    active_wh = get_effective_discord_webhook()
    if active_wh:
        masked = active_wh[:35] + "..." + active_wh[-6:] if len(active_wh) > 42 else "***"
        print(f"    Discord Webhook: Configured ({masked})", flush=True)
    else:
        print(f"    Discord Webhook: [DISABLED] Set DISCORD_WEBHOOK in .env or via WebUI Settings", flush=True)

    # Start background API server
    api_thread = threading.Thread(target=start_api_server, args=(WATCHDOG_API_PORT,), daemon=True)
    api_thread.start()

    print("[*] Initializing Darknet ML model on GPU...", flush=True)
    cfg_path = '/app/obico/ml_api/model/model.cfg'
    meta_path = '/app/obico/ml_api/model/model.meta'
    net = load_net(cfg_path, meta_path)
    print("[+] Model loaded into GPU memory. Multi-printer inference engine ready!", flush=True)

    # Initial printer discovery
    sync_fleet_trackers()
    update_aggregate_state()

    with state_lock:
        discovered_names = [t.get("name", "Unknown") for t in printer_trackers.values()]

    print(f"[+] Initial fleet discovered: {len(discovered_names)} printer(s) ({', '.join(discovered_names)})", flush=True)

    if SEND_STARTUP_ALERT:
        names_str = ", ".join(discovered_names) if discovered_names else PRINTER_NAME
        send_discord_alert(
            title="🟢 Watchdog Online",
            description=f"AI failure monitoring active for **{len(discovered_names)} printer(s)**: `{names_str}`.",
            color=0x00FF00,
            printer_name=f"Fleet ({len(discovered_names)})"
        )

    last_fleet_sync = time.time()
    last_idle_log_time = 0

    while True:
        try:
            # Re-sync fleet printers from WebUI every 30 seconds
            now = time.time()
            if now - last_fleet_sync >= 30:
                sync_fleet_trackers()
                last_fleet_sync = now

            with state_lock:
                trackers = list(printer_trackers.values())

            active_printing_count = 0

            for tracker in trackers:
                printer_name = tracker.get("name", PRINTER_NAME)
                printer_model = tracker.get("model", "")
                printer_id = tracker.get("id")

                # 1. Determine print state
                live_status = tracker.get("live_status")
                if live_status and isinstance(live_status, dict):
                    raw_state = (live_status.get("printerState") or "").lower()
                    is_active = raw_state in ("printing", "heating", "busy", "preparing", "calibrating", "pausing", "paused", "pause")
                    job_filename = live_status.get("jobName") or ""
                    progress_pct = live_status.get("progress") or 0
                    cur_layer_val = live_status.get("currentLayer")
                    tgt_layer_val = live_status.get("totalLayers")
                    layer_str = f"{cur_layer_val}/{tgt_layer_val}" if cur_layer_val is not None else "N/A"
                    nozzle_temp = live_status.get("nozzleTemperature", "N/A")
                    bed_temp = live_status.get("bedTemperature", "N/A")
                    duration_sec = live_status.get("printDuration") or 0

                    # Guard against stale 100% progress carried over from previous completed job in live_status
                    if progress_pct >= 90 and (
                        raw_state in ("heating", "busy", "preparing", "calibrating") or
                        (duration_sec < 120 and (tgt_layer_val is None or tgt_layer_val > 10)) or
                        (tgt_layer_val and cur_layer_val is not None and tgt_layer_val > 1 and cur_layer_val < tgt_layer_val * 0.5)
                    ):
                        progress_pct = 0.0
                else:
                    # Fallback to direct printer check if available
                    if tracker.get("ip") and tracker.get("client_type") == "flashforge":
                        is_active, raw_state, jinfo, _ = get_flashforge_state(
                            tracker["ip"],
                            tracker.get("serial", FLASHFORGE_SERIAL),
                            tracker.get("check_code", FLASHFORGE_CHECK_CODE)
                        )
                        job_filename = jinfo.get("filename", "")
                        progress_pct = jinfo.get("progress", 0)
                        layer_str = jinfo.get("layer", "N/A")
                        nozzle_temp = jinfo.get("nozzle_temp", "N/A")
                        bed_temp = jinfo.get("bed_temp", "N/A")
                        duration_sec = jinfo.get("print_duration", 0)
                    else:
                        is_active = False
                        raw_state = "idle"
                        job_filename = ""
                        progress_pct = 0
                        layer_str = "N/A"
                        nozzle_temp = "N/A"
                        bed_temp = "N/A"
                        duration_sec = 0

                tracker["printer_status"] = raw_state

                # Normalize current state
                if not tracker.get("is_connected", True) or not is_active or raw_state in ("idle", "ready", "complete", "completed", "finish", ""):
                    current_state = "idle"
                elif raw_state in ("paused", "pausing", "pause") or tracker.get("auto_pause_triggered", False):
                    current_state = "paused"
                else:
                    current_state = "printing"
                    active_printing_count += 1

                tracker["state"] = current_state

                # State Transitions
                last_state = tracker.get("last_state", "idle")
                last_filename = tracker.get("last_filename", "")

                # Detect if job changed while remaining in printing state (back-to-back jobs without idle transition)
                if current_state == "printing" and job_filename and last_filename and job_filename != last_filename:
                    print(f"[*] {printer_name}: Job changed from '{last_filename}' to '{job_filename}'. Resetting print tracking.", flush=True)
                    tracker["notified_milestones"].clear()
                    tracker["consecutive_failures"] = 0
                    tracker["was_in_failure_state"] = False
                    tracker["auto_pause_triggered"] = False
                    tracker["auto_pause_alerted"] = False
                    last_state = "idle"

                if current_state == "idle":
                    if last_state in ("printing", "paused"):
                        clean_name = clean_job_name(last_filename or job_filename)
                        duration_min = int(duration_sec // 60) if duration_sec else 0
                        if progress_pct >= 95 or raw_state in ("complete", "completed", "finish"):
                            print(f"[🎉] {printer_name}: Print finished ({raw_state}). Deactivating camera.", flush=True)
                            if SEND_PRINT_COMPLETE_ALERT:
                                send_discord_alert(
                                    title=f"🎉 Print Complete: {clean_name}",
                                    description=f"Completed in **{duration_min} min** on **{printer_name}**.",
                                    color=0x00AAFF,
                                    printer_name=printer_name
                                )
                        else:
                            print(f"[🛑] {printer_name}: Print stopped ({raw_state}, {progress_pct}%). Deactivating camera.", flush=True)
                            if SEND_PRINT_COMPLETE_ALERT:
                                send_discord_alert(
                                    title=f"🛑 Print Stopped: {clean_name}",
                                    description=f"Stopped at **{progress_pct}%** (Layer {layer_str}) on **{printer_name}**.",
                                    color=0xF39C12,
                                    printer_name=printer_name
                                )

                        tracker["last_state"] = "idle"
                        tracker["consecutive_failures"] = 0
                        tracker["was_in_failure_state"] = False
                        tracker["notified_milestones"].clear()
                        tracker["auto_pause_triggered"] = False
                        tracker["auto_pause_alerted"] = False
                        tracker["confidence"] = 0.0

                    continue

                elif current_state == "paused":
                    tracker["state"] = "paused"
                    tracker["consecutive_failures"] = 0
                    if last_state == "printing":
                        clean_name = clean_job_name(job_filename or last_filename)
                        print(f"[⏸️] {printer_name}: Print paused! Suspending camera inference.", flush=True)
                        if SEND_PRINT_PAUSE_ALERT and not tracker.get("auto_pause_alerted", False):
                            send_discord_alert(
                                title=f"⏸️ Print Paused: {clean_name}",
                                description=f"Paused at **{progress_pct}%** (Layer {layer_str}) on **{printer_name}**.",
                                color=0xF1C40F,
                                printer_name=printer_name
                            )
                    tracker["last_state"] = "paused"
                    continue

                elif current_state == "printing":
                    clean_name = clean_job_name(job_filename or last_filename)
                    if job_filename:
                        tracker["last_filename"] = job_filename
                    tracker["active_job"] = job_filename
                    tracker["layer"] = layer_str

                    if last_state == "idle":
                        print(f"[🔥] {printer_name}: Active print detected ({raw_state})! Opening camera stream and starting Darknet inference...", flush=True)
                        tracker["notified_milestones"].clear()
                        # If watchdog started up mid-print, record already passed milestones without alerting
                        if progress_pct < 95:
                            tracker["notified_milestones"] = {m for m in (25, 50, 75) if progress_pct >= m}
                        if SEND_PRINT_START_ALERT:
                            send_discord_alert(
                                title=f"▶️ Print Started: {clean_name}",
                                description=(
                                    f"• **Printer:** `{printer_name}` ({printer_model})\n"
                                    f"• **Layers:** `{layer_str}`\n"
                                    f"• **Nozzle:** `{nozzle_temp}°C` | **Bed:** `{bed_temp}°C`\n"
                                    f"• **AI Guard:** Active"
                                ),
                                color=0x3498DB,
                                printer_name=printer_name
                            )
                        tracker["last_state"] = "printing"
                        tracker["auto_pause_triggered"] = False
                        tracker["auto_pause_alerted"] = False

                    elif last_state == "paused":
                        print(f"[▶️] {printer_name}: Print resumed! Resuming Darknet inference...", flush=True)
                        if SEND_PRINT_RESUME_ALERT:
                            send_discord_alert(
                                title=f"▶️ Print Resumed: {clean_name}",
                                description=f"Resumed at **{progress_pct}%** on **{printer_name}**.",
                                color=0x2ECC71,
                                printer_name=printer_name
                            )
                        tracker["last_state"] = "printing"
                        tracker["auto_pause_triggered"] = False
                        tracker["auto_pause_alerted"] = False
                        tracker["consecutive_failures"] = 0
                        tracker["was_in_failure_state"] = False

                    # 2. Capture camera frame for this printer
                    jpg = capture_printer_frame(tracker)
                    if jpg is None:
                        continue

                    # Milestone progress checks (25%, 50%, 75%)
                    # Rules:
                    # - 25% fires only when progress is within [25%, 50%)
                    # - 50% fires only when progress is within [50%, 75%)
                    # - 75% fires only when progress is within [75%, 95%)
                    # - Never fire milestone alerts when progress >= 95% (handled by print complete alert)
                    # - Mark passed milestones in notified_milestones so they don't fire retroactively or in bursts
                    if progress_pct >= 95:
                        tracker["notified_milestones"].update({25, 50, 75})
                    else:
                        milestone_windows = [
                            (25, 25.0, 50.0, 0x3498DB),
                            (50, 50.0, 75.0, 0x2ECC71),
                            (75, 75.0, 95.0, 0xF39C12),
                        ]
                        for m_val, m_min, m_max, m_color in milestone_windows:
                            if progress_pct >= m_max:
                                # Progress has moved beyond this window; mark as seen without sending spam
                                tracker["notified_milestones"].add(m_val)
                            elif m_min <= progress_pct < m_max and m_val not in tracker["notified_milestones"]:
                                tracker["notified_milestones"].add(m_val)
                                duration_min = int(duration_sec // 60) if duration_sec else 0
                                print(f"[📊] {printer_name}: Milestone {m_val}% reached ({progress_pct}%). Sending Discord alert...", flush=True)
                                if SEND_PRINT_PROGRESS_ALERT:
                                    send_discord_alert(
                                        title=f"📊 {m_val}% Reached: {clean_name}",
                                        description=f"• **Printer:** `{printer_name}`\n• **Overall Progress:** `{progress_pct}%` (Layer {layer_str})\n• **Elapsed:** `{duration_min}m`",
                                        color=m_color,
                                        image_bytes=jpg,
                                        printer_name=printer_name
                                    )

                    img_array = np.frombuffer(jpg, dtype=np.uint8)
                    img = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
                    if img is None:
                        continue

                    # 3. Run Darknet YOLO GPU inference
                    t0 = time.time()
                    thresh = tracker.get("threshold", CONFIDENCE_THRESHOLD)
                    detections = detect(net, img, thresh=thresh)
                    inference_time_sec = time.time() - t0
                    inference_time_ms = int(inference_time_sec * 1000)

                    valid_detections = [d for d in detections if d[1] >= thresh]

                    if valid_detections:
                        tracker["consecutive_failures"] = tracker.get("consecutive_failures", 0) + 1
                        consecutive_failures = tracker["consecutive_failures"]
                        max_conf = max(d[1] for d in valid_detections)

                        print(
                            f"[!] {printer_name}: Detection #{consecutive_failures}: {len(valid_detections)} issues "
                            f"(max conf {max_conf:.2f}) in {inference_time_sec:.3f}s",
                            flush=True
                        )

                        now_t = time.time()
                        time_since_last_alert = now_t - tracker.get("last_alert_time", 0)

                        # Draw red bounding boxes
                        for label, conf, (x, y, box_w, box_h) in valid_detections:
                            x1 = int(x - box_w / 2)
                            y1 = int(y - box_h / 2)
                            x2 = int(x + box_w / 2)
                            y2 = int(y + box_h / 2)
                            cv2.rectangle(img, (x1, y1), (x2, y2), (0, 0, 255), 2)
                            cv2.putText(
                                img,
                                f"Spaghetti {conf * 100:.0f}%",
                                (x1, max(y1 - 10, 20)),
                                cv2.FONT_HERSHEY_SIMPLEX,
                                0.6,
                                (0, 0, 255),
                                2
                            )

                        _, annotated_jpg = cv2.imencode('.jpg', img)
                        annotated_bytes = annotated_jpg.tobytes()

                        save_printer_snapshot(tracker, annotated_bytes, is_failure=True, confidence=max_conf, layer=layer_str)

                        tracker.update({
                            "state": "alert",
                            "confidence": round(max_conf, 3),
                            "max_confidence": max(tracker.get("max_confidence", 0.0), round(max_conf, 3)),
                            "inference_time_ms": inference_time_ms,
                            "last_check": datetime.utcnow().isoformat(),
                            "total_failures_detected": tracker.get("total_failures_detected", 0) + 1,
                            "total_inspections": tracker.get("total_inspections", 0) + 1,
                        })

                        consecutive_required = tracker.get("consecutive_required", CONSECUTIVE_REQUIRED)
                        if consecutive_failures >= consecutive_required:
                            tracker["was_in_failure_state"] = True

                            # Do not alert or keep alerting if print was already paused or auto-pause was already alerted
                            is_already_paused = (
                                current_state == "paused"
                                or raw_state in ("paused", "pausing", "pause")
                                or tracker.get("auto_pause_alerted", False)
                                or tracker.get("auto_pause_triggered", False)
                            )

                            if is_already_paused:
                                print(f"[*] {printer_name}: Print already paused/alerted; suppressing repeated failure alert.", flush=True)
                            else:
                                # Trigger Auto-Pause for this printer if enabled
                                if AUTO_PAUSE_ON_FAILURE and not tracker.get("auto_pause_triggered"):
                                    pause_ok = trigger_printer_auto_pause(
                                        tracker,
                                        f"Spaghetti defect ({int(max_conf * 100)}% confidence)",
                                        job_filename,
                                        layer_str
                                    )
                                    if pause_ok:
                                        print(f"[🚨] {printer_name}: Print successfully auto-paused!", flush=True)
                                        tracker["auto_pause_triggered"] = True
                                        tracker["state"] = "paused"
                                        tracker["last_state"] = "paused"

                                if time_since_last_alert >= ALERT_COOLDOWN_SEC:
                                    print(f"[🚨] {printer_name}: Sending rate-limited Discord alert...", flush=True)
                                    pause_note = "\n• **Action:** Print Safely Auto-Paused" if AUTO_PAUSE_ON_FAILURE else ""
                                    send_discord_alert(
                                        title=f"🚨 Issue Detected: {clean_name}",
                                        description=(
                                            f"Potential failure detected (**{max_conf * 100:.0f}% confidence**).\n"
                                            f"• **Printer:** `{printer_name}` ({printer_model})\n"
                                            f"• **Layer:** `{layer_str}`"
                                            f"{pause_note}\n"
                                            f"Please inspect your print chamber!"
                                        ),
                                        color=0xFF0000,
                                        image_bytes=annotated_bytes,
                                        is_alert=True,
                                        printer_name=printer_name
                                    )
                                    tracker["last_alert_time"] = now_t
                                    tracker["auto_pause_alerted"] = True
                                else:
                                    print(f"[*] {printer_name}: Failure persists, alert throttled.", flush=True)
                    else:
                        # Frame is clean
                        _, clean_jpg = cv2.imencode('.jpg', img)
                        clean_bytes = clean_jpg.tobytes()
                        save_printer_snapshot(tracker, clean_bytes, is_failure=False, confidence=0.0, layer=layer_str)

                        tracker.update({
                            "state": "monitoring",
                            "confidence": 0.0,
                            "consecutive_failures": 0,
                            "inference_time_ms": inference_time_ms,
                            "last_check": datetime.utcnow().isoformat(),
                            "total_inspections": tracker.get("total_inspections", 0) + 1,
                        })

                        if tracker.get("was_in_failure_state") and SEND_RESOLVED_ALERT:
                            print(f"[✓] {printer_name}: Print cleared / failure resolved. Sending all-clear notice.", flush=True)
                            send_discord_alert(
                                title=f"✅ Chamber Clear: {clean_name}",
                                description=f"Camera frames for **{printer_name}** have returned to normal.",
                                color=0x00FF00,
                                printer_name=printer_name
                            )
                            tracker["was_in_failure_state"] = False

                        tracker["consecutive_failures"] = 0
                        print(f"[✓] {printer_name}: Frame clean ({inference_time_sec:.3f}s)", flush=True)

            # Update overall fleet status
            update_aggregate_state()

            if active_printing_count == 0:
                now_idle = time.time()
                if now_idle - last_idle_log_time >= 60:
                    with state_lock:
                        p_names = [t.get("name", "Printer") for t in printer_trackers.values()]
                    print(f"[💤] All {len(p_names)} printer(s) are IDLE ({', '.join(p_names)}). Cameras OFF. Polling...", flush=True)
                    last_idle_log_time = now_idle
                time.sleep(IDLE_POLL_INTERVAL_SEC)
            else:
                time.sleep(CHECK_INTERVAL_SEC)

        except Exception as err:
            print(f"[-] Loop error: {err}", flush=True)
            time.sleep(CHECK_INTERVAL_SEC)


if __name__ == "__main__":
    main()
