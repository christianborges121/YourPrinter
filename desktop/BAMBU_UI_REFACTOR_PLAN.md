# Bambu Studio Device Tab Layout Refactor Plan

This document details the file-level design plan and step-by-step checklist to transform the **FlashForge WebUI** dashboard to match the layout and aesthetic of the **Bambu Studio "Device" Tab** (reference: user-provided screenshot).

---

## 1. Executive Summary & Design Goals

1. **Bambu Studio "Device" Tab Aesthetics**:
   - Replicate the layout from the Bambu Studio screenshot:
     - **Top Bar**: Minimal dark header with navigation tabs (`Device`, `Media/Files`, `Settings`), connection status indicator, and printer selector.
     - **Left Sidebar**: Device identifier (`> 3DP-00M-174`), connection banner, and vertical sub-navigation items (`Status`, `Media`, `Filament/Spoolman`, `System Info`).
     - **Main Area (Status Tab)**:
       - **Left Column**:
         1. **Camera Feed Card**: Stream canvas (`<video-rtc>`), top-right utility buttons (Lightbulb, Fullscreen), and bottom status bar (play icon + state text e.g., `Stopped.` / `Printing`).
         2. **Printing Progress Card**: Model thumbnail preview on the left; job name, state, layer, ETA, elapsed time, progress bar, and inline action buttons (Pause/Resume, Stop) on the right.
       - **Right Column**:
         1. **Machine Control Card**: Temperature indicators (Extruder, Bed, Chamber) with Set/Off controls, Lamp/Filtration controls, circular XY jog wheel with central Home button, Bed Z height controls (`↑ 10`, `↑ 1`, `↓ 1`, `↓ 10`), and Extruder controls.
         2. **Spoolman / Filament Card**: Positioned beneath Control card for quick filament overview and switching.
2. **Elimination of GridStack Drag-and-Drop Reorganize**:
   - As requested, eliminate the concept of dragging sections to reorganize them.
   - Replace the GridStack runtime and auto-resize observer with a deterministic, rock-solid **CSS Grid / Flexbox** layout.
   - Remove the edit-mode lock toggle button from the header and settings dialog.
   - Keep `WebUISettings` and theme customization intact.
3. **Responsive Mobile Experience**:
   - On desktop (`> 1024px`): Full 2-column + sidebar Bambu Studio layout.
   - On mobile/tablet (`<= 768px`): Sidebar collapses into an accessible slide-out drawer (via top-left hamburger menu); main stage stacks vertically (`Camera` -> `Progress` -> `Control` -> `Spoolman`).
4. **Zero Regression Guarantee**:
   - Maintain existing WebSocket protocol, API routes (`/api/printer/*`, `/api/jobs/*`), modal workflows (File selection, AD5X Material Matching, Spoolman), and element IDs used by status updates.

---

## 2. Layout Architecture Diagram

```
+--------------------------------------------------------------------------------------------------------------------+
|  [Logo] FlashForge Web UI  |  [Device (Active)]  |  [Media]  |   [Connected ●]  [Printer: Creator 5 ▾]  [⚙]  [Logout]   |
+--------------------------------------------------------------------------------------------------------------------+
| LEFT SIDEBAR (240px) | MAIN CONTENT STAGE (Status View)                                                           |
|                      |                                                                                            |
| [Status Banner]      | +-- LEFT COLUMN (~58%) -------------------+  +-- RIGHT COLUMN (~42%) --------------------+ |
| Connected / Error    | | CAMERA CARD                             |  | CONTROL CARD                              | |
|                      | | [Header: Camera         [Light] [⛶] ]   |  | [Header: Control   [Recent] [Local] [Home]]| |
| > 3DP-Creator-5Pro   | | +-------------------------------------+ |  | +-- Temps & Fans ---+ +-- Jog Wheel -----+ | |
|   (IP / WiFi Icon)   | | | <video-rtc> Stream Container        | |  | | ⯌ Extruder: 215°C   | |        ▲ Y+       | | |
|                      | | +-------------------------------------+ |  | | ⯌ Bed: 60°C        | |    ◄ X- [⌂] X+ ►  | | |
|   Status        >    | | [● Play]                     Stopped.   |  | | ⯌ Chamber: 35°C    | |        ▼ Y-       | | |
|   Media / Files >    | +-----------------------------------------+  | | ☼ Lamp  🌪 Filter  | | [10mm]  [1mm]     | | |
|   Spoolman      >    |                                           |  | +-----------------+ +-----------------+ | |
|   System Info   >    | | PRINTING PROGRESS CARD                  |  | +-- Z Bed Height --+ +-- Extruder -----+ | |
|                      | | [Header: Printing progress]             |  | | ↑ 10  ↑ 1  ↓ 1  ↓ 10| | ▲ Feed  ▼ Retract | | |
|                      | | +---------+ +-------------------------+ |  | +-----------------+ +-----------------+ | |
|                      | | | [Thumb] | | Current Job: benchy.3mf | |  +-------------------------------------------+ |
|                      | | | 110x110 | | State: Printing  Layer: | |                                                |
|                      | | | Preview | | [=================] 45% | |  +-- FILAMENT / SPOOLMAN CARD ---------------+ |
|                      | | |         | | [❚❚ Pause]   [◼ Stop]   | |  | Active Spool: PLA Matte Black (340g left) | |
|                      | | +---------+ +-------------------------+ |  | [Change Spool]                            | |
|                      | +-----------------------------------------+  +-------------------------------------------+ |
+--------------------------------------------------------------------------------------------------------------------+
```

---

## 3. File-by-File Master Checklist

### Phase 1: HTML Structure & Shell Modernization
- [x] **Target File: [`src/main/webui/static/index.html`](file:///s:/Projects/FlashForgeUI-Electron-Creator5/src/main/webui/static/index.html)**
  - [x] **1.1 Top Navigation Bar**:
    - Add Bambu-style navigation bar with `Device` tab (active) and `Media` tab.
    - Keep `#printer-selector`, `#connection-indicator`, `#connection-text`, `#settings-button`, `#logout-button`.
    - Remove `#edit-mode-toggle` button (drag/drop reorganization is retired).
  - [x] **1.2 Device Sidebar (`#device-sidebar`)**:
    - Add connection status alert banner (`#sidebar-connection-banner`).
    - Add printer device badge (`#device-badge`) showing printer model/serial and WiFi icon.
    - Add vertical navigation menu (`.sidebar-nav`):
      - `#nav-item-status` (`Status`, active by default, with right chevron).
      - `#nav-item-media` (`Media / Files`, opens file modal).
      - `#nav-item-spoolman` (`Filament / Spoolman`, reveals/scrolls to Spoolman card).
      - `#nav-item-info` (`System Info`, reveals lifetime stats modal or card).
  - [x] **1.3 Dashboard Container (`#device-dashboard`)**:
    - Replace `<div class="grid-stack webui-grid webui-grid-desktop">` with fixed Bambu dashboard grid:
      - Left column container: `#status-col-left` (hosts Camera card + Printing Progress card).
      - Right column container: `#status-col-right` (hosts Control card + Spoolman card).
    - Ensure all existing modal dialogs (`#settings-modal`, `#file-modal`, `#material-matching-modal`, `#spoolman-modal`, `#temp-dialog`, `#toast`) remain in place.
    - Ensure `#mobile-nav-drawer` markup remains for mobile viewports.

---

### Phase 2: Component Templates & Markup Refactor
- [x] **Target File: [`src/main/webui/static/grid/WebUIComponentRegistry.ts`](file:///s:/Projects/FlashForgeUI-Electron-Creator5/src/main/webui/static/grid/WebUIComponentRegistry.ts)**
  - [x] **2.1 Camera Component Template (`camera`)**:
    - Top header: "Camera", with top-right actions for Lamp toggle (`#btn-cam-light`) and Fullscreen toggle (`#btn-cam-fullscreen`).
    - Stream container: `#camera-container` with `#camera-placeholder` and `#camera-fps-overlay`.
    - Bottom status strip: `#camera-status-strip` featuring status indicator icon and status text (`#camera-status-text`).
  - [x] **2.2 Printing Progress Component Template (`job-progress`)**:
    - Merge model thumbnail preview and job details into a single Bambu-style "Printing progress" card:
      - Left column: `#model-preview` thumbnail image container.
      - Right details column:
        - Job name: `#current-job`.
        - Status and metrics row: `#printer-status`, `#layer-info`, `#elapsed-time`, `#time-remaining`, `#job-weight`, `#job-length`.
        - Progress bar container: `#progress-bar` and `#progress-percentage`.
        - Inline action buttons: Pause/Resume button (`#btn-cam-pause-resume`) and Stop/Cancel button (`#btn-cam-stop`).
  - [x] **2.3 Control Component Template (`controls`)**:
    - Redesign into Bambu Studio control panel:
      - Header: "Control" with `#btn-home-axes` and `#btn-clear-status`. Removed redundant "Recent Files" and "Local Files" buttons (accessible directly from navigation menu).
      - **Temperatures**: Extruder and Bed temp rows with Set/Off controls, Chamber temp row.
      - **Auxiliary**: Lamp toggle button (`#btn-control-lamp`), Filtration controls (`#btn-external-filtration`, `#btn-internal-filtration`, `#btn-no-filtration`), TVOC status.
  - [x] **2.4 Spoolman Tracker Template (`spoolman-tracker`)**:
    - Keep clean compact card format matching Bambu Studio filament display.
  - [x] **2.5 Printer State / System Info Template (`printer-state`)**:
    - Reformat as Bambu Studio "System Info" card featuring Lifetime Print Time (`#lifetime-print-time`) and Lifetime Filament (`#lifetime-filament`). Mounted in right column underneath Spoolman card.

---

### Phase 3: CSS Styling Transformation
- [x] **Target File: [`src/main/webui/static/webui.css`](file:///s:/Projects/FlashForgeUI-Electron-Creator5/src/main/webui/static/webui.css)**
  - [x] **3.1 Color Palette & Variables**:
    - Update default colors to mimic Bambu dark mode:
      - Background: `#181818` / `#1e1e1e`
      - Surface cards: `#232323` with subtle border `#333333`
      - Bambu Accent Green: `#00ae42` / `#10b981` (active tabs, active chevrons, progress bar)
      - Status text: `#e5e7eb`, muted text: `#9ca3af`
  - [x] **3.2 Bambu Layout Styles**:
    - Style `.device-dashboard` container with CSS Grid / Flexbox:
      - Sidebar: `width: 240px; min-width: 240px; border-right: 1px solid var(--border-color);`
      - Content stage: `flex: 1; padding: 16px; overflow-y: auto;`
      - Status two-column grid (`.status-columns`):
        - Left column (`.status-col-left`): `flex: 1.3; min-width: 0; display: flex; flex-direction: column; gap: 16px;`
        - Right column (`.status-col-right`): `flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 16px;`
  - [x] **3.3 Camera Card Styling**:
    - 16:9 responsive video wrapper.
    - Bottom status strip with green icon dot and typography matching Bambu Studio `Stopped.` / `Printing`.
  - [x] **3.4 Printing Progress Card Styling**:
    - Thumbnail box styling (square, border-radius 8px, dark inset background).
    - Big status typography + metadata chips.
    - Sleek progress bar with accent green fill.
    - Circular icon buttons for pause/resume and stop.
  - [x] **3.5 Control Card & Circular Jog Wheel Styling**:
    - Style circular XY jog wheel using CSS concentric circles / SVG paths with hover/active states.
    - Style vertical Bed Z and Extruder buttons with pill shapes.
    - Temperature status rows with icon badges and input buttons.
  - [x] **3.6 Responsive Media Queries (`<= 768px`)**:
    - Hide desktop sidebar on mobile; show mobile hamburger toggle.
    - Stack left and right columns into a single vertical column (`.status-columns { flex-direction: column; }`).
    - Mobile navigation drawer styling.

---

### Phase 4: Layout Manager & GridStack Deprecation
- [x] **Target File: [`src/main/webui/static/grid/WebUIGridManager.ts`](file:///s:/Projects/FlashForgeUI-Electron-Creator5/src/main/webui/static/grid/WebUIGridManager.ts)**
  - [x] **4.1 Simplify `WebUIGridManager`**:
    - Mount components into their designated Bambu columns (`#status-col-left` vs `#status-col-right`) without GridStack dragging library.
    - Preserve the class API (`initialize`, `clear`, `addComponent`, `removeComponent`, `hideComponent`, `showComponent`, `serialize`, `load`, `onChange`) so calling modules don't break.
    - Remove GridStack `ResizeObserver` and dragging event listeners.
- [x] **Target File: [`src/main/webui/static/features/layout-theme.ts`](file:///s:/Projects/FlashForgeUI-Electron-Creator5/src/main/webui/static/features/layout-theme.ts)**
  - [x] **4.2 Update Layout Initialization**:
    - Mount the 4 core Bambu cards:
      - Left column: `camera`, `job-progress` (which includes thumbnail and details).
      - Right column: `controls`, `spoolman-tracker`.
    - Update `isComponentSupported()` and `shouldComponentBeVisible()` to toggle card visibility cleanly.
    - Remove `editMode` toggling logic from `setupLayoutEventHandlers()` (leave settings modal functional for theme and profile configuration).

---

### Phase 5: Event Wiring, Subpage Navigation & Simplifications
- [x] **Target File: [`src/main/webui/static/ui/panels.ts`](file:///s:/Projects/FlashForgeUI-Electron-Creator5/src/main/webui/static/ui/panels.ts)**
  - [x] **5.1 Status & Progress Binding**:
    - Verify all DOM IDs (`#bed-temp`, `#extruder-temp`, `#chamber-temp`, `#current-job`, `#progress-percentage`, `#progress-bar`, `#layer-info`, `#elapsed-time`, `#time-remaining`, `#job-weight`, `#job-length`, `#model-preview`, `#camera-status-text`) update correctly on status changes.
    - Update `camera-status-text` to reflect `status.printerState` (e.g. `Stopped.`, `Printing`, `Paused`).
  - [x] **5.2 Button States**:
    - Update `updateButtonStates` to enable/disable camera actions, progress actions, and controls based on `printerState`.
- [x] **Target File: [`src/main/webui/static/features/job-control.ts`](file:///s:/Projects/FlashForgeUI-Electron-Creator5/src/main/webui/static/features/job-control.ts)**
  - [x] **5.3 Streamline Machine Controls**:
    - Removed unsupported controls: XY jog wheel, bed Z height buttons, extruder feed/retract/unload.
    - Preserved essential controls: Temperatures (Extruder, Bed, Chamber) with Set/Off dialogs, Home Axes (`#btn-home-axes`), Clear Status (`#btn-clear-status`), Chamber Lamp (`#btn-control-lamp`), and Filtration modes (Ext, Int, Off).
- [x] **Target File: [`src/main/webui/static/ui/views.ts`](file:///s:/Projects/FlashForgeUI-Electron-Creator5/src/main/webui/static/ui/views.ts) & [`src/main/webui/static/ui/dialogs.ts`](file:///s:/Projects/FlashForgeUI-Electron-Creator5/src/main/webui/static/ui/dialogs.ts)**
  - [x] **5.4 Media & Recent Files Subpage (Inline Subpage, Not a Modal)**:
    - Replaced file modal with `#bambu-media-view` inline subpage view.
    - Added Recent Files / Local Files tabs (`#subpage-tab-recent`, `#subpage-tab-local`).
    - Rendered file cards with print time, filament weight, multicolor badge, and material swatch chips.
    - Added selected file details pane with Auto Bed Leveling checkbox, Start Now checkbox, and "Print File" button.
    - Added "Back to Device" button (`#btn-media-back-status`) and wired navigation via `switchToStatusView()` / `switchToMediaView()`.
- [x] **Target File: [`src/main/webui/server/AuthManager.ts`](file:///s:/Projects/FlashForgeUI-Electron-Creator5/src/main/webui/server/AuthManager.ts) & [`src/main/webui/static/features/authentication.ts`](file:///s:/Projects/FlashForgeUI-Electron-Creator5/src/main/webui/static/features/authentication.ts)**
  - [x] **5.5 Remove Login Requirement**:
    - Set `isAuthenticationRequired(): boolean { return false; }` in `AuthManager.ts`.
    - Auto-authenticated frontend in `authentication.ts` with `authRequired = false, isAuthenticated = true`.
    - Removed `#login-screen` blocking overlay and hid logout buttons.
- [x] **Target File: [`src/main/webui/static/shared/icons.ts`](file:///s:/Projects/FlashForgeUI-Electron-Creator5/src/main/webui/static/shared/icons.ts)**
  - [x] **5.6 Hydrate Required Lucide Icons**:
    - Include: `home`, `video`, `thermometer`, `layers`, `clock`, `gauge`, `wind`, `sun`, `lightbulb`, `play`, `pause`, `square`, `arrow-up`, `arrow-down`, `arrow-left`, `arrow-right`, `chevron-right`, `settings`, `folder`, `info`, `maximize-2`, `wifi`, `scale`, `refresh-cw`, `file-code`.

---

### Phase 6: Build, TypeScript Check & Local Playwright Verification
- [x] **6.1 Type Check**:
  - Run TypeScript build check: `tsc --project src/main/webui/static/tsconfig.json --noEmit` (Passed with 0 errors).
  - Run root TypeScript check: `tsc --noEmit` (Passed with 0 errors).
- [x] **6.2 Asset Copy & Test**:
  - Built static assets using `npm run build:webui` to `out/webui/static/`.
- [x] **6.3 End-to-End Headless Browser Validation**:
  - Validated with Playwright test script (`scratch/test_local_bambu_ui.py`):
    - Login screen bypassed (False) & Main UI displayed (True).
    - Unsupported jog wheel, bed Z, extruder buttons removed (True).
    - Temperatures, Home Axes, Lamp controls preserved (True).
    - Media inline subpage navigation & file card selection verified (True).
    - Back to Device navigation verified (True).
    - Mobile single-column layout & hamburger drawer toggle verified (True).
- [ ] **6.4 Docker Build & Deploy on NAS**:
  - User runs: `docker compose build --no-cache && docker compose up -d` on NAS.
  - Validate in browser at `http://localhost:3080`.

---

## 4. Success Criteria

1. **Visual Accuracy**:
   - WebUI matches Bambu Studio Device tab layout: left device sidebar, left-side camera + progress cards, right-side machine control card + filament card.
2. **Simplified Machine Control**:
   - Clean temperature and auxiliary control card without non-functional jog wheels or extruder feed buttons.
3. **Inline Media Subpage**:
   - Recent files and local files browse seamlessly in an inline subpage instead of popup modals.
4. **Frictionless Access**:
   - No login prompts or password barriers.
5. **No Drag Glitches**:
   - Zero GridStack errors, zero unexpected widget shifting, zero scrollbars inside fixed panels.
6. **Mobile Usability**:
   - Mobile users get a streamlined single-column stacked layout with slide-out sidebar drawer.
