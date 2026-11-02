# YourPrinter WebUI & Mobile Device Page Layout Improvement Plan

> **Purpose**: Actionable, step-by-step implementation guide designed so any model (including lower-tier/smaller models) can execute each task deterministically without ambiguity.
> **Target Repository**: `S:\Projects\YourPrinter` (`web/` React 19 + Tailwind CSS frontend, and `mobile/` Flutter app for Dual-Frontend Parity).
> **Reference Live URL**: `http://nas:3080/printers/0` (Device Detail View).

---

## Core User Requirements & Initial Goals
1. **Compact Temperatures Card**: The Temperatures card currently consumes too much vertical/grid space. Redesign it to be compact, scannable, and touch-friendly across desktop and mobile viewports.
2. **Eliminate Duplicated Speed Display/Control**: Speed is currently shown/duplicated in multiple places on the device view. Consolidate speed telemetry and speed rate control into a single authoritative location.
3. **Simplify Chamber Lighting Control**: Replace the bulky Chamber Lighting card/section with a single compact icon toggle button (Lightbulb ON / Lightbulb OFF) placed in the header or top quick-action bar.
4. **Additional Layout & UX Proposals (Desktop WebUI, Mobile Web Viewport, and Flutter Mobile App)**: Inspect live UI at `http://nas:3080/printers/0` and source code in `web/src/` and `mobile/lib/` to propose and specify concrete layout improvements.
5. **Dual-Frontend Parity & Mobile-First Ergonomics**: Maintain feature and layout hierarchy parity between `web/` (both desktop grid and mobile responsive view) and `mobile/` (Flutter app), working on a dedicated `feature/webui-layout-improvements` branch per `AGENTS.md`.

---
## Audit of Current WebUI Implementation (`web/src/`)

### 1. Why the Temperatures Card (`TemperatureCard.tsx`) Takes Up Too Much Space
- Currently rendered in the right column (`lg:col-span-5`) of `DashboardScreen.tsx` as a vertical stack of large full-width cards (`p-2.5` each with `w-9 h-9` icon box, two lines of left text: title + `Target: X°C`, and two lines of right text: current temp + `Heating / Ready` or `Off`).
- On a dual-extruder enclosed printer like the **Creator 5 Pro** (`/printers/0`), `TemperatureCard.tsx` renders **4 full-width stacked rows**:
  1. `Heated Bed`
  2. `Extruder (T0 Left)`
  3. `Extruder (T1 Right)`
  4. `Chamber Heater`
- Furthermore, **Chamber Temperature is duplicated** inside `ControlPanelCard.tsx` header (lines 102–110: `Chamber: X°C / Y°C` purple pill)!
- Plus, the header of `TemperatureCard.tsx` has a bulky subtitle `"Click any row to adjust"` and each row repeats `"Target: X°C"` and `"Off"` / `"Heating / Hot"`, creating ~340px of vertical height for just 3–4 numbers.

### 2. Where Speed & Other Telemetry Are Duplicated
- **Print Speed Duplication**:
  1. `JobProgressCard.tsx` (lines 158–188): Renders a `"Speed"` bar with 3 buttons (`50% Quiet`, `100% Standard`, `140% Sport`) whenever `isJobActive` is true.
  2. `ControlPanelCard.tsx` (lines 194–232): Renders a large `"Print Speed Rate"` card section (`p-3`) with a header, percentage readout (`100% (Standard)`), and a 3-column grid of large two-line buttons (`Quiet / 50% Speed`, `Standard / 100% Speed`, `Sport / 140% Speed`).
- **Chamber Temperature Duplication**:
  1. `TemperatureCard.tsx` (lines 200–238): Full row for `Chamber Heater` with current & target temperature.
  2. `ControlPanelCard.tsx` (lines 102–110): Purple badge `Chamber: X°C / Y°C` in the `Hardware Controls` card header.
- **AI Watchdog Status Duplication**:
  1. `Header.tsx` (lines 199–229): Top navbar persistent pill (`AI Guard | 0%`).
  2. `CameraCard.tsx` (lines 275–287): Camera card header pill (`AI Guard: 0%` / `AI Guard: Idle`).

### 3. Why Chamber Lighting (`ControlPanelCard.tsx`) Is Too Bulky
- In `ControlPanelCard.tsx` (lines 277–305), Chamber Lighting takes up an entire full-width boxed row (`p-3 rounded-lg bg-[#262626]/60 border border-[#2E2E2E]`) with:
  - A `Lightbulb` icon
  - Two lines of text (`Chamber Lighting` and `LEDs Active` / `LEDs Disabled`)
  - A sliding toggle switch (`w-11 h-6 rounded-full`)
- Simplifying this to a **single icon button** (Lightbulb ON = illuminated amber/yellow `#F59E0B` glow with filled/bright bulb; Lightbulb OFF = muted `#94A3B8` dim bulb) in the **Camera Card header** (right where you visually see the chamber lighting effect!) and/or the **Control Panel header / quick action bar** removes an entire 62px row from `ControlPanelCard.tsx`.

---
## Visual Audit of Live `http://nas:3080/printers/0` (Creator 5 Pro)

Inspecting the live rendered page at `http://nas:3080/printers/0` on both Desktop (`1440x1000`) and Mobile (`390x844`) revealed the following critical layout and telemetry bugs:

1. **6-Row Vertical Stack + Toolhead Naming Bug in `TemperatureCard`**:
   - Live status on `/printers/0` returns 4 toolhead temperatures: `toolTemps: [25, 27, 43, 27]`.
   - `TemperatureCard.tsx` (lines 153–157) and `temperature_card.dart` (line 103) use `idx === 0 ? 'Extruder (T0 Left)' : 'Extruder (T1 Right)'`. As a result, tools 1, 2, and 3 all render with the identical wrong label **`Extruder (T1 Right)`** three times in a row!
   - Because `Heated Bed` + `T0` + `T1` + `T2` + `T3` + `Chamber Heater` are rendered as 6 full-width tall cards (`p-2.5` with `36x36` icon boxes and 2-line labels), `TemperatureCard` consumes **~520px of vertical height**—pushing `Hardware Controls` completely below the fold on desktop and requiring excessive scrolling on mobile.
2. **React `0` Rendering Bug & Duplicate Chamber Temp in `ControlPanelCard.tsx`**:
   - In `ControlPanelCard.tsx` (lines 102–110), the header renders a duplicate purple pill: `Chamber: 24°C 0`.
   - Why is there a trailing `0`? Line 106 uses `{status.chamberTargetTemperature && status.chamberTargetTemperature > 0 && (...)}`. When `chamberTargetTemperature` is `0`, JavaScript evaluates `0 && ...` to `0`, which React renders as text `0`!
   - Since Chamber Heater is already a primary tile in `TemperatureCard`, this badge in `ControlPanelCard` is both redundant and buggy.
3. **Duplicated Speed Controls (`JobProgressCard` + `ControlPanelCard`)**:
   - Print Speed presets (`50% Quiet`, `100% Standard`, `140% Sport`) are rendered in both `JobProgressCard` (when printing) and `ControlPanelCard` (always).
   - In `ControlPanelCard.tsx`, the 3 speed buttons use a tall 2-line layout (`Quiet` / `50% Speed`), taking ~96px of vertical height.
4. **Over-Engineered Chamber Lighting Row (`ControlPanelCard`)**:
   - At the bottom of `ControlPanelCard.tsx` (lines 277–305), `Chamber Lighting` is a full-width card (`62px` tall) with an icon, title (`Chamber Lighting`), subtitle (`LEDs Active` / `LEDs Disabled`), and toggle switch.
   - Replacing this with a **single Lightbulb icon button** (amber glowing bulb when ON, muted/off bulb when OFF) in the header bar eliminates the entire row while keeping 1-tap access.
5. **Additional Proposals from Live Inspection of `http://nas:3080/printers/0`**:
   - **Proposal A — Hide Unsupported LAN Jog/Home Buttons When Both Are Disabled**: On Creator 5 Pro (`!canJog && !canHome`), `ControlPanelCard.tsx` renders two permanently disabled buttons (`Jog (No LAN)` and `Home (No LAN)`), wasting 46px of height. Hide the row when `!canJog && !canHome` (or collapse to a subtle tooltip icon in the card header).
   - **Proposal B — Consolidate `CameraCard` Footer into Header / Overlay Controls**: `CameraCard.tsx` currently has both a 45px top header bar AND a 46px bottom footer bar (`Pause`, `Reconnect`, `Continuous`). Move `Play/Pause`, `Continuous (∞)`, `Reconnect`, and the new **Chamber Lightbulb icon button** into a unified, compact header/overlay bar (matching `camera_panel.dart` on mobile which has no bottom footer).
   - **Proposal C — Remove Redundant `AI Guard` Pill from `CameraCard` Header on Mobile/Web**: `Header.tsx` (sticky top bar) already shows the live `AI Guard 0%` pill. Showing an identical `AI Guard: 0%` pill 28px below it inside `CameraCard` header clutters narrow mobile screens. Only show the `CameraCard` badge when a defect alert is actively triggered (`isAlert`), or keep itsolely in the sticky top `Header`.
   - **Proposal D — Fix Completed Job Metadata & Add "Dismiss" Button in `JobProgressCard.tsx`**:
     - On `/printers/0`, the job is `100% Completed`, yet `Time Left` still says `00:18`! When `isCompleted` is true, `Time Left` must show `Done` (or `0m 0s`).
     - Subtitle says `Creator 5 Pro (Creator 5 Pro)` because `name === model`. Deduplicate when `name.toLowerCase() === model.toLowerCase()`.
     - Add a `Dismiss` / `Clear` action when `isCompleted` (matching Mobile's `job_progress_card.dart`) or compact the completed state.
   - **Proposal E — Single-Line Segmented Controls for Filtration & Fan Presets**:
     - In `ControlPanelCard.tsx`, change `Air Filtration Fan` from tall 2-line cards (`Off / Inactive`, `Internal / VOC Scrub`, `External / Exhaust`) to a compact single-line 3-way segmented control (`Off` | `Internal` | `External`), saving 35px.
     - Tighten `Part Cooling Fan` layout by placing the slider and preset pills (`Off`, `25%`, `50%`, `75%`, `100%`) in a tighter container (`p-2.5 gap-2`).
   - **Proposal F — Mobile Web Viewport Card Order & Bottom Safe Padding**:
     - In `DashboardScreen.tsx`, reorder mobile stack (`< lg`) so `TemperatureCard` appears immediately after `JobProgressCard` (matching Flutter Mobile `dashboard_screen.dart`: `Camera` → `Job Progress` → `Temperatures` → `Toolheads/Spool` → `Hardware Controls`), while preserving the 2-column desktop layout (`lg:grid-cols-12`).
     - Increase bottom padding on mobile web (`pb-20 md:pb-8`) so the fixed `BottomNav` (`h-14`) never overlaps cards while scrolling.
   - **Proposal G — Display Live Toolhead Temp Badges in `AmsSpoolCard.tsx` Multi-Head View**:
     - Flutter Mobile (`ams_spool_card.dart` lines 523–536) already shows each toolhead's live temperature (`🌡️ 25°C`) inside each `Head 1..4` card. Bring this exact badge to WebUI `AmsSpoolCard.tsx` so multi-head tool cards show both loaded filament and live nozzle temperature at a glance!

---
## Step-by-Step Execution Guide (Written for Deterministic Execution by Any Model)

> **CRITICAL RULES FOR EXECUTING MODEL**:
> 1. Work inside `S:\Projects\YourPrinter`.
> 2. Create and use feature branch `feature/webui-layout-improvements` (NEVER commit directly to `master` until all steps and tests pass).
> 3. Maintain **Dual-Frontend Parity** (`web/` + `mobile/`). Do not stop after editing only `web/`.
> 4. Never hardcode private LAN IPs (`192.168.*`, `100.*`, `10.*`) in any code, tests, or commit messages.

---

### Step 0: Create Feature Branch
Run in `S:\Projects\YourPrinter`:
```powershell
cd "S:\Projects\YourPrinter"
git checkout -b feature/webui-layout-improvements
```

---

### Step 1: Compact `TemperatureCard` into a 2-Column Responsive Tile Grid & Fix Multi-Tool Labels (WebUI + Mobile)

#### 1A. WebUI: `S:\Projects\YourPrinter\web\src\components\dashboard\TemperatureCard.tsx`
**What to change**:
1. Fix the toolhead label & color logic for 2-tool and 4-tool printers (`T0`, `T1`, `T2`, `T3`):
   - Instead of `idx === 0 ? 'Extruder (T0 Left)' : 'Extruder (T1 Right)'` (which wrongly labels T2 and T3 as `T1 Right`), use:
     - If `!hasMultipleTools`: `'Nozzle'`
     - If `toolTemps.length === 2`: `idx === 0 ? 'T0 Left' : 'T1 Right'`
     - If `toolTemps.length > 2`: `` `Extruder T${idx}` `` (or `T0`, `T1`, `T2`, `T3`)
   - Use distinct accent colors per tool index: `['#3B82F6', '#10B981', '#F59E0B', '#EC4899'][idx % 4]`.
2. Replace the tall vertical stack of full-width rows (`flex flex-col gap-3` where each row is 72px tall) with a **compact 2-column grid** (`grid grid-cols-2 gap-2`):
   - Card container padding reduced from `p-5 gap-3` to `p-3.5 gap-2.5`.
   - Each heater item (`Heated Bed`, `Chamber`, and `T0..Tn`) is a compact button tile (`p-2 rounded-lg bg-[#262626]/60 hover:bg-[#262626] border border-[#2E2E2E] flex items-center justify-between gap-2`):
     - Left side: small `w-7 h-7 rounded-md` icon badge + heater name (`text-xs font-semibold text-[#F3F4F6] truncate`).
     - Right side: single-line current/target readout (`text-sm font-bold text-[#F3F4F6]` for `${Math.round(current)}°C` and `text-[11px] font-normal text-[#94A3B8]` for `/ ${target}°C`), plus a pulsing dot when actively heating (`target > 0 && current < target - 2`).
   - If the total number of tiles is odd (e.g., single-extruder printer without chamber = 2 tiles; single-extruder with chamber = 3 tiles; 4-tool printer with bed + chamber = 6 tiles), all 6 tiles on Creator 5 Pro fit in a **3x2 grid (~145px total card height instead of 520px!)**.

**Exact Replacement Code for `TemperatureCard.tsx` (lines 99–239)**:
```tsx
  const TOOL_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EC4899'];

  const getToolLabel = (idx: number, total: number) => {
    if (total <= 1) return 'Nozzle';
    if (total === 2) return idx === 0 ? 'T0 Left' : 'T1 Right';
    return `Tool T${idx}`;
  };

  return (
    <div className="bg-[#1E1E1E] border border-[#2E2E2E] rounded-xl p-3.5 shadow-sm flex flex-col gap-2.5">
      {/* Compact Card Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Thermometer size={15} className="text-[#F97316]" />
          <span className="text-xs font-semibold uppercase tracking-wider text-[#94A3B8]">Temperatures</span>
        </div>
        <span className="text-[10px] text-[#64748B]">Tap to set</span>
      </div>

      {/* Compact 2-Column Tile Grid */}
      <div className="grid grid-cols-2 gap-2">
        {/* Heated Bed Tile */}
        {(capabilities?.hasBedHeater ?? true) && (
          <button
            onClick={openBedModal}
            className="flex items-center justify-between p-2 rounded-lg bg-[#262626]/60 hover:bg-[#262626] border border-[#2E2E2E] hover:border-[#F97316]/40 transition-all text-left group"
          >
            <div className="flex items-center gap-2 min-w-0">
              <div
                className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${
                  status.bedTargetTemperature > 0
                    ? 'bg-[#F97316]/20 text-[#F97316]'
                    : 'bg-[#1E1E1E] text-[#94A3B8]'
                }`}
              >
                <Layers size={14} />
              </div>
              <span className="text-xs font-semibold text-[#F3F4F6] group-hover:text-[#F97316] transition-colors truncate">
                Bed
              </span>
            </div>

            <div className="flex items-baseline gap-0.5 shrink-0 ml-1">
              {status.bedTargetTemperature > 0 && status.bedTemperature < status.bedTargetTemperature - 2 && (
                <span className="w-1.5 h-1.5 rounded-full bg-[#F97316] animate-pulse mr-1 self-center" />
              )}
              <span className="text-sm font-bold text-[#F3F4F6]">{Math.round(status.bedTemperature)}°</span>
              <span className="text-[11px] text-[#94A3B8]">/{status.bedTargetTemperature}°</span>
            </div>
          </button>
        )}

        {/* Chamber Heater Tile (if supported) */}
        {hasChamberHeater && (
          <button
            onClick={openChamberModal}
            className="flex items-center justify-between p-2 rounded-lg bg-[#262626]/60 hover:bg-[#262626] border border-[#2E2E2E] hover:border-[#8B5CF6]/40 transition-all text-left group"
          >
            <div className="flex items-center gap-2 min-w-0">
              <div
                className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${
                  (status.chamberTargetTemperature || 0) > 0
                    ? 'bg-[#8B5CF6]/20 text-[#8B5CF6]'
                    : 'bg-[#1E1E1E] text-[#94A3B8]'
                }`}
              >
                <Box size={14} />
              </div>
              <span className="text-xs font-semibold text-[#F3F4F6] group-hover:text-[#8B5CF6] transition-colors truncate">
                Chamber
              </span>
            </div>

            <div className="flex items-baseline gap-0.5 shrink-0 ml-1">
              {(status.chamberTargetTemperature || 0) > 0 &&
                (status.chamberTemperature || 0) < (status.chamberTargetTemperature || 0) - 2 && (
                  <span className="w-1.5 h-1.5 rounded-full bg-[#8B5CF6] animate-pulse mr-1 self-center" />
                )}
              <span className="text-sm font-bold text-[#F3F4F6]">{Math.round(status.chamberTemperature || 0)}°</span>
              <span className="text-[11px] text-[#94A3B8]">/{status.chamberTargetTemperature || 0}°</span>
            </div>
          </button>
        )}

        {/* Extruder Tiles (T0..Tn) */}
        {toolTemps.map((temp, idx) => {
          const target = idx < toolTargets.length ? toolTargets[idx] : 0;
          const accentColor = TOOL_COLORS[idx % TOOL_COLORS.length];
          const label = getToolLabel(idx, toolTemps.length);

          return (
            <button
              key={idx}
              onClick={() => openExtruderModal(idx)}
              className="flex items-center justify-between p-2 rounded-lg bg-[#262626]/60 hover:bg-[#262626] border border-[#2E2E2E] hover:border-[#383838] transition-all text-left group"
            >
              <div className="flex items-center gap-2 min-w-0">
                <div
                  className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
                  style={{
                    backgroundColor: target > 0 ? `${accentColor}25` : '#1E1E1E',
                    color: target > 0 ? accentColor : '#94A3B8',
                  }}
                >
                  <Flame size={14} />
                </div>
                <span className="text-xs font-semibold text-[#F3F4F6] truncate">{label}</span>
              </div>

              <div className="flex items-baseline gap-0.5 shrink-0 ml-1">
                {target > 0 && temp < target - 2 && (
                  <span
                    className="w-1.5 h-1.5 rounded-full animate-pulse mr-1 self-center"
                    style={{ backgroundColor: accentColor }}
                  />
                )}
                <span className="text-sm font-bold text-[#F3F4F6]">{Math.round(temp)}°</span>
                <span className="text-[11px] text-[#94A3B8]">/{target}°</span>
              </div>
            </button>
          );
        })}
      </div>
```

#### 1B. Mobile: `S:\Projects\YourPrinter\mobile\lib\ui\dashboard\temperature_card.dart`
**What to change**:
1. Fix the multi-tool label bug on line 103 (`label: i == 0 ? 'Extruder (T0 Left)' : 'Extruder (T1 Right)'`):
   - When `status.toolTemps.length == 2`: `i == 0 ? 'T0 Left' : 'T1 Right'`
   - When `status.toolTemps.length > 2`: `'Tool T$i'`
   - When single tool: `'Extruder'`
2. Render the temperature items in a compact 2-column grid (using `Wrap` or 2-column `Row` pairs with `8px` spacing) instead of full-width stacked rows with `Divider(height: 16)`.
3. **IMPORTANT TEST INVARIANT**: Preserve `Key('temp_row_chamber')`, text `'Chamber'`, text `'${currentTemp.toStringAsFixed(0)}\u00B0C'`, and text `' / ${targetTemp.toStringAsFixed(0)}\u00B0C'` inside `_buildTempTile` so all existing tests in `mobile/test/widgets_test.dart` and `mobile/test/chamber_stress_test.dart` pass without modification!

---

### Step 2: Simplify Chamber Lighting to a Single Lightbulb Icon (WebUI + Mobile)

#### 2A. WebUI: Move Lightbulb Toggle to `ControlPanelCard.tsx` Header & `CameraCard.tsx` Header, Remove Bottom Row
1. In `S:\Projects\YourPrinter\web\src\components\dashboard\ControlPanelCard.tsx`:
   - **Delete lines 101–110** (the duplicate `Chamber: 24°C 0` badge in the Hardware Controls header).
   - **Delete lines 276–305** (the bulky 62px `Chamber Lighting` bottom row with `LEDs Active` text and toggle switch).
   - In the `ControlPanelCard` header (right side of `<div className="flex items-center justify-between pb-2 border-b border-[#2E2E2E]">`), place the single **Lightbulb icon toggle button** when `hasLedControl` is true:
     ```tsx
     {hasLedControl && (
       <button
         onClick={handleToggleLed}
         aria-label={ledState ? 'Turn Chamber Light Off' : 'Turn Chamber Light On'}
         title={ledState ? 'Chamber Light: ON (Click to turn off)' : 'Chamber Light: OFF (Click to turn on)'}
         className={`p-1.5 rounded-lg border transition-all ${
           ledState
             ? 'bg-[#F59E0B]/20 border-[#F59E0B]/50 text-[#F59E0B] shadow-[0_0_8px_rgba(245,158,11,0.25)]'
             : 'bg-[#262626] border-[#2E2E2E] text-[#64748B] hover:text-[#94A3B8]'
         }`}
       >
         {ledState ? <Lightbulb size={15} /> : <LightbulbOff size={15} />}
       </button>
     )}
     ```
     *(Import `LightbulbOff` from `lucide-react` alongside `Lightbulb`.)*
2. In `S:\Projects\YourPrinter\web\src\components\dashboard\CameraCard.tsx`:
   - Also expose the same single Lightbulb icon button in the `CameraCard` header bar (right next to the Snapshot `Camera` icon and `Maximize2` HUD icon) so users watching the camera feed can toggle the chamber light on/off with 1 tap while viewing the video!
   - Read `status?.ledState`, `features`, `capabilities`, `activeContext`, and `setLed` from `usePrinter()`.

#### 2B. Mobile: `S:\Projects\YourPrinter\mobile\lib\ui\controls\control_panel_card.dart` & `camera_panel.dart`
1. In `control_panel_card.dart`:
   - Replace the full-width `OutlinedButton.icon` (`LED: On` / `LED: Off` at lines 504–519) with a compact single `IconButton` in the `Hardware Controls` card header row (right-aligned via `const Spacer()`):
     - Icon: `_ledOn ? LucideIcons.lightbulb : LucideIcons.lightbulbOff`
     - Color: `_ledOn ? AppColors.warning : AppColors.textMuted`
     - Background container: subtle amber highlight when `_ledOn` is true (`AppColors.warningSubtle`), bordered by `AppColors.warning` when on or `AppColors.border` when off.
2. In `camera_panel.dart`:
   - Add the same compact Lightbulb `IconButton` in the `Camera Feed` header row right next to the Fullscreen `Maximize2` button so mobile users can toggle the chamber light directly from the camera card!

---

### Step 3: Eliminate Duplicated Speed Controls (WebUI + Mobile + Tests)

#### 3A. WebUI: Remove Speed Bar from `JobProgressCard.tsx` & Compact `ControlPanelCard.tsx` Speed Section
1. In `S:\Projects\YourPrinter\web\src\components\dashboard\JobProgressCard.tsx`:
   - **Delete lines 157–188** (`{/* Speed Rate Quick Bar (Active Print) */}` and its entire block).
   - Remove unused `setPrintSpeed` destructuring on line 8 and unused `Gauge` icon import on line 2.
2. In `S:\Projects\YourPrinter\web\src\components\dashboard\ControlPanelCard.tsx`:
   - Compact the `Print Speed Rate` section (lines 194–232) from tall two-line cards into a sleek single-line 3-pill segmented row (`p-2.5 gap-2`):
     ```tsx
     {/* Print Speed Rate Control */}
     {(capabilities?.canAdjustSpeed ?? true) && (
       <div className="flex flex-col gap-2 p-2.5 rounded-lg bg-[#262626]/60 border border-[#2E2E2E]">
         <div className="flex items-center justify-between">
           <span className="text-xs font-semibold text-[#F3F4F6] flex items-center gap-1.5">
             <Gauge size={14} className="text-[#F59E0B]" />
             Print Speed Rate
           </span>
           <span className="text-[11px] font-mono font-bold text-[#F59E0B]">
             {currentSpeed}% ({currentSpeed <= 70 ? 'Quiet' : currentSpeed <= 120 ? 'Standard' : 'Sport'})
           </span>
         </div>

         <div className="grid grid-cols-3 gap-1.5">
           {[
             { percent: 50, label: 'Quiet', desc: '50%' },
             { percent: 100, label: 'Standard', desc: '100%' },
             { percent: 140, label: 'Sport', desc: '140%' },
           ].map(({ percent, label, desc }) => {
             const isSelected = Math.abs(currentSpeed - percent) < 10;
             return (
               <button
                 key={percent}
                 onClick={() => handleSpeedChange(percent)}
                 className={`flex items-center justify-center gap-1 py-1.5 px-2 rounded-md border text-xs font-semibold transition-all ${
                   isSelected
                     ? 'bg-[#F59E0B]/20 border-[#F59E0B] text-[#F59E0B] shadow-sm'
                     : 'bg-[#1E1E1E] border-[#2E2E2E] text-[#D1D5DB] hover:text-[#F3F4F6] hover:border-[#383838]'
                 }`}
               >
                 <span>{label}</span>
                 <span className="text-[10px] opacity-75">{desc}</span>
               </button>
             );
           })}
         </div>
       </div>
     )}
     ```

#### 3B. Mobile: Remove Speed Bar from `job_progress_card.dart`, Compact `control_panel_card.dart`, and Update `widgets_test.dart`
1. In `S:\Projects\YourPrinter\mobile\lib\ui\dashboard\job_progress_card.dart`:
   - **Delete lines 202–256** (`// Speed Rate Quick Bar (Active Print)` block with `Key('job_speed_quick_bar')`).
2. In `S:\Projects\YourPrinter\mobile\lib\ui\controls\control_panel_card.dart`:
   - In `_buildSpeedPresetButton` (lines 79–125), change the inner `Column` (2 lines) to a compact single-line `Row` (`mainAxisAlignment: MainAxisAlignment.center`, `padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 4)`) while **preserving** `Key('speed_preset_$percent')` and `Text(label)` (`'Quiet'`, `'Standard'`, `'Sport'`) so all `ControlPanelCard` tests in `mobile/test/widgets_test.dart` continue to pass!
3. In `S:\Projects\YourPrinter\mobile\test\widgets_test.dart`:
   - Update lines 307–310 in `'JobProgressCard renders active print progress and metrics'`:
     - Replace:
       ```dart
       expect(find.byKey(const Key('job_speed_quick_bar')), findsOneWidget);
       expect(find.byKey(const Key('job_speed_preset_50')), findsOneWidget);
       expect(find.byKey(const Key('job_speed_preset_100')), findsOneWidget);
       expect(find.byKey(const Key('job_speed_preset_140')), findsOneWidget);
       ```
       with:
       ```dart
       expect(find.byKey(const Key('job_speed_quick_bar')), findsNothing);
       ```
   - Update test at lines 314–350 (`'JobProgressCard tapping speed preset dispatches setPrintSpeed'` -> rename to `'JobProgressCard renders filament estimate without duplicate speed bar'` and assert `expect(find.text('2.5m (8g)'), findsOneWidget);` and `expect(find.byKey(const Key('job_speed_quick_bar')), findsNothing);`).

---

### Step 4: Additional High-Impact Layout Improvements (WebUI + Mobile)

#### 4A. Hide Unsupported Jog/Home Row & Compact Filtration/Fan Controls in `ControlPanelCard.tsx`
1. In `S:\Projects\YourPrinter\web\src\components\dashboard\ControlPanelCard.tsx`:
   - Wrap the `Axes / Jog` & `Home All` grid (lines 114–136) in `{(canJog || canHome) && ( ... )}` so printers without network jog/home (like Creator 5 Pro) do not waste 46px on permanently disabled `Jog (No LAN)` / `Home (No LAN)` buttons.
   - Compact `Air Filtration Fan` (lines 235–274): change the 3 two-line buttons (`Off / Inactive`, `Internal / VOC Scrub`, `External / Exhaust`) to single-line segmented buttons (`py-1.5 px-2 text-xs font-semibold`), reducing height by ~30px.
   - Tighten card outer padding from `p-5 gap-4` to `p-3.5 gap-3`.

#### 4B. Consolidate `CameraCard.tsx` Footer into Header/Overlay & Remove Redundant Watchdog Pill
1. In `S:\Projects\YourPrinter\web\src\components\dashboard\CameraCard.tsx`:
   - Remove the duplicate `AI Guard: 0%` pill from the `CameraCard` header when `!isAlert` (since `Header.tsx` directly above already displays `AI Guard 0%` at all times; only show the red pulsing alert chip in `CameraCard` if `isAlert` is true).
   - Move the `Play/Pause`, `Reconnect`, and `Continuous (∞)` buttons into the `CameraCard` header bar (as compact icon/pill buttons alongside the new **Chamber Lightbulb toggle**, `Snapshot`, and `Fullscreen HUD`), and **delete the bottom Camera Controls Footer** (lines 436–490), saving 46px of vertical height!

#### 4C. Fix `JobProgressCard.tsx` Completed State & Subtitle Deduplication
1. In `S:\Projects\YourPrinter\web\src\components\dashboard\JobProgressCard.tsx`:
   - Deduplicate printer subtitle (lines 80–82): if `activeContext.name.toLowerCase() === activeContext.model.toLowerCase()`, render `activeContext.name` instead of `Creator 5 Pro (Creator 5 Pro)`.
   - Fix `Time Left` when completed (line 135):
     ```tsx
     {isCompleted ? 'Done' : (status.formattedEta || formatTime(status.timeRemaining))}
     ```
   - Reduce card padding from `p-5 gap-4` to `p-3.5 gap-3`.

#### 4D. Add Live Toolhead Temperature Badge to `AmsSpoolCard.tsx` & Fix Mobile Ordering in `DashboardScreen.tsx`
1. In `S:\Projects\YourPrinter\web\src\components\dashboard\AmsSpoolCard.tsx`:
   - In the `Slots Grid` (`slots.map`, lines 234–244), when `isMultiHead` is true and `status?.toolTemps?.[index]` is defined, show a compact temperature pill (`{Math.round(status.toolTemps[index])}°C`) in the slot header right next to `Tool T${index}`—matching Flutter Mobile (`ams_spool_card.dart` lines 523–536)!
2. In `S:\Projects\YourPrinter\web\src\components\dashboard\DashboardScreen.tsx`:
   - Ensure mobile (`< lg`) card order matches Flutter Mobile (`Camera` → `Job Progress` → `Temperatures` → `Hardware Controls` → `AMS / Spool`) while keeping the 2-column desktop layout (`lg:grid-cols-12`):
     - Use CSS grid order utilities (`order-1`, `order-2`, etc. on mobile vs `lg:col-span-7` / `lg:col-span-5` on desktop) or responsive placement so mobile users don't have to scroll past 4 filament spool cards before seeing `Temperatures` and `Hardware Controls`.
   - In `App.tsx` (line 144) and `DashboardScreen.tsx` (line 16), ensure mobile bottom padding is `pb-20 md:pb-8` so the fixed `BottomNav` (`h-14`) never overlaps the bottom of the page.

---

### Step 5: Build & Verification Checklist (Mandatory Before Completion)

Run these exact commands and verify 0 errors:

1. **WebUI TypeScript & Vite Production Build**:
   ```powershell
   cd "S:\Projects\YourPrinter\web"
   npm run build
   ```
   - Must exit with code `0` and output compiled bundle in `dist/`.

2. **Flutter Mobile Static Analysis & Unit/Widget Tests**:
   ```powershell
   cd "S:\Projects\YourPrinter\mobile"
   flutter analyze
   flutter test
   ```
   - `flutter analyze` must report `No issues found!`.
   - `flutter test` must pass 100% of tests.
