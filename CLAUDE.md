# Work Timer - CLAUDE.md

## プロジェクト概要

Tauri 2.x + React + TypeScript + SQLite で構築された**勤務時間管理デスクトップアプリ**。
打刻（出退勤記録）・手動入力・月次管理・CSV出力を提供する。

## 技術スタック

| レイヤー | 技術 |
|---------|------|
| フレームワーク | Tauri 2.x |
| フロントエンド | React 18 + TypeScript + Vite 5 |
| バックエンド | Rust (Tauri commands) |
| データベース | SQLite (sqlx 0.8, async) |
| IPC | Tauri invoke API |
| ファイル操作 | tauri-plugin-fs, tauri-plugin-dialog |

## ディレクトリ構造

```
work-timer/
├── src/                        # フロントエンド（React + TypeScript）
│   ├── main.tsx               # React エントリポイント
│   ├── App.tsx                # ルートコンポーネント（3タブナビゲーション）
│   ├── index.css              # グローバルスタイル（CSS Variables）
│   ├── types/index.ts         # 共通型定義
│   ├── lib/api.ts             # Tauri invoke ラッパー + ユーティリティ
│   └── components/
│       ├── TimerPanel.tsx     # 打刻・リアルタイム計測画面
│       ├── MonthlyView.tsx    # 月次管理・レポート表示画面
│       └── ManualEntry.tsx    # 手動入力フォーム画面
└── src-tauri/                 # バックエンド（Rust）
    ├── Cargo.toml             # Rust 依存関係
    ├── tauri.conf.json        # Tauri アプリ設定
    ├── src/
    │   ├── main.rs            # Tauri 初期化・コマンド登録
    │   └── commands.rs        # Tauri コマンド実装（11コマンド）
    └── migrations/
        └── 001_init.sql       # SQLite スキーマ
```

## 開発コマンド

```bash
# 開発モード（Tauri + Vite 同時起動）
npm run tauri dev

# プロダクションビルド
npm run tauri build

# フロントエンドのみ開発サーバー
npm run dev

# TypeScript + Vite ビルド（フロントのみ）
npm run build
```

## アーキテクチャ

### フロントエンド → バックエンド通信

`src/lib/api.ts` に Tauri `invoke` のラッパーをまとめた `api` オブジェクトを定義。
コンポーネントは直接 `invoke` を呼ばず、必ず `api.*` 経由で呼び出す。

```typescript
// Good
const entry = await api.clockIn();

// Bad - 直接invokeは使わない
const entry = await invoke<WorkEntry>("clock_in");
```

### バックエンドコマンド一覧（commands.rs）

| コマンド名 | 処理 |
|-----------|------|
| `clock_in` | 打刻開始（現在時刻でエントリ作成） |
| `clock_out` | 打刻終了（終了時刻・経過時間を計算・保存） |
| `add_manual_entry` | 手動エントリ追加 |
| `delete_entry` | エントリ削除 |
| `get_daily_entries` | 日別エントリ取得 |
| `get_monthly_report` | 月間レポート生成 |
| `close_month` | 月次締め処理 |
| `export_csv` | CSV出力 |
| `dump_yearly` | 年次ダンプ（JSON） |
| `get_active_entry` | 勤務中エントリ取得 |
| `get_today` | 今日の日付取得 |
| `get_current_time` | 現在時刻取得 |

### データベーススキーマ

```sql
-- 勤務記録（複数セッション対応）
work_entries: id, work_date(TEXT), start_time(TEXT), end_time(TEXT|NULL), duration_minutes, note, created_at, updated_at

-- 月次締め記録
monthly_closes: id, year_month(TEXT UNIQUE), closed_at, total_minutes, working_days

-- 年次ダンプ記録
yearly_dumps: id, year(INTEGER UNIQUE), dumped_at, file_path
```

- `end_time` が NULL = 現在勤務中
- 日付は `YYYY-MM-DD`、時刻は `HH:MM:SS` のテキスト形式
- `work_date` にインデックスあり

## 型定義（src/types/index.ts）

```typescript
WorkEntry      // 単一勤務セッション
DailySummary   // 1日の複数セッションと合計
MonthlyClose   // 月次締め記録
MonthlyReport  // 月次レポート（is_closed含む）
```

## スタイルガイド

- CSS Variables を使用（`--bg`, `--accent`, `--text` など）
- ダークモード対応済み（`@media (prefers-color-scheme: dark)`）
- 定義済みクラス: `.btn-primary`, `.btn-danger`, `.btn-success`, `.btn-ghost`, `.card`, `.badge`, `.mono`
- 日本語フォント優先: `Hiragino Kaku Gothic ProN`, `Noto Sans JP`
- コンポーネント固有スタイルはコンポーネントファイル内に `<style>` タグで記述

## TypeScript 設定

- `strict: true` （厳格モード）
- `noUnusedLocals: true`, `noUnusedParameters: true`
- `target: ES2021`
- `moduleResolution: "bundler"`

## 注意事項

- Rust の非同期処理は `tokio` の `async/await` ベース
- DB接続は `Arc<Mutex<SqlitePool>>` で管理（AppState）
- 新しいコマンドを追加したら `main.rs` の `invoke_handler` に登録が必要
- マイグレーションは `src-tauri/migrations/` に追番で追加（`002_xxx.sql` など）
- Tauri v2 のプラグイン API は `@tauri-apps/plugin-*` パッケージを使用
