# YourPrinter Mobile

Cross-platform 3D printing telemetry, multi-camera streaming, and print management client for **YourPrinter** and **Bambu Lab** printers. Built with Flutter for high performance on Android and iOS.

---

## 🚀 Features

- **Fleet Dashboard**: Row-by-row live monitoring of all networked printers with synchronized 16:9 live camera feeds.
- **Swipe-to-Cycle Controls**: Horizontal swipe between printers on the Device screen with numerical counter (`1/2`, `2/2`) and interactive dot indicators.
- **Real-Time Telemetry**: Live nozzle & bed temperatures, layer progress, active file names, and print status updates via WebSocket with REST fallback.
- **Dual Camera Architecture**: Native WebRTC streaming via `go2rtc` with automatic fallback to high-framerate MJPEG snapshots.
- **Smart Error Handling**: Generic, user-friendly connection cards with an expandable technical details inspector (`RAW ERROR LOG`) and one-tap error copying.
- **Automated CI/CD Builds**: Continuous integration and single-APK release publishing directly on GitHub Actions.

---

## 📦 Download APK (Direct Android Install)

Optimized architecture-specific APKs are published with every release (~65% smaller downloads, ~30 MB):

👉 **[Download the Latest APK from GitHub Releases](https://github.com/christianborges121/YourPrinter/releases/latest)**

- **`arm64-v8a` (Recommended)**: For almost all modern Android phones and tablets (~30 MB).
- **`armeabi-v7a`**: For older 32-bit Android devices (~24 MB).
- **`x86_64`**: For Android emulators and Intel-based tablets (~36 MB).
- **Obtainium Compatible**: Works automatically with Obtainium app updater (selects `arm64-v8a`).
- **Signing Certificate Fingerprint (SHA-256):** `F5:AF:A5:BB:E8:0E:19:5D:EB:D8:27:ED:16:54:29:35:24:A3:7C:F2:CB:A0:B5:86:6E:93:C2:E1:7D:50:7C:E3` (persistent release keystore for seamless updates)

---

## 📲 Installation on Android

1. Tap the `.apk` download link above directly on your phone.
2. When the download completes, tap the notification to open and install.
   - If prompted by Android, enable *"Install unknown apps"* for your browser or file manager.
3. Or install via wireless/USB ADB:
   ```bash
   adb install -r YourPrinter-v1.0.0.apk
   ```
4. Open **YourPrinter Mobile** and enter your server URL (e.g. `http://<your-server-ip>:3080`).

---

## 🛠 Local Development

```bash
# Get dependencies
flutter pub get

# Run static analysis
flutter analyze

# Run unit and widget tests
flutter test

# Build split release APKs (~30 MB each)
flutter build apk --release --split-per-abi
```
