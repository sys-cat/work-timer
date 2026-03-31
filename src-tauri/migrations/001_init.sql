-- 勤務記録テーブル
-- 1日に複数の勤務セッションを記録可能
CREATE TABLE IF NOT EXISTS work_entries (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    -- 勤務日 (YYYY-MM-DD)
    work_date   TEXT NOT NULL,
    -- 開始時刻 (HH:MM:SS)
    start_time  TEXT NOT NULL,
    -- 終了時刻 (HH:MM:SS), NULLの場合は勤務中
    end_time    TEXT,
    -- 勤務時間（分）end_time設定時に計算
    duration_minutes INTEGER DEFAULT 0,
    -- メモ（任意）
    note        TEXT DEFAULT '',
    created_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- 日付でのクエリを高速化
CREATE INDEX IF NOT EXISTS idx_work_entries_date ON work_entries(work_date);

-- 月次締めテーブル
CREATE TABLE IF NOT EXISTS monthly_closes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    -- 対象年月 (YYYY-MM)
    year_month  TEXT NOT NULL UNIQUE,
    -- 締め処理実行日時
    closed_at   TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    -- 月の合計勤務時間（分）
    total_minutes INTEGER NOT NULL DEFAULT 0,
    -- 勤務日数
    working_days INTEGER NOT NULL DEFAULT 0
);

-- 年次ダンプ管理テーブル
CREATE TABLE IF NOT EXISTS yearly_dumps (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    year        INTEGER NOT NULL UNIQUE,
    dumped_at   TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    file_path   TEXT NOT NULL
);
