-- 勤務先テーブル
CREATE TABLE IF NOT EXISTS workplaces (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL UNIQUE,
    color      TEXT NOT NULL DEFAULT '#2563eb',
    sort_order INTEGER NOT NULL DEFAULT 0
);

-- work_entries に勤務先 FK を追加（冪等性は init_db 側でチェック）
-- ALTER TABLE work_entries ADD COLUMN workplace_id INTEGER REFERENCES workplaces(id);
