# Om-LifeOS v1.8.25 — Final Fresh Build

Windows/GitHub/Tauri local-first LifeOS build.

## Export behavior
- Word / Excel / PDF export only the user-selected menus and selected date range.
- First successful export creates a baseline. Later exports contain only records changed/created after the previous successful export for that format + period.
- Unchanged records are not repeated.
- JSON Full Backup remains a separate full-backup operation.
- Exported `updatedAt` is internal metadata and is not added as an extra visible column.

## Long-life storage
- Windows/Tauri uses SQLite as the canonical store.
- SQLite is configured with WAL, NORMAL synchronous mode, busy timeout, indexes and lazy/cursor loading.
- Browser fallback uses IndexedDB/localStorage.

## Build
```bash
npm install
npm run tauri build
```
