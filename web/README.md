# YourPrinter Web (Browser UI)

A modern, high-performance web frontend for **YourPrinter** matching the design system, animations, telemetry, and capabilities of the Flutter Mobile App (`mobile/`).

Built with **React 19 + TypeScript + Vite + Tailwind CSS + Lucide Icons**.

---

## 🎨 Design System & Color Tokens

Configured in `src/index.css` and `tailwind.config.js` to match `mobile/lib/core/constants/app_colors.dart` pixel-for-pixel:

```css
:root {
  --app-bg: #121212;
  --app-surface: #1E1E1E;
  --app-surface-secondary: #262626;
  --app-border: #2E2E2E;
  --app-border-subtle: #383838;
  --app-accent-green: #00AE42;
  --app-accent-green-dark: #009638;
  --app-text-primary: #F3F4F6;
  --app-text-secondary: #D1D5DB;
  --app-text-muted: #94A3B8;
  --app-warning: #F59E0B;
  --app-error: #EF4444;
  --app-info: #3B82F6;
  --app-toolhead-t0: #3B82F6;
  --app-toolhead-t1: #10B981;
  --app-bed-heat: #F97316;
  --app-chamber: #8B5CF6;
  --app-card-radius: 12px;
}
```

---

## 📱 Navigation Architecture

- **Mobile Viewport (`<= 768px`)**:
  - Fixed bottom navigation bar with icons matching Flutter:
    - `Fleet` (Lucide `Layers`)
    - `Device` (Lucide `Printer` / `LayoutGrid`)
    - `Files` (Lucide `Folder`)
    - `Settings` (Lucide `Settings`)
- **Desktop Viewport (`> 768px`)**:
  - Responsive top header bar with branded navigation tabs.
- **Top Header Bar**:
  - Official vector monogram SVG logo (`Logo.tsx`).
  - Active printer dropdown supporting 0-based indices (`/printers/0`, `/printers/1`) and `/api/contexts/switch`.
  - Persistent **AI Watchdog Guard** button/pill displaying live defect risk % and state color.
  - Server connection indicator (WebSockets + HTTP ping).

---

## 🧩 Core Dashboard Cards & Modals

1. **Live Camera Card (`CameraCard.tsx`)**:
   - 16:9 responsive video container with Go2rtc WebRTC + MJPEG/snapshot fallback.
   - Stream controls: 30s countdown timer badge with pulsing live dot, continuous streaming toggle, pause/resume, and fullscreen HUD button.
   - Watchdog status chip in card header (`AI Guard: Ready` / `Risk: 15%`).
2. **Job Progress Card (`JobProgressCard.tsx`)**:
   - Large bold percentage display (`49%`), animated progress bar.
   - Layer count (`45 / 320`), formatted ETA remaining, elapsed time, print job filename.
   - Control buttons: Pause / Resume, Cancel Print with confirmation dialog (`ConfirmModal.tsx`).
3. **Temperature Card (`TemperatureCard.tsx`)**:
   - Multi-extruder support (T0 Left, T1 Right or single nozzle), Bed, and Chamber temperatures.
   - Live heating indicators (pulsing amber/blue/green).
   - Click/tap opens `TempSetpointModal.tsx` with presets: Off (0°C), PLA, PETG, ABS.
4. **Hardware Controls Card (`ControlPanelCard.tsx`)**:
   - Chamber LED light toggle.
   - Filtration fan mode chips: `Off`, `Internal`, `External`.
   - Axes / Jog button opening `JogModal.tsx` (XY D-pad, Z-axis column, step size selector: 0.1mm, 1mm, 10mm, 50mm, Home All). Disabled during active prints.
5. **Multi-Material Spool Card (`AmsSpoolCard.tsx`)**:
   - 4-slot grid with filament color swatches, inner spool hubs, material type (PLA/PETG/ABS), remaining %, and active tray highlight.
   - Load and Unload buttons per slot.
   - Active Spoolman integration details (vendor, spool name, remaining weight).
6. **Complete AI Watchdog Monitoring (`WatchdogAlertBanner.tsx` & `WatchdogModal.tsx`)**:
   - Auto-Pause Defect Alert Banner (when `auto_pause_triggered == true`) with defect reason, "Inspect Snapshot", "Resume", and "Cancel".
   - Watchdog settings sheet/modal: sensitivity slider (5%-95%), auto-pause switch, interval selector, latest annotated snapshot view, and Darknet YOLO telemetry stats.
7. **Fleet Overview (`FleetScreen.tsx` & `FleetPrinterCard.tsx`)**:
   - Multi-printer farm overview grid with live status, job progress, temperatures, and live camera preview toggle.
8. **Files Screen (`FilesScreen.tsx`)**:
   - `Recent Prints` & `Local Storage` tabs with file size, estimated print time, layer height, and print trigger action.
9. **Settings Screen (`SettingsScreen.tsx`)**:
   - Configurable server base URL (`http://localhost:3080` in dev or relative `/` when hosted).
   - Real-time connection testing button.
   - Camera streaming preferences and auth token config.

---

## 🚀 Development & Build

### Running Dev Server
```bash
cd web
npm run dev
```
Starts the Vite dev server at `http://localhost:5173/`. By default, it proxies/connects to `http://localhost:3080` (or whichever URL is configured in the Settings screen or `localStorage`).

### Building for Production
```bash
cd web
npm run build
```
Compiles TypeScript and creates optimized production assets in `dist/`.
