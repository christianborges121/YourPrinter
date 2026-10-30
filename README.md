<div align="center">

<img width="64" height="64" alt="YourPrinter Logo" src="shared/assets/logo/yourprinter-logo-unified.svg" />

# YourPrinter

**Unified Desktop, Headless Server, WebUI, and Mobile Suite for 3D Printer Fleet Management**

![Platforms](https://img.shields.io/badge/Platforms-Windows%20%7C%20macOS%20%7C%20Linux%20%7C%20Android%20%7C%20Web-00ae42?style=flat)
![License](https://img.shields.io/badge/License-MIT-blue?style=flat)

</div>

---

## Upstream Attribution & Credits

This repository unifies the desktop/headless server, WebUI client, and mobile application built upon the open-source work of:

- **[Parallel-7/FlashForgeUI-Electron](https://github.com/Parallel-7/FlashForgeUI-Electron)** by **GhostTypes** and contributors — Original desktop & WebUI architecture, multi-printer context engine, go2rtc streaming, Spoolman integration, Calibration Assistant, and `@parallel-7/slicer-meta` / `@ghosttypes/ff-api`.
- **[rolohaun/FlashForgeUI-Electron-Creator5](https://github.com/rolohaun/FlashForgeUI-Electron-Creator5)** by **rolohaun** — FlashForge Creator 5 compatibility fork (AD5X/IFS multi-extruder flow and modern HTTP API pairing).
- **YourPrinter Extensions** by **christianborges121** — Unified monorepo (`desktop/`, `web/`, `mobile/`, `shared/`), Bambu Lab A1 mini LAN-mode support (MQTT + FTPS + port 6000 camera + AMS Lite), Creator 5 Pro 4-head independent extruder support, AI/Obico stream watchdog integration, and native Flutter mobile app (`YourPrinter Mobile`).

All original license terms and copyright notices are strictly retained in [`LICENSE`](LICENSE), [`desktop/LICENSE`](desktop/LICENSE), [`web/LICENSE`](web/LICENSE), [`mobile/LICENSE`](mobile/LICENSE), and [`shared/LICENSE`](shared/LICENSE).

---

## Monorepo Architecture

```text
YourPrinter/
├── desktop/    # Electron desktop app, headless Express/WebSocket server, printer backends & vendor packages
├── web/        # Browser WebUI client (TypeScript, GridStack, Bambu-style dark theme, AMS/Multi-Head manager)
├── mobile/     # Native Flutter mobile app (Android/iOS) with live camera, fleet management & filament slot UI
├── shared/     # Shared API contracts (web-api.types.ts), printer/polling models, and official brand logos
├── CHANGELOG.md
└── LICENSE
```

---

## Supported Printers

| Printer | Support | Material Station / Extruders | Notes |
| --- | --- | --- | --- |
| **FlashForge Creator 5 / Creator 5 Pro** | Full | Yes (4 independent extruders / slots) | AD5X-compatible IFS & Multi-Head flow |
| **FlashForge AD5X** | Full | Yes (4 slots) | Multi-material 3MF printing |
| **Bambu Lab A1 mini** | Full | Yes (AMS Lite 4 slots) | LAN-Only + Developer Mode, MQTT + FTPS + Port 6000 camera |
| **FlashForge Adventurer 5M Pro** | Full | No | Includes filtration control |
| **FlashForge Adventurer 5M** | Full | No | Modern HTTP + TCP API |
| **FlashForge Adventurer 3 / 4** | Full | No | Legacy API |

---

## Quick Start

### 1. Desktop & Headless Server + WebUI (`desktop/` & `web/`)

```powershell
cd desktop
pnpm install
pnpm build
pnpm start
```

- To build only the WebUI bundle (`web/` -> `desktop/out/webui/static`):
  ```powershell
  cd desktop
  pnpm run build:webui
  ```

### 2. Mobile App (`mobile/`)

```powershell
cd mobile
flutter pub get
flutter test
flutter build apk --release
```

- Every push to `master` automatically increments the mobile app patch version by `0.0.1` (unless `[skip bump]` or `[version: X.Y.Z]` is included in the commit message) and publishes a single universal `YourPrinter-vX.Y.Z.apk` directly to [GitHub Releases](../../releases).

---

## License

This project is licensed under the [MIT License](LICENSE).

- Copyright &copy; 2025–2026 **GhostTypes** ([Parallel-7/FlashForgeUI-Electron](https://github.com/Parallel-7/FlashForgeUI-Electron))
- Copyright &copy; 2026 **rolohaun** ([rolohaun/FlashForgeUI-Electron-Creator5](https://github.com/rolohaun/FlashForgeUI-Electron-Creator5))
- Copyright &copy; 2026 **christianborges121**
