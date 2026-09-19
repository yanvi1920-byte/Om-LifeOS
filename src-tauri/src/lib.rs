use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf, sync::Mutex};
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
            ON CONFLICT(key) DO UPDATE SET value='1', updated_at=excluded.updated_at;"
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
fn db_list_records(state: State<'_, DbState>, section: String, limit: i64, offset: i64, from_date: Option<String>, to_date: Option<String>) -> Result<Vec<DbRecord>, String> {
    let conn = state.0.lock().map_err(|_| "Database lock poisoned".to_string())?;
    let limit = limit.clamp(1, 1000);
    let offset = offset.max(0);
    let mut out = Vec::new();
    match (from_date, to_date) {
        (Some(from), Some(to)) => {
            let mut st = conn.prepare("SELECT section,record_id,date_key,updated_at,payload FROM records WHERE section=?1 AND date_key>=?2 AND date_key<=?3 ORDER BY date_key DESC, updated_at DESC LIMIT ?4 OFFSET ?5").map_err(|e| e.to_string())?;
            let rows = st.query_map(params![section, from, to, limit, offset], |r| Ok(DbRecord{section:r.get(0)?,record_id:r.get(1)?,date_key:r.get(2)?,updated_at:r.get(3)?,payload:r.get(4)?})).map_err(|e| e.to_string())?;
            for row in rows { out.push(row.map_err(|e| e.to_string())?); }
        }
        _ => {
            let mut st = conn.prepare("SELECT section,record_id,date_key,updated_at,payload FROM records WHERE section=?1 ORDER BY date_key DESC, updated_at DESC LIMIT ?2 OFFSET ?3").map_err(|e| e.to_string())?;
            let rows = st.query_map(params![section, limit, offset], |r| Ok(DbRecord{section:r.get(0)?,record_id:r.get(1)?,date_key:r.get(2)?,updated_at:r.get(3)?,payload:r.get(4)?})).map_err(|e| e.to_string())?;
            for row in rows { out.push(row.map_err(|e| e.to_string())?); }
        }
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
fn db_checkpoint(state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|_| "Database lock poisoned".to_string())?;
    conn.execute_batch("PRAGMA wal_checkpoint(PASSIVE); PRAGMA optimize;").map_err(|e| e.to_string())
}

#[tauri::command]
fn db_integrity_check(state: State<'_, DbState>) -> Result<String, String> {
    let conn = state.0.lock().map_err(|_| "Database lock poisoned".to_string())?;
    conn.query_row("PRAGMA integrity_check", [], |r| r.get(0)).map_err(|e| e.to_string())
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
            db_init, db_upsert_record, db_upsert_records, db_delete_record, db_list_records, db_list_record_ids,
            db_count_records, db_search_records, db_get_record, db_set_meta, db_get_meta,
            db_checkpoint, db_integrity_check
        ])
        .run(tauri::generate_context!())
        .expect("error while running ॐ");
}
