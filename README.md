# ॐ LifeOS — Windows + Android

`ॐ` is a Tauri 2 application with a shared lightweight frontend and a native SQLite record layer. The project is designed for long-lived personal data: records are stored durably in SQLite, queried with bounded result sets, and kept out of the JavaScript heap unless the current screen needs them.

## Platforms

- Windows desktop: NSIS installer via GitHub Actions.
- Android: AAB for Google Play and AArch64 APK for direct testing/distribution.
- Same app identifier and shared data model across platforms.

## Long-life data architecture

- SQLite in the platform app-data directory.
- WAL mode, foreign keys, busy timeout and indexed section/date/update queries.
- Versioned schema and transactional bulk writes.
- Bounded pagination/date-range/search APIs are exposed from Rust.
- Attachments stay outside the main record payload where the existing frontend storage layer supports them.
- Browser/localStorage remains a compatibility fallback; the native app uses SQLite as the durable record store.
- The current frontend still maintains its working application state for compatibility. The database API is ready for screen-by-screen lazy query migration rather than loading entire history into memory.

## Updates

Windows updater support is wired through the official Tauri updater plugin, but production update signing is intentionally not enabled until the repository owner creates and securely stores the updater signing key. Never commit the private signing key. See `src-tauri/updater.config.example.json`.

Android uses the standard Android distribution model: Google Play AAB updates are handled by Google Play. Direct APK distribution requires the same release signing key for future upgrades.

## Build locally

```text
npm ci
npm run build
npm run tauri android init
npm run tauri android build -- --aab
npm run tauri android build -- --apk
```

Tauri Android development requires Rust plus Android Studio/SDK/NDK tooling. The CI workflow installs the required Android tooling and builds AAB/APK artifacts.

## GitHub release workflow

`.github/workflows/release.yml` builds the Windows installer on `v*` tags and builds Android AAB/APK artifacts. Android build automation is currently marked experimental by the Tauri Action ecosystem, so the workflow uses the Tauri CLI directly for the Android build.

## Important

No software can provide literally infinite storage or guarantee zero failures. The goal here is practical multi-year/decade-scale storage with transactional writes, migrations, backups and bounded queries.


## Release-readiness notes

- Android CI uses the Tauri CLI through the `tauri` npm script and builds AAB/APK with the documented `tauri android build` commands.
- SQLite reconciliation compares against database record IDs, so deletions are not lost after an app restart.
- Windows updater code/plugin is wired, but signed updater artifacts require a Tauri updater keypair. The private signing key must remain a GitHub Actions secret; it must never be committed to this repository.

## Process-ready release package
Use `RELEASE-CHECKLIST.md` for the exact GitHub Actions, Windows, Android, backup, and updater release sequence. The package intentionally contains no private signing key.
