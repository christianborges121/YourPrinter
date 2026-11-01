# AGENTS.md - YourPrinter Monorepo

Guidelines and rules for AI agents working in this unified repository (`desktop/`, `web/`, `mobile/`, `shared/`).

## Repository Structure (Option 1)
- `desktop/`: Electron desktop application, headless server (`WebUIManager`), printer backends (FlashForge 5M/AD5X/Creator 5, Bambu Lab A1 mini), Express REST & WebSocket API, and vendor packages (`@parallel-7/slicer-meta`).
- `web/`: Modern WebUI browser frontend (React 19, TypeScript, Vite, Tailwind CSS, Lucide Icons) compiled into `desktop/out/webui/static`.
- `mobile/`: Flutter Android/iOS application (`YourPrinter Mobile`).
- `shared/`: Shared TypeScript API contracts (`types/web-api.types.ts`), printer/camera/spoolman types, utilities, and brand logo assets (`assets/logo/`).

## Git Branching & Multi-Phase Workflow
1. **Feature Branches for Multi-Phase Efforts**:
   - For any multi-phase plan, substantial feature work, or refactoring, always create and work off a dedicated feature branch:
     ```bash
     git checkout -b feature/<descriptive-name>
     ```
   - Commit and test iterative phase milestones on the feature branch.
2. **Master Branch Protection & Releases**:
   - Every push to `master` automatically triggers CI (`.github/workflows/build-and-release-apk.yml`) to increment the mobile app version by `0.0.1` and publish a new universal `YourPrinter-vX.Y.Z.apk` to GitHub Releases.
   - Do **not** push intermediate or incomplete phases directly to `master`.
   - Merge or PR feature branches into `master` only when all phases are complete, tests pass (100%), and functionality is verified.

## License & Attribution Retention
- Always preserve all `LICENSE` files and copyright notices (`GhostTypes`, `rolohaun`, `christianborges121`) and upstream attributions (`Parallel-7/FlashForgeUI-Electron` and `rolohaun/FlashForgeUI-Electron-Creator5`) across root, `desktop/`, `web/`, `mobile/`, and `shared/`.

## Privacy & Local Network Invariants
- Never commit private IP addresses (`192.168.68.*`, `100.*`, `10.*`) or real Discord webhook URLs to repo code, compose configs, test fixtures, or `.env.example`.
- Rely on container service networking (`FLASHFORGE_UI_URL=http://yourprinter:3000`) and dynamic printer discovery (`/api/printers/overview`). Keep IP variables empty by default in all `.env.example` templates.

## NAS Deployment & Complete Redeployment Runbook
- **Target Directory**: `/media/Safe-Storage/Projects/YourPrinter`
- **Complete Clean Redeploy Command** (Pulls latest code, frees legacy ports, removes orphaned containers, rebuilds, and launches in background):
  ```bash
  cd /media/Safe-Storage/Projects/YourPrinter && git pull origin master && docker stop obico-stream-watchdog 2>/dev/null || true; docker compose down --remove-orphans && docker compose up -d --build --remove-orphans
  ```
- **Quick Restart Command** (Without rebuilding images):
  ```bash
  cd /media/Safe-Storage/Projects/YourPrinter && git pull origin master && docker compose down && docker compose up -d
  ```
