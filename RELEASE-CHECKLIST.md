# ॐ — Release & Process Checklist

## Included in this package
- Tauri 2 Windows desktop project
- Android Tauri project configuration and CI build commands
- Native SQLite long-life storage with WAL and indexed queries
- Restart-safe database reconciliation for deleted records
- Word / Excel / PDF / JSON backup export
- Export periods: All Data, Week, Month, Year, Custom
- GitHub Actions workflow for Windows release + Android AAB/APK artifacts
- ॐ application branding and Windows installer icons

## Before the first GitHub release
1. Upload the contents of `LifeOS-Windows` to the repository root.
2. Run the GitHub Actions workflow manually once.
3. For Windows, install the generated NSIS `.exe` and test create/edit/delete/restart.
4. For Android, download the `om-lifeos-android` workflow artifact and test the APK.
5. Test Word, Excel, PDF and JSON exports and restore/import.

## Signed automatic updater
Tauri's updater requires a signing keypair. This repository deliberately does **not** contain a private signing key.

To enable signed updater artifacts for production:
- Generate a Tauri updater keypair on a trusted development machine.
- Put the private key in the GitHub repository secret `TAURI_SIGNING_PRIVATE_KEY`.
- Put the matching public key in `src-tauri/tauri.conf.json` under `plugins.updater.pubkey`.
- Set `bundle.createUpdaterArtifacts` to `true`.
- Configure the GitHub release `latest.json` endpoint.

Never commit the private key to the repository.

## Long-life data architecture note
SQLite is the canonical native record store and exposes bounded list/search APIs. The current UI still keeps an application-state projection in memory for compatibility with the existing screens. A future performance pass can migrate individual screens to direct paginated SQLite queries without changing the database format.
