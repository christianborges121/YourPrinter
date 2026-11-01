# YourPrinter AI Failure Watchdog

Local AI failure and spaghetti detection engine for 3D printer fleets powered by **Darknet YOLO** and NVIDIA CUDA.

---

## Overview

The watchdog service continuously inspects live camera frames from your printers during active prints:
- **Zero Idle Load**: Only polls the camera stream while a print job is actively printing or paused.
- **Local GPU Inference**: Runs Darknet YOLO models locally inside the container via CUDA without sending camera feeds to external clouds.
- **Fleet Auto-Discovery**: Automatically synchronizes with the `yourprinter` backend (`/api/printers/overview`) to inspect all configured printers across your fleet.
- **Auto-Pause & Discord Alerts**: Sends rich snapshot cards with bounding boxes to Discord and automatically pauses the printer on verified consecutive defects.
- **REST API on Port 8085**: Exposes `/status`, `/config`, `/snapshots`, and `/snapshot/latest` for real-time control via the YourPrinter WebUI and mobile app.

---

## Configuration

In `docker-compose.yml`, the watchdog service runs side-by-side with `yourprinter` and `yourprinter-web`.

To configure Discord notifications or customize alert thresholds, create a `.env` file (or set variables in your root environment):

```bash
cp watchdog/.env.example .env
```

Key environment variables:
- `DISCORD_WEBHOOK`: Your Discord channel webhook URL.
- `CONFIDENCE_THRESHOLD`: Minimum detection confidence (default: `0.20`).
- `CONSECUTIVE_REQUIRED`: Number of consecutive defective frames before pausing (default: `2`).
- `CHECK_INTERVAL_SEC`: Sampling interval in seconds during active printing (default: `15`).
- `AUTO_PAUSE_ON_FAILURE`: Automatically pause printing upon defect verification (`true` / `false`).
