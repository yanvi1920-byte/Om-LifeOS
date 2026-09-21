use rusqlite::{backup::Backup, params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::{fs, path::{Path, PathBuf}, sync::Mutex};
use tauri::{AppHandle, Manager, State};

struct DbState(Mutex<Connection>);

#[derive(Debug, Serialize, Deserialize)]
struct DbRecord {
    section: String,
    record_id: String,
    date_key: Option<String>,
    updated_at: i64,
    payload: String,
}

#[derive(Debug, Serialize)]
struct DbStats {
    path: String,
    records: i64,
    schema_version: i64,
}

fn db_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("om-lifeos.sqlite3"))
}

fn configure(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "PRAGMA journal_mode=WAL;
         PRAGMA synchronous=NORMAL;
         PRAGMA foreign_keys=ON;
         PRAGMA busy_timeout=5000;
         PRAGMA temp_store=MEMORY;
         PRAGMA auto_vacuum=INCREMENTAL;"
    ).map_err(|e| e.to_string())
}

fn migrate(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            applied_at INTEGER NOT NULL
         );
         CREATE TABLE IF NOT EXISTS meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at INTEGER NOT NULL
         );
         CREATE TABLE IF NOT EXISTS records (
            section TEXT NOT NULL,
            record_id TEXT NOT NULL,
            date_key TEXT,
            updated_at INTEGER NOT NULL,
            payload TEXT NOT NULL,
            PRIMARY KEY(section, record_id)
         );
         CREATE INDEX IF NOT EXISTS idx_records_section_date
            ON records(section, date_key DESC, updated_at DESC);
         CREATE INDEX IF NOT EXISTS idx_records_section_updated
            ON records(section, updated_at DESC);
         INSERT INTO schema_migrations(version,applied_at) VALUES(1,strftime('%s','now'))
            ON CONFLICT(version) DO NOTHING;
         INSERT INTO meta(key,value,updated_at) VALUES('schema_version','1',strftime('%s','now'))
            ON CONFLICT(key) DO NOTHING;"
    ).map_err(|e| e.to_string())
}

#[tauri::command]
fn db_init(app: AppHandle, state: State<'_, DbState>) -> Result<DbStats, String> {
    let path = db_path(&app)?;
    let conn = state.0.lock().map_err(|_| "Database lock poisoned".to_string())?;
    configure(&conn)?;
    migrate(&conn)?;
    let records: i64 = conn.query_row("SELECT COUNT(*) FROM records", [], |r| r.get(0)).map_err(|e| e.to_string())?;
    let schema_version: i64 = conn.query_row("SELECT CAST(value AS INTEGER) FROM meta WHERE key='schema_version'", [], |r| r.get(0)).unwrap_or(1);
    Ok(DbStats { path: path.to_string_lossy().into_owned(), records, schema_version })
}

#[tauri::command]
fn db_upsert_record(state: State<'_, DbState>, record: DbRecord) -> Result<(), String> {
    let conn = state.0.lock().map_err(|_| "Database lock poisoned".to_string())?;
    conn.execute(
        "INSERT INTO records(section,record_id,date_key,updated_at,payload) VALUES(?1,?2,?3,?4,?5)
         ON CONFLICT(section,record_id) DO UPDATE SET date_key=excluded.date_key, updated_at=excluded.updated_at, payload=excluded.payload",
        params![record.section, record.record_id, record.date_key, record.updated_at, record.payload]
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn db_upsert_records(state: State<'_, DbState>, records: Vec<DbRecord>) -> Result<usize, String> {
    let mut conn = state.0.lock().map_err(|_| "Database lock poisoned".to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    {
        let mut stmt = tx.prepare(
            "INSERT INTO records(section,record_id,date_key,updated_at,payload) VALUES(?1,?2,?3,?4,?5)
             ON CONFLICT(section,record_id) DO UPDATE SET date_key=excluded.date_key, updated_at=excluded.updated_at, payload=excluded.payload"
        ).map_err(|e| e.to_string())?;
        for r in &records {
            stmt.execute(params![r.section, r.record_id, r.date_key, r.updated_at, r.payload]).map_err(|e| e.to_string())?;
        }
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(records.len())
}

#[tauri::command]
fn db_delete_record(state: State<'_, DbState>, section: String, record_id: String) -> Result<bool, String> {
    let conn = state.0.lock().map_err(|_| "Database lock poisoned".to_string())?;
    let n = conn.execute("DELETE FROM records WHERE section=?1 AND record_id=?2", params![section, record_id]).map_err(|e| e.to_string())?;
    Ok(n > 0)
}

#[tauri::command]
fn db_delete_records(state: State<'_, DbState>, section: String, record_ids: Vec<String>) -> Result<usize, String> {
    if record_ids.is_empty() { return Ok(0); }
    let mut conn = state.0.lock().map_err(|_| "Database lock poisoned".to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let mut stmt = tx.prepare("DELETE FROM records WHERE section=?1 AND record_id=?2").map_err(|e| e.to_string())?;
    let mut deleted = 0usize;
    for id in &record_ids {
        deleted += stmt.execute(params![section, id]).map_err(|e| e.to_string())?;
    }
    drop(stmt);
    tx.commit().map_err(|e| e.to_string())?;
    Ok(deleted)
}

fn online_backup(app: &AppHandle, target: &PathBuf) -> Result<String, String> {
    if let Some(parent) = target.parent() { fs::create_dir_all(parent).map_err(|e| e.to_string())?; }
    let source_path = db_path(app)?;
    let tmp = target.with_extension("sqlite3.partial");
    let _ = fs::remove_file(&tmp);

    // IMPORTANT: use SQLite's Online Backup API rather than copying the live
    // database file. This keeps the source writable while the snapshot is made.
    let source = Connection::open(&source_path).map_err(|e| e.to_string())?;
    configure(&source)?;
    let mut destination = Connection::open(&tmp).map_err(|e| e.to_string())?;
    configure(&destination)?;
    {
        let backup = Backup::new(&source, &mut destination).map_err(|e| e.to_string())?;
        // Small chunks + a pause keep I/O responsive during large backups.
        backup.run_to_completion(64, std::time::Duration::from_millis(8), None)
            .map_err(|e| e.to_string())?;
    }
    destination.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);").map_err(|e| e.to_string())?;
    drop(destination);
    drop(source);

    // Validate the completed snapshot before replacing the visible backup.
    let check = Connection::open(&tmp).map_err(|e| e.to_string())?;
    let integrity: String = check.query_row("PRAGMA integrity_check", [], |r| r.get(0)).map_err(|e| e.to_string())?;
    drop(check);
    if integrity != "ok" {
        let _ = fs::remove_file(&tmp);
        return Err(format!("Backup integrity check failed: {integrity}"));
    }

    // Never expose a half-written backup as a finished backup.
    if target.exists() { fs::remove_file(target).map_err(|e| e.to_string())?; }
    fs::rename(&tmp, target).map_err(|e| e.to_string())?;
    Ok(target.to_string_lossy().into_owned())
}

#[tauri::command]
fn db_backup_to(app: AppHandle, target: String) -> Result<String, String> {
    let target = PathBuf::from(target);
    if target.as_os_str().is_empty() { return Err("Backup target is empty".into()); }
    // Snapshot from a separate read connection. Do not run PRAGMA optimize on the live
    // connection here; backups must never make the foreground write path wait for maintenance.
    online_backup(&app, &target)
}

#[tauri::command]
fn db_auto_backup(app: AppHandle, state: State<'_, DbState>) -> Result<String, String> {
    let root = app.path().document_dir().map_err(|e| e.to_string())?;
    let dir = root.join("Om-LifeOS").join("DatabaseBackups");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    // Do not copy anything when no data changed since the last automatic snapshot.
    let current_stamp: i64 = {
        let conn = state.0.lock().map_err(|_| "Database lock poisoned".to_string())?;
        conn.query_row("SELECT CAST(value AS INTEGER) FROM meta WHERE key='last_data_saved_at'", [], |r| r.get(0)).unwrap_or(0)
    };
    let previous_stamp: i64 = {
        let conn = state.0.lock().map_err(|_| "Database lock poisoned".to_string())?;
        conn.query_row("SELECT CAST(value AS INTEGER) FROM meta WHERE key='last_auto_backup_stamp'", [], |r| r.get(0)).unwrap_or(0)
    };
    // No recorded data change means there is nothing new to snapshot.
    // In particular, do not create endless backups when a fresh/empty DB
    // has never received a last_data_saved_at stamp.
    if current_stamp <= 0 || current_stamp == previous_stamp {
        return Ok(String::new());
    }

    let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?;
    let target = dir.join(format!("om-lifeos-{}-{}.sqlite3", stamp.as_secs(), stamp.subsec_millis()));
    let saved = online_backup(&app, &target)?;

    {
        let conn = state.0.lock().map_err(|_| "Database lock poisoned".to_string())?;
        conn.execute("INSERT INTO meta(key,value,updated_at) VALUES('last_auto_backup_stamp',?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
            params![current_stamp.to_string(), stamp.as_secs() as i64]).map_err(|e| e.to_string())?;
    }

    // Keep a bounded rolling history.
    let mut files: Vec<_> = fs::read_dir(&dir).map_err(|e| e.to_string())?
        .filter_map(|e| e.ok()).filter(|e| e.path().extension().and_then(|x| x.to_str()) == Some("sqlite3"))
        .collect();
    files.sort_by_key(|e| e.metadata().and_then(|m| m.modified()).ok());
    while files.len() > 30 {
        if let Some(old) = files.first() { let _ = fs::remove_file(old.path()); }
        files.remove(0);
    }
    Ok(saved)
}

#[tauri::command]
fn db_list_records(
    state: State<'_, DbState>, section: String, limit: i64, offset: i64,
    from_date: Option<String>, to_date: Option<String>,
    cursor_date: Option<String>, cursor_updated_at: Option<i64>, cursor_record_id: Option<String>
) -> Result<Vec<DbRecord>, String> {
    let conn = state.0.lock().map_err(|_| "Database lock poisoned".to_string())?;
    let limit = limit.clamp(1, 1000);
    let offset = offset.max(0);
    let has_cursor = cursor_updated_at.is_some() && cursor_record_id.is_some();
    let cursor_date = cursor_date.unwrap_or_default();
    let cursor_updated_at = cursor_updated_at.unwrap_or(i64::MAX);
    let cursor_record_id = cursor_record_id.unwrap_or_default();
    let mut out = Vec::new();
    let mut collect = |sql: &str, bind: &[&dyn rusqlite::ToSql]| -> Result<(), String> {
        let mut st = conn.prepare(sql).map_err(|e| e.to_string())?;
        let rows = st.query_map(bind, |r| Ok(DbRecord{section:r.get(0)?,record_id:r.get(1)?,date_key:r.get(2)?,updated_at:r.get(3)?,payload:r.get(4)?})).map_err(|e| e.to_string())?;
        for row in rows { out.push(row.map_err(|e| e.to_string())?); }
        Ok(())
    };
    match (from_date, to_date, has_cursor) {
        (Some(from), Some(to), true) => collect(
            "SELECT section,record_id,date_key,updated_at,payload FROM records WHERE section=?1 AND date_key>=?2 AND date_key<=?3 AND (COALESCE(date_key,'') < ?4 OR (COALESCE(date_key,'')=?4 AND updated_at < ?5) OR (COALESCE(date_key,'')=?4 AND updated_at=?5 AND record_id < ?6)) ORDER BY date_key DESC, updated_at DESC, record_id DESC LIMIT ?7",
            &[&section,&from,&to,&cursor_date,&cursor_updated_at,&cursor_record_id,&limit])?,
        (Some(from), Some(to), false) => collect(
            "SELECT section,record_id,date_key,updated_at,payload FROM records WHERE section=?1 AND date_key>=?2 AND date_key<=?3 ORDER BY date_key DESC, updated_at DESC, record_id DESC LIMIT ?4 OFFSET ?5",
            &[&section,&from,&to,&limit,&offset])?,
        (_, _, true) => collect(
            "SELECT section,record_id,date_key,updated_at,payload FROM records WHERE section=?1 AND (COALESCE(date_key,'') < ?2 OR (COALESCE(date_key,'')=?2 AND updated_at < ?3) OR (COALESCE(date_key,'')=?2 AND updated_at=?3 AND record_id < ?4)) ORDER BY date_key DESC, updated_at DESC, record_id DESC LIMIT ?5",
            &[&section,&cursor_date,&cursor_updated_at,&cursor_record_id,&limit])?,
        _ => collect(
            "SELECT section,record_id,date_key,updated_at,payload FROM records WHERE section=?1 ORDER BY date_key DESC, updated_at DESC, record_id DESC LIMIT ?2 OFFSET ?3",
            &[&section,&limit,&offset])?,
    }
    Ok(out)
}

#[tauri::command]
fn db_list_record_ids(state: State<'_, DbState>, section: String) -> Result<Vec<String>, String> {
    let conn = state.0.lock().map_err(|_| "Database lock poisoned".to_string())?;
    let mut st = conn.prepare("SELECT record_id FROM records WHERE section=?1").map_err(|e| e.to_string())?;
    let rows = st.query_map(params![section], |r| r.get::<_, String>(0)).map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for row in rows { out.push(row.map_err(|e| e.to_string())?); }
    Ok(out)
}

#[tauri::command]
fn db_total_count(state: State<'_, DbState>) -> Result<i64, String> {
    let conn = state.0.lock().map_err(|_| "Database lock poisoned".to_string())?;
    conn.query_row("SELECT COUNT(*) FROM records", [], |r| r.get(0)).map_err(|e| e.to_string())
}

#[tauri::command]
fn db_count_records(state: State<'_, DbState>, section: String) -> Result<i64, String> {
    let conn = state.0.lock().map_err(|_| "Database lock poisoned".to_string())?;
    conn.query_row("SELECT COUNT(*) FROM records WHERE section=?1", params![section], |r| r.get(0)).map_err(|e| e.to_string())
}

#[tauri::command]
fn db_search_records(state: State<'_, DbState>, section: String, query: String, limit: i64) -> Result<Vec<DbRecord>, String> {
    let conn = state.0.lock().map_err(|_| "Database lock poisoned".to_string())?;
    let limit = limit.clamp(1, 200);
    let q = format!("%{}%", query);
    let mut st = conn.prepare("SELECT section,record_id,date_key,updated_at,payload FROM records WHERE section=?1 AND payload LIKE ?2 ORDER BY updated_at DESC LIMIT ?3").map_err(|e| e.to_string())?;
    let rows = st.query_map(params![section, q, limit], |r| Ok(DbRecord{section:r.get(0)?,record_id:r.get(1)?,date_key:r.get(2)?,updated_at:r.get(3)?,payload:r.get(4)?})).map_err(|e| e.to_string())?;
    let mut out=Vec::new();
    for row in rows { out.push(row.map_err(|e| e.to_string())?); }
    Ok(out)
}

#[tauri::command]
fn db_get_record(state: State<'_, DbState>, section: String, record_id: String) -> Result<Option<DbRecord>, String> {
    let conn = state.0.lock().map_err(|_| "Database lock poisoned".to_string())?;
    conn.query_row("SELECT section,record_id,date_key,updated_at,payload FROM records WHERE section=?1 AND record_id=?2", params![section, record_id], |r| Ok(DbRecord{section:r.get(0)?,record_id:r.get(1)?,date_key:r.get(2)?,updated_at:r.get(3)?,payload:r.get(4)?})).optional().map_err(|e| e.to_string())
}

#[derive(Debug, Serialize)]
struct FinanceSummary {
    from_date: String,
    to_date: String,
    income: f64,
    expense: f64,
}

#[tauri::command]
fn db_finance_summary(state: State<'_, DbState>, from_date: String, to_date: String) -> Result<FinanceSummary, String> {
    let conn = state.0.lock().map_err(|_| "Database lock poisoned".to_string())?;
    let sum_section = |section: &str| -> Result<f64, String> {
        let mut st = conn.prepare("SELECT payload FROM records WHERE section=?1 AND date_key>=?2 AND date_key<=?3")
            .map_err(|e| e.to_string())?;
        let rows = st.query_map(params![section, from_date, to_date], |r| r.get::<_, String>(0))
            .map_err(|e| e.to_string())?;
        let mut total = 0.0_f64;
        for row in rows {
            let payload = row.map_err(|e| e.to_string())?;
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&payload) {
                total += v.get("amount").and_then(|x| x.as_f64()).unwrap_or(0.0);
            }
        }
        Ok(total)
    };
    Ok(FinanceSummary {
        from_date: from_date.clone(),
        to_date: to_date.clone(),
        income: sum_section("income")?,
        expense: sum_section("expenses")?,
    })
}

#[tauri::command]
fn db_set_meta(state: State<'_, DbState>, key: String, value: String, updated_at: i64) -> Result<(), String> {
    let conn = state.0.lock().map_err(|_| "Database lock poisoned".to_string())?;
    conn.execute("INSERT INTO meta(key,value,updated_at) VALUES(?1,?2,?3) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at", params![key,value,updated_at]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn db_get_meta(state: State<'_, DbState>, key: String) -> Result<Option<String>, String> {
    let conn = state.0.lock().map_err(|_| "Database lock poisoned".to_string())?;
    conn.query_row("SELECT value FROM meta WHERE key=?1", params![key], |r| r.get(0)).optional().map_err(|e| e.to_string())
}

#[tauri::command]
fn db_get_meta_stamp(state: State<'_, DbState>, key: String) -> Result<Option<i64>, String> {
    let conn = state.0.lock().map_err(|_| "Database lock poisoned".to_string())?;
    conn.query_row("SELECT updated_at FROM meta WHERE key=?1", params![key], |r| r.get(0)).optional().map_err(|e| e.to_string())
}

#[tauri::command]
fn db_checkpoint(state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|_| "Database lock poisoned".to_string())?;
    conn.execute_batch("PRAGMA wal_checkpoint(PASSIVE); PRAGMA optimize;").map_err(|e| e.to_string())
}

#[tauri::command]
fn db_integrity_check(state: State<'_, DbState>) -> Result<String, String> {
    let conn = state.0.lock().map_err(|_| "Database lock poisoned".to_string())?;
    conn.query_row("PRAGMA integrity_check", [], |r| r.get(0)).map_err(|e| e.to_string())
}

fn validate_backup_file(path: &Path) -> Result<(), String> {
    if !path.is_file() { return Err("Selected backup file does not exist.".into()); }
    let conn = Connection::open(path).map_err(|e| format!("Could not open backup: {e}"))?;
    configure(&conn)?;
    let integrity: String = conn.query_row("PRAGMA integrity_check", [], |r| r.get(0))
        .map_err(|e| format!("Could not check backup integrity: {e}"))?;
    if integrity != "ok" { return Err(format!("Selected backup failed integrity check: {integrity}")); }
    Ok(())
}

fn preserve_live_database(path: &Path) -> Result<PathBuf, String> {
    let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?;
    let base = format!("om-lifeos-corrupt-{}-{}", stamp.as_secs(), stamp.subsec_millis());
    let dir = path.parent().ok_or_else(|| "Database folder is unavailable.".to_string())?;
    let quarantine = dir.join(base);
    fs::create_dir_all(&quarantine).map_err(|e| e.to_string())?;
    let mut copied = false;
    for suffix in ["", "-wal", "-shm"] {
        let src = if suffix.is_empty() { path.to_path_buf() } else { PathBuf::from(format!("{}{}", path.to_string_lossy(), suffix)) };
        if src.is_file() {
            let name = src.file_name().and_then(|x| x.to_str()).unwrap_or("database");
            fs::copy(&src, quarantine.join(name)).map_err(|e| format!("Could not preserve damaged database file {name}: {e}"))?;
            copied = true;
        }
    }
    if !copied { return Err("Live database file was not found.".into()); }
    Ok(quarantine)
}

#[derive(Debug, Serialize)]
struct DbRestoreResult {
    restored_from: String,
    preserved_damaged_copy: String,
    integrity: String,
    records: i64,
}

#[tauri::command]
fn choose_database_backup(app: AppHandle) -> Result<Option<String>, String> {
    #[cfg(windows)]
    {
        let default_dir = app.path().document_dir().ok().map(|p| p.join("Om-LifeOS").join("DatabaseBackups"));
        let mut dialog = rfd::FileDialog::new().set_title("Choose verified LifeOS SQLite backup");
        if let Some(dir) = default_dir.as_ref() { if dir.is_dir() { dialog = dialog.set_directory(dir); } }
        Ok(dialog.add_filter("SQLite backup", &["sqlite3"]).pick_file().map(|p| p.to_string_lossy().into_owned()))
    }
    #[cfg(not(windows))]
    {
        let _ = app;
        Err("Native database backup picker is currently available on Windows.".into())
    }
}

#[tauri::command]
fn db_restore_from_backup(app: AppHandle, state: State<'_, DbState>, backup: String) -> Result<DbRestoreResult, String> {
    let backup_path = PathBuf::from(backup);
    validate_backup_file(&backup_path)?;
    let live_path = db_path(&app)?;

    // Preserve the damaged live database (and any WAL/SHM sidecars) before replacing its pages.
    let preserved = preserve_live_database(&live_path)?;

    let source = Connection::open(&backup_path).map_err(|e| format!("Could not open verified backup: {e}"))?;
    configure(&source)?;
    let mut live = state.0.lock().map_err(|_| "Database lock poisoned".to_string())?;
    {
        let backup_op = Backup::new(&source, &mut *live).map_err(|e| format!("Could not restore backup into live database: {e}"))?;
        backup_op.run_to_completion(64, std::time::Duration::from_millis(8), None)
            .map_err(|e| format!("Restore failed: {e}"))?;
    }
    configure(&live)?;
    migrate(&live)?;
    live.execute_batch("PRAGMA wal_checkpoint(TRUNCATE); PRAGMA optimize;").map_err(|e| e.to_string())?;
    let integrity: String = live.query_row("PRAGMA integrity_check", [], |r| r.get(0)).map_err(|e| e.to_string())?;
    if integrity != "ok" { return Err(format!("Restore completed but integrity check failed: {integrity}")); }
    let records: i64 = live.query_row("SELECT COUNT(*) FROM records", [], |r| r.get(0)).map_err(|e| e.to_string())?;
    Ok(DbRestoreResult { restored_from: backup_path.to_string_lossy().into_owned(), preserved_damaged_copy: preserved.to_string_lossy().into_owned(), integrity, records })
}


#[tauri::command]
fn choose_export_directory() -> Result<Option<String>, String> {
    #[cfg(windows)]
    {
        Ok(rfd::FileDialog::new()
            .set_title("Choose LifeOS export folder")
            .pick_folder()
            .map(|path| path.to_string_lossy().into_owned()))
    }

    #[cfg(not(windows))]
    {
        Err("Native Windows folder picker is only available on Windows.".into())
    }
}

#[tauri::command]
fn save_export_file(
    root: String,
    subfolder: String,
    filename: String,
    bytes: Vec<u8>,
) -> Result<String, String> {
    use std::path::Path;

    if root.trim().is_empty() {
        return Err("Export folder is not selected.".into());
    }

    let safe_filename = Path::new(&filename)
        .file_name()
        .and_then(|v| v.to_str())
        .ok_or_else(|| "Invalid export filename.".to_string())?;

    if safe_filename != filename || safe_filename.is_empty() {
        return Err("Invalid export filename.".into());
    }

    let folder_name = subfolder.trim();
    if !matches!(folder_name, "Word" | "Excel" | "PDF" | "Backup") {
        return Err("Invalid export folder.".into());
    }

    let root_path = PathBuf::from(root);
    if !root_path.is_dir() {
        return Err("Connected export folder no longer exists.".into());
    }

    let target_dir = root_path.join(folder_name);
    fs::create_dir_all(&target_dir).map_err(|e| format!("Could not create {} folder: {}", folder_name, e))?;

    let target = target_dir.join(safe_filename);
    fs::write(&target, bytes)
        .map_err(|e| format!("Could not save {}: {}", safe_filename, e))?;

    Ok(target.to_string_lossy().into_owned())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let path = db_path(app.handle())?;
            let conn = Connection::open(path)?;
            configure(&conn).map_err(std::io::Error::other)?;
            migrate(&conn).map_err(std::io::Error::other)?;
            app.manage(DbState(Mutex::new(conn)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            db_init, db_total_count, db_upsert_record, db_upsert_records, db_delete_record, db_delete_records, db_backup_to, db_auto_backup, db_list_records, db_list_record_ids,
            db_count_records, db_search_records, db_finance_summary, db_get_record, db_set_meta, db_get_meta, db_get_meta_stamp,
            db_checkpoint, db_integrity_check, choose_database_backup, db_restore_from_backup, choose_export_directory, save_export_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running ॐ");
}
