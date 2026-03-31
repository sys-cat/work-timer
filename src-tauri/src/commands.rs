use chrono::{Local, NaiveTime};
use serde::{Deserialize, Serialize};
use sqlx::sqlite::{SqlitePool, SqlitePoolOptions};
use sqlx::Row;
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::State;
use tokio::sync::Mutex;

// ─── State ───────────────────────────────────────────────────────

pub struct AppState {
    pub db: Arc<Mutex<SqlitePool>>,
    pub data_dir: PathBuf,
}

// ─── Models ──────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone, sqlx::FromRow)]
pub struct WorkEntry {
    pub id: i64,
    pub work_date: String,
    pub start_time: String,
    pub end_time: Option<String>,
    pub duration_minutes: i64,
    pub note: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DailySummary {
    pub work_date: String,
    pub entries: Vec<WorkEntry>,
    pub total_minutes: i64,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct MonthlyClose {
    pub id: i64,
    pub year_month: String,
    pub closed_at: String,
    pub total_minutes: i64,
    pub working_days: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MonthlyReport {
    pub year_month: String,
    pub daily_summaries: Vec<DailySummary>,
    pub total_minutes: i64,
    pub working_days: i64,
    pub is_closed: bool,
}

// ─── DB初期化 ─────────────────────────────────────────────────────

pub async fn init_db(data_dir: &PathBuf) -> Result<SqlitePool, anyhow::Error> {
    fs::create_dir_all(data_dir)?;
    let db_path = data_dir.join("work_timer.db");
    let db_url = format!("sqlite:{}?mode=rwc", db_path.to_string_lossy());

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect(&db_url)
        .await?;

    // マイグレーション実行
    let migration_sql = include_str!("../migrations/001_init.sql");
    for statement in migration_sql.split(';') {
        let trimmed = statement.trim();
        if !trimmed.is_empty() {
            sqlx::query(trimmed).execute(&pool).await?;
        }
    }

    Ok(pool)
}

// ─── ヘルパー ─────────────────────────────────────────────────────

fn calc_duration_minutes(start: &str, end: &str) -> i64 {
    let s = NaiveTime::parse_from_str(start, "%H:%M:%S")
        .or_else(|_| NaiveTime::parse_from_str(start, "%H:%M"))
        .unwrap_or(NaiveTime::from_hms_opt(0, 0, 0).unwrap());
    let e = NaiveTime::parse_from_str(end, "%H:%M:%S")
        .or_else(|_| NaiveTime::parse_from_str(end, "%H:%M"))
        .unwrap_or(NaiveTime::from_hms_opt(0, 0, 0).unwrap());
    let dur = e.signed_duration_since(s);
    dur.num_minutes().max(0)
}

fn format_minutes(minutes: i64) -> String {
    let h = minutes / 60;
    let m = minutes % 60;
    format!("{}:{:02}", h, m)
}

// ─── Commands ────────────────────────────────────────────────────

/// 打刻開始（リアルタイム）
#[tauri::command]
pub async fn clock_in(state: State<'_, AppState>) -> Result<WorkEntry, String> {
    let db = state.db.lock().await;
    let now = Local::now();
    let work_date = now.format("%Y-%m-%d").to_string();
    let start_time = now.format("%H:%M:%S").to_string();

    let result = sqlx::query(
        "INSERT INTO work_entries (work_date, start_time, note) VALUES ($1, $2, '') RETURNING *",
    )
    .bind(&work_date)
    .bind(&start_time)
    .fetch_one(&*db)
    .await
    .map_err(|e| e.to_string())?;

    Ok(WorkEntry {
        id: result.get("id"),
        work_date: result.get("work_date"),
        start_time: result.get("start_time"),
        end_time: result.get("end_time"),
        duration_minutes: result.get("duration_minutes"),
        note: result.get("note"),
        created_at: result.get("created_at"),
        updated_at: result.get("updated_at"),
    })
}

/// 打刻終了（リアルタイム）
#[tauri::command]
pub async fn clock_out(state: State<'_, AppState>, entry_id: i64) -> Result<WorkEntry, String> {
    let db = state.db.lock().await;
    let now = Local::now();
    let end_time = now.format("%H:%M:%S").to_string();

    // まず対象エントリの開始時刻を取得
    let entry: WorkEntry = sqlx::query_as("SELECT * FROM work_entries WHERE id = $1")
        .bind(entry_id)
        .fetch_one(&*db)
        .await
        .map_err(|e| e.to_string())?;

    let duration = calc_duration_minutes(&entry.start_time, &end_time);

    sqlx::query(
        "UPDATE work_entries SET end_time = $1, duration_minutes = $2, updated_at = datetime('now', 'localtime') WHERE id = $3",
    )
    .bind(&end_time)
    .bind(duration)
    .bind(entry_id)
    .execute(&*db)
    .await
    .map_err(|e| e.to_string())?;

    let updated: WorkEntry = sqlx::query_as("SELECT * FROM work_entries WHERE id = $1")
        .bind(entry_id)
        .fetch_one(&*db)
        .await
        .map_err(|e| e.to_string())?;

    Ok(updated)
}

/// 手動エントリ追加
#[tauri::command]
pub async fn add_manual_entry(
    state: State<'_, AppState>,
    work_date: String,
    start_time: String,
    end_time: String,
    note: String,
) -> Result<WorkEntry, String> {
    let db = state.db.lock().await;
    let duration = calc_duration_minutes(&start_time, &end_time);

    let result = sqlx::query(
        "INSERT INTO work_entries (work_date, start_time, end_time, duration_minutes, note) VALUES ($1, $2, $3, $4, $5) RETURNING *",
    )
    .bind(&work_date)
    .bind(&start_time)
    .bind(&end_time)
    .bind(duration)
    .bind(&note)
    .fetch_one(&*db)
    .await
    .map_err(|e| e.to_string())?;

    Ok(WorkEntry {
        id: result.get("id"),
        work_date: result.get("work_date"),
        start_time: result.get("start_time"),
        end_time: result.get("end_time"),
        duration_minutes: result.get("duration_minutes"),
        note: result.get("note"),
        created_at: result.get("created_at"),
        updated_at: result.get("updated_at"),
    })
}

/// エントリ削除
#[tauri::command]
pub async fn delete_entry(state: State<'_, AppState>, entry_id: i64) -> Result<(), String> {
    let db = state.db.lock().await;
    sqlx::query("DELETE FROM work_entries WHERE id = $1")
        .bind(entry_id)
        .execute(&*db)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// 特定日の勤務記録を取得
#[tauri::command]
pub async fn get_daily_entries(
    state: State<'_, AppState>,
    work_date: String,
) -> Result<DailySummary, String> {
    let db = state.db.lock().await;
    let entries: Vec<WorkEntry> =
        sqlx::query_as("SELECT * FROM work_entries WHERE work_date = $1 ORDER BY start_time")
            .bind(&work_date)
            .fetch_all(&*db)
            .await
            .map_err(|e| e.to_string())?;

    let total_minutes: i64 = entries.iter().map(|e| e.duration_minutes).sum();

    Ok(DailySummary {
        work_date,
        entries,
        total_minutes,
    })
}

/// 月次レポート取得
#[tauri::command]
pub async fn get_monthly_report(
    state: State<'_, AppState>,
    year_month: String,
) -> Result<MonthlyReport, String> {
    let db = state.db.lock().await;
    let pattern = format!("{}%", year_month);

    let entries: Vec<WorkEntry> =
        sqlx::query_as("SELECT * FROM work_entries WHERE work_date LIKE $1 ORDER BY work_date, start_time")
            .bind(&pattern)
            .fetch_all(&*db)
            .await
            .map_err(|e| e.to_string())?;

    // 日付ごとにグループ化
    let mut daily_map: std::collections::BTreeMap<String, Vec<WorkEntry>> =
        std::collections::BTreeMap::new();
    for entry in entries {
        daily_map
            .entry(entry.work_date.clone())
            .or_default()
            .push(entry);
    }

    let mut daily_summaries = Vec::new();
    let mut total_minutes: i64 = 0;

    for (date, day_entries) in &daily_map {
        let day_total: i64 = day_entries.iter().map(|e| e.duration_minutes).sum();
        total_minutes += day_total;
        daily_summaries.push(DailySummary {
            work_date: date.clone(),
            entries: day_entries.clone(),
            total_minutes: day_total,
        });
    }

    // 締め済みかチェック
    let is_closed: bool =
        sqlx::query("SELECT id FROM monthly_closes WHERE year_month = $1")
            .bind(&year_month)
            .fetch_optional(&*db)
            .await
            .map_err(|e| e.to_string())?
            .is_some();

    Ok(MonthlyReport {
        year_month,
        daily_summaries,
        total_minutes,
        working_days: daily_map.len() as i64,
        is_closed,
    })
}

/// 月次締め処理
#[tauri::command]
pub async fn close_month(
    state: State<'_, AppState>,
    year_month: String,
) -> Result<MonthlyClose, String> {
    let db = state.db.lock().await;

    // 既に締め済みかチェック
    let existing = sqlx::query("SELECT id FROM monthly_closes WHERE year_month = $1")
        .bind(&year_month)
        .fetch_optional(&*db)
        .await
        .map_err(|e| e.to_string())?;

    if existing.is_some() {
        return Err(format!("{} は既に締め処理済みです", year_month));
    }

    // 進行中のエントリがないかチェック
    let pattern = format!("{}%", year_month);
    let open_entries: Vec<WorkEntry> = sqlx::query_as(
        "SELECT * FROM work_entries WHERE work_date LIKE $1 AND end_time IS NULL",
    )
    .bind(&pattern)
    .fetch_all(&*db)
    .await
    .map_err(|e| e.to_string())?;

    if !open_entries.is_empty() {
        return Err("未完了の勤務記録があります。すべての勤務を終了してから締め処理を行ってください。".to_string());
    }

    // 月の合計を算出
    let row = sqlx::query(
        "SELECT COALESCE(SUM(duration_minutes), 0) as total, COUNT(DISTINCT work_date) as days FROM work_entries WHERE work_date LIKE $1",
    )
    .bind(&pattern)
    .fetch_one(&*db)
    .await
    .map_err(|e| e.to_string())?;

    let total_minutes: i64 = row.get("total");
    let working_days: i64 = row.get("days");

    sqlx::query(
        "INSERT INTO monthly_closes (year_month, total_minutes, working_days) VALUES ($1, $2, $3)",
    )
    .bind(&year_month)
    .bind(total_minutes)
    .bind(working_days)
    .execute(&*db)
    .await
    .map_err(|e| e.to_string())?;

    let close: MonthlyClose =
        sqlx::query_as("SELECT * FROM monthly_closes WHERE year_month = $1")
            .bind(&year_month)
            .fetch_one(&*db)
            .await
            .map_err(|e| e.to_string())?;

    Ok(close)
}

/// CSVエクスポート
#[tauri::command]
pub async fn export_csv(
    state: State<'_, AppState>,
    year_month: String,
    file_path: String,
) -> Result<String, String> {
    let db = state.db.lock().await;
    let pattern = format!("{}%", year_month);

    let entries: Vec<WorkEntry> =
        sqlx::query_as("SELECT * FROM work_entries WHERE work_date LIKE $1 ORDER BY work_date, start_time")
            .bind(&pattern)
            .fetch_all(&*db)
            .await
            .map_err(|e| e.to_string())?;

    let mut wtr = csv::Writer::from_path(&file_path).map_err(|e| e.to_string())?;

    // ヘッダー
    wtr.write_record(&["日付", "開始時刻", "終了時刻", "勤務時間(分)", "勤務時間", "メモ"])
        .map_err(|e| e.to_string())?;

    let mut daily_totals: std::collections::BTreeMap<String, i64> =
        std::collections::BTreeMap::new();
    let mut grand_total: i64 = 0;

    for entry in &entries {
        let formatted_duration = format_minutes(entry.duration_minutes);
        wtr.write_record(&[
            &entry.work_date,
            &entry.start_time,
            entry.end_time.as_deref().unwrap_or(""),
            &entry.duration_minutes.to_string(),
            &formatted_duration,
            &entry.note,
        ])
        .map_err(|e| e.to_string())?;

        *daily_totals.entry(entry.work_date.clone()).or_default() += entry.duration_minutes;
        grand_total += entry.duration_minutes;
    }

    // 空行
    wtr.write_record(&["", "", "", "", "", ""])
        .map_err(|e| e.to_string())?;

    // 日ごとの合計
    wtr.write_record(&["--- 日別合計 ---", "", "", "", "", ""])
        .map_err(|e| e.to_string())?;
    for (date, minutes) in &daily_totals {
        wtr.write_record(&[
            date.as_str(),
            "",
            "",
            &minutes.to_string(),
            &format_minutes(*minutes),
            "",
        ])
        .map_err(|e| e.to_string())?;
    }

    // 月合計
    wtr.write_record(&["", "", "", "", "", ""])
        .map_err(|e| e.to_string())?;
    wtr.write_record(&[
        &format!("月合計 ({})", year_month),
        "",
        "",
        &grand_total.to_string(),
        &format_minutes(grand_total),
        &format!("勤務日数: {}日", daily_totals.len()),
    ])
    .map_err(|e| e.to_string())?;

    wtr.flush().map_err(|e| e.to_string())?;

    Ok(file_path)
}

/// 年次ダンプ（1年分のデータをJSONファイルに出力）
#[tauri::command]
pub async fn dump_yearly(
    state: State<'_, AppState>,
    year: i32,
    file_path: String,
) -> Result<String, String> {
    let db = state.db.lock().await;
    let start_date = format!("{}-01-01", year);
    let end_date = format!("{}-12-31", year);

    let entries: Vec<WorkEntry> = sqlx::query_as(
        "SELECT * FROM work_entries WHERE work_date >= $1 AND work_date <= $2 ORDER BY work_date, start_time",
    )
    .bind(&start_date)
    .bind(&end_date)
    .fetch_all(&*db)
    .await
    .map_err(|e| e.to_string())?;

    let closes: Vec<MonthlyClose> = sqlx::query_as(
        "SELECT * FROM monthly_closes WHERE year_month LIKE $1 ORDER BY year_month",
    )
    .bind(format!("{}%", year))
    .fetch_all(&*db)
    .await
    .map_err(|e| e.to_string())?;

    let dump = serde_json::json!({
        "year": year,
        "dumped_at": Local::now().to_rfc3339(),
        "entries": entries,
        "monthly_closes": closes,
    });

    fs::write(&file_path, serde_json::to_string_pretty(&dump).unwrap())
        .map_err(|e| e.to_string())?;

    // ダンプ記録を保存
    sqlx::query(
        "INSERT OR REPLACE INTO yearly_dumps (year, file_path) VALUES ($1, $2)",
    )
    .bind(year)
    .bind(&file_path)
    .execute(&*db)
    .await
    .map_err(|e| e.to_string())?;

    Ok(file_path)
}

/// 進行中のエントリ取得（打刻中かどうかの確認用）
#[tauri::command]
pub async fn get_active_entry(state: State<'_, AppState>) -> Result<Option<WorkEntry>, String> {
    let db = state.db.lock().await;
    let today = Local::now().format("%Y-%m-%d").to_string();

    let entry: Option<WorkEntry> = sqlx::query_as(
        "SELECT * FROM work_entries WHERE work_date = $1 AND end_time IS NULL ORDER BY start_time DESC LIMIT 1",
    )
    .bind(&today)
    .fetch_optional(&*db)
    .await
    .map_err(|e| e.to_string())?;

    Ok(entry)
}

/// 今日の日付を取得
#[tauri::command]
pub fn get_today() -> String {
    Local::now().format("%Y-%m-%d").to_string()
}

/// 現在時刻を取得
#[tauri::command]
pub fn get_current_time() -> String {
    Local::now().format("%H:%M:%S").to_string()
}
