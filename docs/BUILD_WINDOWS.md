# Building ContextShifter for Windows

This branch (`windows-release`) makes ContextShifter build and run on Windows.
The core trackers (`active-win`, `uiohook-napi`, the Chrome + VS Code extensions,
Transformers.js, SQLite) are already cross-platform; this branch fixes the
macOS-only surfaces and gates the macOS-specific UX.

> **You must build on a Windows machine.** The native modules
> (`better-sqlite3`, `uiohook-napi`, `active-win`, `extract-file-icon`) are
> compiled per-platform and cannot be cross-built from macOS. The steps below
> are for Windows 10/11 (x64).

## Prerequisites (on Windows)

- **Node.js 18+** and npm.
- **Build tools for native modules:** install the "Desktop development with C++"
  workload (Visual Studio Build Tools) and Python 3. The quickest path is
  `npm install --global windows-build-tools` (older) or installing VS Build
  Tools 2022 manually.
- **Git**, and (optional) a code-signing certificate — see *Signing* below.

## Build

```powershell
git clone https://github.com/StalyTV/ContextShifter
cd ContextShifter
git checkout windows-release
npm ci                # rebuilds native modules for Windows via electron-builder install-app-deps
npm run package:win   # fetches the embedding model, webpacks, and runs electron-builder --win
```

The installer is written to `release/build/ContextShifter-Setup-<version>.exe`
(NSIS target: non-oneClick, user can choose the install directory, creates
desktop + start-menu shortcuts).

## What changed on this branch (vs. the macOS build)

| Area | Change |
|---|---|
| **Task-switcher widget** | Kept and functional, but the macOS-only overlay behaviour (`setVisibleOnAllWorkspaces`, `screen-saver` always-on-top level, Dock re-show) is gated behind `isMac`. On Windows it's a plain always-on-top window positioned top-right of the active display. |
| **System-tray icon** | Already had a Windows branch — uses the coloured glyph (`trayIcons/windows/CameraIcon.png`) instead of the macOS template image. |
| **Permissions onboarding** | The macOS Screen Recording / Accessibility / Input Monitoring / `xattr` quarantine instructions are hidden on Windows; a short SmartScreen note is shown instead. Windows needs no special OS permissions. |
| **Chrome profile launch** | `Local State` and the `chrome.exe` binary are now resolved from `%LOCALAPPDATA%` / `%PROGRAMFILES%` on Windows; launch falls back to `cmd /c start chrome …` instead of `open -a`. |
| **IDE / workspace restore** | `openFiles` now uses `Start-Process -FilePath <app> -ArgumentList <paths>` on Windows so a VS Code workspace reopens *in the IDE*, not with the default file handler. |
| **Build target** | `win.target` is NSIS (installs unsigned; no Squirrel/auto-update signing needed). |

## Known limitations on Windows (needs a pilot before any study)

1. **Open-document tracking is degraded.** `getFrontDocumentPath()` reads the
   open file of a document app (Preview/Word/Pages) via the macOS Accessibility
   `AXDocument` attribute; it returns `null` on Windows. So file-handler apps
   won't auto-capture their open document. A Windows equivalent (UI Automation)
   or a fallback to the existing "recently opened files" tracking would be
   needed for parity.
2. **The Windows branches predate the ContextShifter work and are untested.**
   "It compiles" ≠ "it behaves identically." The study was validated on
   macOS/Apple Silicon; a Windows run needs its own pilot pass.
3. **TimeBuzzer dial (optional)** — `node-hid`/`usb` are cross-platform but
   Windows may need a WinUSB/HIDAPI driver for the device. The app degrades
   gracefully without it.

## Signing

The build installs and runs **unsigned**, but Windows SmartScreen will warn on
first launch ("More info → Run anyway"). For a smoother participant experience,
sign the installer with an Authenticode certificate: set `CSC_LINK` (path to
`.pfx`) and `CSC_KEY_PASSWORD` in the environment before `npm run package:win`,
and electron-builder signs automatically.

## Suggested release tag

Publish the Windows build under a distinct tag, e.g. `v0.4.3-win`, so it doesn't
collide with the macOS `v0.4.3` release:

```powershell
gh release create v0.4.3-win --repo StalyTV/ContextShifter --target windows-release `
  --title "ContextShifter v0.4.3 — Windows (experimental)" `
  release/build/ContextShifter-Setup-0.4.3.exe
```
