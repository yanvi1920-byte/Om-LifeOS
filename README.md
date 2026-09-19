# ॐ — Windows Desktop

ॐ packaged as a lightweight Windows desktop application with Tauri 2.

## Why Tauri

The existing LifeOS HTML app is used directly as the frontend. Tauri provides a native Windows shell while using the Windows WebView2 runtime instead of bundling a full Chromium browser, keeping the desktop package comparatively small and fast.

## Local Windows build

Requirements:
- Windows 10/11
- Node.js LTS
- Rust (MSVC toolchain)
- Microsoft C++ Build Tools
- WebView2 Runtime

Then:

```powershell
npm install
npm run dev
npm run build
```

The Windows NSIS installer is produced under `src-tauri/target/release/bundle/nsis/` (or the workspace target directory depending on Cargo/Tauri configuration).

## GitHub release

Push a version tag such as `v1.0.0`. GitHub Actions builds the Windows installer and publishes it to a GitHub Release.

```powershell
git add .
git commit -m "Initial ॐ Windows app"
git tag v1.0.0
git push origin main --tags
```

For a public release, code signing is recommended so Windows users get a more trusted installation experience.
