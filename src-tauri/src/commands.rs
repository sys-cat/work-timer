use chrono::{Duration, Local, NaiveTime};
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
    pub workplace_id: Option<i64>,
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

#[derive(Debug, Serialize, Deserialize, Clone, sqlx::FromRow)]
pub struct Workplace {
    pub id: i64,
    pub name: String,
    pub color: String,
    pub sort_order: i64,
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

    // 001: 基本スキーマ
    let migration_sql = include_str!("../migrations/001_init.sql");
    for statement in migration_sql.split(';') {
        let trimmed = statement.trim();
        if !trimmed.is_empty() {
            sqlx::query(trimmed).execute(&pool).await?;
        }
    }

    // 002: workplaces テーブル
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS workplaces (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            name       TEXT NOT NULL UNIQUE,
            color      TEXT NOT NULL DEFAULT '#2563eb',
            sort_order INTEGER NOT NULL DEFAULT 0
        )",
    )
    .execute(&pool)
    .await?;

    // workplace_id カラムが未追加の場合のみ ALTER TABLE を実行
    let col_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM pragma_table_info('work_entries') WHERE name = 'workplace_id'",
    )
    .fetch_one(&pool)
    .await?;
    if col_count == 0 {
        sqlx::query(
            "ALTER TABLE work_entries ADD COLUMN workplace_id INTEGER REFERENCES workplaces(id)",
        )
        .execute(&pool)
        .await?;
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

/// end < start のとき翌日として扱う（日またぎ退勤専用）
fn calc_duration_minutes_overnight(start: &str, end: &str) -> i64 {
    let s = NaiveTime::parse_from_str(start, "%H:%M:%S")
        .or_else(|_| NaiveTime::parse_from_str(start, "%H:%M"))
        .unwrap_or(NaiveTime::from_hms_opt(0, 0, 0).unwrap());
    let e = NaiveTime::parse_from_str(end, "%H:%M:%S")
        .or_else(|_| NaiveTime::parse_from_str(end, "%H:%M"))
        .unwrap_or(NaiveTime::from_hms_opt(0, 0, 0).unwrap());
    let minutes = e.signed_duration_since(s).num_minutes();
    if minutes <= 0 {
        minutes + 1440
    } else {
        minutes
    }
}

fn format_minutes(minutes: i64) -> String {
    let h = minutes / 60;
    let m = minutes % 60;
    format!("{}:{:02}", h, m)
}

// ─── Commands ────────────────────────────────────────────────────

/// 打刻開始（リアルタイム）
#[tauri::command]
pub async fn clock_in(
    state: State<'_, AppState>,
    workplace_id: Option<i64>,
) -> Result<WorkEntry, String> {
    let db = state.db.lock().await;
    let now = Local::now();
    let work_date = now.format("%Y-%m-%d").to_string();
    let start_time = now.format("%H:%M:%S").to_string();

    let result = sqlx::query(
        "INSERT INTO work_entries (work_date, start_time, note, workplace_id) VALUES ($1, $2, '', $3) RETURNING *",
    )
    .bind(&work_date)
    .bind(&start_time)
    .bind(workplace_id)
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
        workplace_id: result.get("workplace_id"),
    })
}

/// 打刻終了（リアルタイム）
#[tauri::command]
pub async fn clock_out(state: State<'_, AppState>, entry_id: i64) -> Result<WorkEntry, String> {
    let db = state.db.lock().await;
    let now = Local::now();
    let today = now.format("%Y-%m-%d").to_string();
    let end_time = now.format("%H:%M:%S").to_string();

    // まず対象エントリを取得
    let entry: WorkEntry = sqlx::query_as("SELECT * FROM work_entries WHERE id = $1")
        .bind(entry_id)
        .fetch_one(&*db)
        .await
        .map_err(|e| e.to_string())?;

    if entry.work_date == today {
        // 通常退勤（同日）
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
    } else {
        // 日をまたいだ退勤: 前日エントリを00:00:00で締め、当日エントリを新規作成
        let midnight = "00:00:00";

        // 前日分: end(00:00:00) < start のため overnight 専用関数で計算
        let duration_prev = calc_duration_minutes_overnight(&entry.start_time, midnight);
        sqlx::query(
            "UPDATE work_entries SET end_time = $1, duration_minutes = $2, updated_at = datetime('now', 'localtime') WHERE id = $3",
        )
        .bind(midnight)
        .bind(duration_prev)
        .bind(entry_id)
        .execute(&*db)
        .await
        .map_err(|e| e.to_string())?;

        let duration_today = calc_duration_minutes(midnight, &end_time);
        let result = sqlx::query(
            "INSERT INTO work_entries (work_date, start_time, end_time, duration_minutes, note, workplace_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *",
        )
        .bind(&today)
        .bind(midnight)
        .bind(&end_time)
        .bind(duration_today)
        .bind(&entry.note)
        .bind(entry.workplace_id)
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
            workplace_id: result.get("workplace_id"),
        })
    }
}

/// 手動エントリ追加
#[tauri::command]
pub async fn add_manual_entry(
    state: State<'_, AppState>,
    work_date: String,
    start_time: String,
    end_time: String,
    note: String,
    workplace_id: Option<i64>,
) -> Result<WorkEntry, String> {
    let db = state.db.lock().await;
    let duration = calc_duration_minutes(&start_time, &end_time);

    let result = sqlx::query(
        "INSERT INTO work_entries (work_date, start_time, end_time, duration_minutes, note, workplace_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *",
    )
    .bind(&work_date)
    .bind(&start_time)
    .bind(&end_time)
    .bind(duration)
    .bind(&note)
    .bind(workplace_id)
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
        workplace_id: result.get("workplace_id"),
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
    workplace_id: Option<i64>,
) -> Result<MonthlyReport, String> {
    let db = state.db.lock().await;
    let pattern = format!("{}%", year_month);

    let entries: Vec<WorkEntry> = if let Some(wid) = workplace_id {
        sqlx::query_as(
            "SELECT * FROM work_entries WHERE work_date LIKE $1 AND workplace_id = $2 ORDER BY work_date, start_time",
        )
        .bind(&pattern)
        .bind(wid)
        .fetch_all(&*db)
        .await
        .map_err(|e| e.to_string())?
    } else {
        sqlx::query_as(
            "SELECT * FROM work_entries WHERE work_date LIKE $1 ORDER BY work_date, start_time",
        )
        .bind(&pattern)
        .fetch_all(&*db)
        .await
        .map_err(|e| e.to_string())?
    };

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

// ─── CSV ヘルパー ─────────────────────────────────────────────────

fn write_csv_to_file(
    entries: &[WorkEntry],
    wp_map: &std::collections::HashMap<i64, String>,
    file_path: &str,
    year_month: &str,
) -> Result<String, String> {
    let mut wtr = csv::Writer::from_path(file_path).map_err(|e| e.to_string())?;

    wtr.write_record(&["日付", "開始時刻", "終了時刻", "勤務時間(分)", "勤務時間", "勤務先", "メモ"])
        .map_err(|e| e.to_string())?;

    let mut daily_totals: std::collections::BTreeMap<String, i64> =
        std::collections::BTreeMap::new();
    let mut grand_total: i64 = 0;

    for entry in entries {
        let formatted_duration = format_minutes(entry.duration_minutes);
        let wp_name = entry
            .workplace_id
            .and_then(|id| wp_map.get(&id))
            .map(|s| s.as_str())
            .unwrap_or("");
        wtr.write_record(&[
            &entry.work_date,
            &entry.start_time,
            entry.end_time.as_deref().unwrap_or(""),
            &entry.duration_minutes.to_string(),
            &formatted_duration,
            wp_name,
            &entry.note,
        ])
        .map_err(|e| e.to_string())?;

        *daily_totals.entry(entry.work_date.clone()).or_default() += entry.duration_minutes;
        grand_total += entry.duration_minutes;
    }

    wtr.write_record(&["", "", "", "", "", "", ""])
        .map_err(|e| e.to_string())?;
    wtr.write_record(&["--- 日別合計 ---", "", "", "", "", "", ""])
        .map_err(|e| e.to_string())?;
    for (date, minutes) in &daily_totals {
        wtr.write_record(&[
            date.as_str(),
            "",
            "",
            &minutes.to_string(),
            &format_minutes(*minutes),
            "",
            "",
        ])
        .map_err(|e| e.to_string())?;
    }

    wtr.write_record(&["", "", "", "", "", "", ""])
        .map_err(|e| e.to_string())?;
    wtr.write_record(&[
        &format!("月合計 ({})", year_month),
        "",
        "",
        &grand_total.to_string(),
        &format_minutes(grand_total),
        "",
        &format!("勤務日数: {}日", daily_totals.len()),
    ])
    .map_err(|e| e.to_string())?;

    wtr.flush().map_err(|e| e.to_string())?;
    Ok(file_path.to_string())
}

/// CSVエクスポート（勤務先フィルタ対応）
#[tauri::command]
pub async fn export_csv(
    state: State<'_, AppState>,
    year_month: String,
    file_path: String,
    workplace_id: Option<i64>,
) -> Result<String, String> {
    let db = state.db.lock().await;
    let pattern = format!("{}%", year_month);

    let entries: Vec<WorkEntry> = if let Some(wid) = workplace_id {
        sqlx::query_as(
            "SELECT * FROM work_entries WHERE work_date LIKE $1 AND workplace_id = $2 ORDER BY work_date, start_time",
        )
        .bind(&pattern)
        .bind(wid)
        .fetch_all(&*db)
        .await
        .map_err(|e| e.to_string())?
    } else {
        sqlx::query_as(
            "SELECT * FROM work_entries WHERE work_date LIKE $1 ORDER BY work_date, start_time",
        )
        .bind(&pattern)
        .fetch_all(&*db)
        .await
        .map_err(|e| e.to_string())?
    };

    let workplaces: Vec<Workplace> = sqlx::query_as("SELECT * FROM workplaces")
        .fetch_all(&*db)
        .await
        .map_err(|e| e.to_string())?;
    let wp_map: std::collections::HashMap<i64, String> =
        workplaces.iter().map(|w| (w.id, w.name.clone())).collect();

    write_csv_to_file(&entries, &wp_map, &file_path, &year_month)
}

/// 全勤務先の個別CSVをディレクトリへ出力
#[tauri::command]
pub async fn export_csv_all(
    state: State<'_, AppState>,
    year_month: String,
    dir_path: String,
) -> Result<String, String> {
    let db = state.db.lock().await;
    let pattern = format!("{}%", year_month);

    let workplaces: Vec<Workplace> =
        sqlx::query_as("SELECT * FROM workplaces ORDER BY sort_order, id")
            .fetch_all(&*db)
            .await
            .map_err(|e| e.to_string())?;
    let wp_map: std::collections::HashMap<i64, String> =
        workplaces.iter().map(|w| (w.id, w.name.clone())).collect();

    let all_entries: Vec<WorkEntry> = sqlx::query_as(
        "SELECT * FROM work_entries WHERE work_date LIKE $1 ORDER BY work_date, start_time",
    )
    .bind(&pattern)
    .fetch_all(&*db)
    .await
    .map_err(|e| e.to_string())?;

    let mut file_count = 0;

    for wp in &workplaces {
        let wp_entries: Vec<WorkEntry> = all_entries
            .iter()
            .filter(|e| e.workplace_id == Some(wp.id))
            .cloned()
            .collect();
        if wp_entries.is_empty() {
            continue;
        }
        let safe_name =
            wp.name.replace(['/', '\\', ':', '*', '?', '"', '<', '>', '|'], "_");
        let fp = format!("{}/{}_{}.csv", dir_path, year_month, safe_name);
        write_csv_to_file(&wp_entries, &wp_map, &fp, &year_month)?;
        file_count += 1;
    }

    // 勤務先未設定のエントリ
    let null_entries: Vec<WorkEntry> = all_entries
        .iter()
        .filter(|e| e.workplace_id.is_none())
        .cloned()
        .collect();
    if !null_entries.is_empty() {
        let fp = format!("{}/{}_未設定.csv", dir_path, year_month);
        write_csv_to_file(&null_entries, &wp_map, &fp, &year_month)?;
        file_count += 1;
    }

    Ok(format!("{}件のCSVを出力しました", file_count))
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
    let now = Local::now();
    let today = now.format("%Y-%m-%d").to_string();
    // 日をまたいで勤務中の場合に備えて昨日も検索対象にする
    let yesterday = (now - Duration::days(1)).format("%Y-%m-%d").to_string();

    let entry: Option<WorkEntry> = sqlx::query_as(
        "SELECT * FROM work_entries WHERE work_date IN ($1, $2) AND end_time IS NULL ORDER BY work_date DESC, start_time DESC LIMIT 1",
    )
    .bind(&today)
    .bind(&yesterday)
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

/// 完了済みエントリの duration_minutes を start_time / end_time から再計算して更新
/// 戻り値: 更新した件数
#[tauri::command]
pub async fn recalculate_durations(state: State<'_, AppState>) -> Result<i64, String> {
    let db = state.db.lock().await;

    let entries: Vec<WorkEntry> =
        sqlx::query_as("SELECT * FROM work_entries WHERE end_time IS NOT NULL")
            .fetch_all(&*db)
            .await
            .map_err(|e| e.to_string())?;

    let mut updated: i64 = 0;
    for entry in &entries {
        let end = entry.end_time.as_deref().unwrap();
        // end < start なら日またぎエントリとして扱う
        let new_duration = if end < entry.start_time.as_str() {
            calc_duration_minutes_overnight(&entry.start_time, end)
        } else {
            calc_duration_minutes(&entry.start_time, end)
        };

        if new_duration != entry.duration_minutes {
            sqlx::query(
                "UPDATE work_entries SET duration_minutes = $1, updated_at = datetime('now', 'localtime') WHERE id = $2",
            )
            .bind(new_duration)
            .bind(entry.id)
            .execute(&*db)
            .await
            .map_err(|e| e.to_string())?;
            updated += 1;
        }
    }

    Ok(updated)
}

/// 完了済みエントリの時刻・勤務先・メモを更新
#[tauri::command]
pub async fn update_entry(
    state: State<'_, AppState>,
    entry_id: i64,
    start_time: String,
    end_time: String,
    note: String,
    workplace_id: Option<i64>,
) -> Result<WorkEntry, String> {
    let db = state.db.lock().await;

    let duration = if end_time.as_str() < start_time.as_str() {
        calc_duration_minutes_overnight(&start_time, &end_time)
    } else {
        calc_duration_minutes(&start_time, &end_time)
    };

    sqlx::query(
        "UPDATE work_entries SET start_time = $1, end_time = $2, duration_minutes = $3, note = $4, workplace_id = $5, updated_at = datetime('now', 'localtime') WHERE id = $6",
    )
    .bind(&start_time)
    .bind(&end_time)
    .bind(duration)
    .bind(&note)
    .bind(workplace_id)
    .bind(entry_id)
    .execute(&*db)
    .await
    .map_err(|e| e.to_string())?;

    let entry: WorkEntry = sqlx::query_as("SELECT * FROM work_entries WHERE id = $1")
        .bind(entry_id)
        .fetch_one(&*db)
        .await
        .map_err(|e| e.to_string())?;

    Ok(entry)
}

// ─── Workplace Commands ───────────────────────────────────────────

/// 勤務先一覧取得
#[tauri::command]
pub async fn get_workplaces(state: State<'_, AppState>) -> Result<Vec<Workplace>, String> {
    let db = state.db.lock().await;
    let workplaces: Vec<Workplace> =
        sqlx::query_as("SELECT * FROM workplaces ORDER BY sort_order, id")
            .fetch_all(&*db)
            .await
            .map_err(|e| e.to_string())?;
    Ok(workplaces)
}

/// 勤務先追加
#[tauri::command]
pub async fn add_workplace(
    state: State<'_, AppState>,
    name: String,
    color: String,
) -> Result<Workplace, String> {
    let db = state.db.lock().await;
    let row = sqlx::query(
        "INSERT INTO workplaces (name, color, sort_order)
         VALUES ($1, $2, (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM workplaces))
         RETURNING *",
    )
    .bind(&name)
    .bind(&color)
    .fetch_one(&*db)
    .await
    .map_err(|e| e.to_string())?;

    Ok(Workplace {
        id: row.get("id"),
        name: row.get("name"),
        color: row.get("color"),
        sort_order: row.get("sort_order"),
    })
}

/// 勤務先更新
#[tauri::command]
pub async fn update_workplace(
    state: State<'_, AppState>,
    id: i64,
    name: String,
    color: String,
) -> Result<Workplace, String> {
    let db = state.db.lock().await;
    sqlx::query("UPDATE workplaces SET name = $1, color = $2 WHERE id = $3")
        .bind(&name)
        .bind(&color)
        .bind(id)
        .execute(&*db)
        .await
        .map_err(|e| e.to_string())?;

    let workplace: Workplace = sqlx::query_as("SELECT * FROM workplaces WHERE id = $1")
        .bind(id)
        .fetch_one(&*db)
        .await
        .map_err(|e| e.to_string())?;

    Ok(workplace)
}

/// 勤務先削除（紐付きエントリは workplace_id = NULL にしてから削除）
#[tauri::command]
pub async fn delete_workplace(state: State<'_, AppState>, id: i64) -> Result<(), String> {
    let db = state.db.lock().await;

    // 紐付きエントリを未設定に変更
    sqlx::query(
        "UPDATE work_entries SET workplace_id = NULL, updated_at = datetime('now', 'localtime') WHERE workplace_id = $1",
    )
    .bind(id)
    .execute(&*db)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM workplaces WHERE id = $1")
        .bind(id)
        .execute(&*db)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// エントリの勤務先を事後設定
#[tauri::command]
pub async fn set_entry_workplace(
    state: State<'_, AppState>,
    entry_id: i64,
    workplace_id: Option<i64>,
) -> Result<WorkEntry, String> {
    let db = state.db.lock().await;
    sqlx::query(
        "UPDATE work_entries SET workplace_id = $1, updated_at = datetime('now', 'localtime') WHERE id = $2",
    )
    .bind(workplace_id)
    .bind(entry_id)
    .execute(&*db)
    .await
    .map_err(|e| e.to_string())?;

    let entry: WorkEntry = sqlx::query_as("SELECT * FROM work_entries WHERE id = $1")
        .bind(entry_id)
        .fetch_one(&*db)
        .await
        .map_err(|e| e.to_string())?;

    Ok(entry)
}

/// 勤務先の並び順を更新（ids の順序を sort_order に反映）
#[tauri::command]
pub async fn reorder_workplaces(state: State<'_, AppState>, ids: Vec<i64>) -> Result<(), String> {
    let db = state.db.lock().await;
    for (i, id) in ids.iter().enumerate() {
        sqlx::query("UPDATE workplaces SET sort_order = $1 WHERE id = $2")
            .bind(i as i64)
            .bind(id)
            .execute(&*db)
            .await
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ─── Tests ───────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // ── calc_duration_minutes ──────────────────────────────────────

    #[test]
    fn test_duration_basic() {
        assert_eq!(calc_duration_minutes("09:00", "10:30"), 90);
    }

    #[test]
    fn test_duration_with_seconds() {
        assert_eq!(calc_duration_minutes("09:00:00", "10:30:00"), 90);
    }

    #[test]
    fn test_duration_zero() {
        assert_eq!(calc_duration_minutes("09:00", "09:00"), 0);
    }

    #[test]
    fn test_duration_negative_clamps_to_zero() {
        assert_eq!(calc_duration_minutes("10:30", "09:00"), 0);
    }

    #[test]
    fn test_duration_invalid_start_falls_back_to_midnight() {
        // 不正な開始時刻は 00:00:00 にフォールバックするため、終了時刻との差分になる
        assert_eq!(calc_duration_minutes("invalid", "09:00"), 540);
    }

    #[test]
    fn test_duration_mixed_format() {
        // 開始がHH:MM、終了がHH:MM:SS
        assert_eq!(calc_duration_minutes("09:00", "10:30:00"), 90);
    }

    // ── calc_duration_minutes_overnight ────────────────────────────

    #[test]
    fn test_overnight_basic() {
        // 23:00 → 00:00 = 60分（翌日0時まで）
        assert_eq!(calc_duration_minutes_overnight("23:00:00", "00:00:00"), 60);
    }

    #[test]
    fn test_overnight_longer() {
        // 22:30 → 01:00 = 150分
        assert_eq!(calc_duration_minutes_overnight("22:30:00", "01:00:00"), 150);
    }

    #[test]
    fn test_overnight_same_day_still_works() {
        // end > start のときは通常計算
        assert_eq!(calc_duration_minutes_overnight("09:00:00", "10:30:00"), 90);
    }

    #[test]
    fn test_duration_from_midnight() {
        // 日またぎ分割の当日側: 00:00:00 → 退勤時刻
        assert_eq!(calc_duration_minutes("00:00:00", "01:30:00"), 90);
    }

    // ── format_minutes ─────────────────────────────────────────────

    #[test]
    fn test_format_minutes_zero() {
        assert_eq!(format_minutes(0), "0:00");
    }

    #[test]
    fn test_format_minutes_one_hour() {
        assert_eq!(format_minutes(60), "1:00");
    }

    #[test]
    fn test_format_minutes_basic() {
        assert_eq!(format_minutes(90), "1:30");
    }

    #[test]
    fn test_format_minutes_zero_padding() {
        assert_eq!(format_minutes(65), "1:05");
    }

    #[test]
    fn test_format_minutes_large() {
        assert_eq!(format_minutes(1500), "25:00");
    }
}
