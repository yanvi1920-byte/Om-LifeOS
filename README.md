# Om LifeOS — Tauri Desktop App

A small modular Tauri 2 desktop application using the existing Om LifeOS frontend.

## Structure

- `index.html` — small application markup
- `assets/app.css` — application styles
- `assets/app.js` — application JavaScript
- `src-tauri/` — native Tauri/Rust desktop wrapper

## Requirements

Install:
- Node.js
- Rust + Cargo
- Tauri prerequisites for your operating system

## Development

From the repository root:

```bash
npm install
npm run tauri dev
```

## Build an installer

```bash
npm run tauri build
```

Tauri will place release bundles under:

```text
src-tauri/target/release/bundle/
```

## Data preservation

This wrapper does not intentionally delete, rename, migrate, or clear application data.

The frontend remains the modularized application:
- local persistence stays in `assets/app.js`
- existing Word/PDF/Excel export logic remains in the frontend
- no remote backend is added
- the desktop WebView has its own storage namespace and does not overwrite the browser's existing storage

If existing browser data needs to be moved into the desktop app, use the application's existing backup/restore mechanism rather than adding an untested storage migration.

## Security

The Tauri WebView is configured with a restrictive local CSP and no network connection permission is added by this wrapper.

## GitHub Actions releases

The repository includes `.github/workflows/build-tauri.yml`.

This workflow is **Windows-only** and builds the Tauri Windows installer (`.msi` and/or `.exe`).

Create and push a version tag such as:

```bash
git tag v1.0.0
git push origin v1.0.0
```

GitHub Actions will build the Tauri application on:
- Windows only

The workflow creates a GitHub release in draft mode with the generated desktop bundles attached. Review the draft release and publish it when ready.

The workflow can also be started manually from the **Actions** tab.
