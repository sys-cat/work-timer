import { useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { api, formatMinutes, formatTimeShort } from "../lib/api";
import type { MonthlyReport } from "../types";

interface Props {
  yearMonth: string;
  report: MonthlyReport | null;
  onYearMonthChange: (ym: string) => void;
  onRefresh: (ym?: string) => Promise<void>;
  onDeleteEntry: (entryId: number) => Promise<void>;
}

export default function MonthlyView({
  yearMonth,
  report,
  onYearMonthChange,
  onRefresh,
  onDeleteEntry,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const changeMonth = (delta: number) => {
    const [y, m] = yearMonth.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    onYearMonthChange(ym);
  };

  const handleClose = async () => {
    if (
      !confirm(
        `${yearMonth} の勤務を締めます。\n締め処理後はこの月の記録を変更できなくなります。\nよろしいですか？`
      )
    )
      return;
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const result = await api.closeMonth(yearMonth);
      setMessage(
        `${yearMonth} を締めました。合計: ${formatMinutes(result.total_minutes)} (${result.working_days}日)`
      );
      await onRefresh();
    } catch (e) {
      setError(String(e));
    }
    setLoading(false);
  };

  const handleExportCsv = async () => {
    setError("");
    setMessage("");
    try {
      const filePath = await save({
        defaultPath: `勤務表_${yearMonth}.csv`,
        filters: [{ name: "CSV", extensions: ["csv"] }],
      });
      if (!filePath) return;
      const result = await api.exportCsv(yearMonth, filePath);
      setMessage(`CSVを出力しました: ${result}`);
    } catch (e) {
      setError(String(e));
    }
  };

  const handleDumpYearly = async () => {
    const year = Number(yearMonth.split("-")[0]);
    try {
      const filePath = await save({
        defaultPath: `work_timer_dump_${year}.json`,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!filePath) return;
      const result = await api.dumpYearly(year, filePath);
      setMessage(`${year}年のデータをダンプしました: ${result}`);
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {error && (
        <div
          style={{
            padding: "10px 14px",
            background: "var(--danger-light)",
            color: "var(--danger)",
            borderRadius: "var(--radius)",
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}
      {message && (
        <div
          style={{
            padding: "10px 14px",
            background: "var(--success-light)",
            color: "var(--success)",
            borderRadius: "var(--radius)",
            fontSize: 13,
          }}
        >
          {message}
        </div>
      )}

      {/* 月選択 + アクション */}
      <div className="card">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button className="btn-ghost" onClick={() => changeMonth(-1)}>
              ←
            </button>
            <input
              type="month"
              value={yearMonth}
              onChange={(e) => onYearMonthChange(e.target.value)}
              style={{ fontSize: 15, fontWeight: 500, minWidth: 160 }}
            />
            <button className="btn-ghost" onClick={() => changeMonth(1)}>
              →
            </button>
            {report?.is_closed && (
              <span className="badge badge-closed">締め済み</span>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn-ghost" onClick={handleDumpYearly}>
              年次ダンプ
            </button>
            <button className="btn-ghost" onClick={handleExportCsv} disabled={loading}>
              CSV出力
            </button>
            {!report?.is_closed && (
              <button className="btn-primary" onClick={handleClose} disabled={loading}>
                今月の勤務を締める
              </button>
            )}
          </div>
        </div>
      </div>

      {/* サマリー */}
      {report && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <div className="card" style={{ textAlign: "center" }}>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>
              勤務日数
            </div>
            <div className="mono" style={{ fontSize: 24, fontWeight: 400 }}>
              {report.working_days}
              <span style={{ fontSize: 14, color: "var(--text-secondary)" }}> 日</span>
            </div>
          </div>
          <div className="card" style={{ textAlign: "center" }}>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>
              合計勤務時間
            </div>
            <div className="mono" style={{ fontSize: 24, fontWeight: 400 }}>
              {formatMinutes(report.total_minutes)}
            </div>
          </div>
          <div className="card" style={{ textAlign: "center" }}>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>
              1日あたり平均
            </div>
            <div className="mono" style={{ fontSize: 24, fontWeight: 400 }}>
              {report.working_days > 0
                ? formatMinutes(Math.round(report.total_minutes / report.working_days))
                : "0:00"}
            </div>
          </div>
        </div>
      )}

      {/* 日別テーブル */}
      {report && report.daily_summaries.length > 0 ? (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--bg)" }}>
                <th style={thStyle}>日付</th>
                <th style={thStyle}>セッション</th>
                <th style={{ ...thStyle, textAlign: "right" }}>合計</th>
                <th style={{ ...thStyle, width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {report.daily_summaries.map((day) => (
                <tr key={day.work_date} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={tdStyle}>
                    <span className="mono">{day.work_date}</span>
                    <span style={{ marginLeft: 6, fontSize: 11, color: "var(--text-tertiary)" }}>
                      {getDayOfWeek(day.work_date)}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    {day.entries.map((e, i) => (
                      <span key={e.id} className="mono">
                        {i > 0 && (
                          <span style={{ color: "var(--text-tertiary)", margin: "0 4px" }}>/</span>
                        )}
                        {formatTimeShort(e.start_time)}-
                        {e.end_time ? formatTimeShort(e.end_time) : "??:??"}
                        <span style={{ color: "var(--text-tertiary)", fontSize: 11, marginLeft: 2 }}>
                          ({formatMinutes(e.duration_minutes)})
                        </span>
                      </span>
                    ))}
                  </td>
                  <td className="mono" style={{ ...tdStyle, textAlign: "right", fontWeight: 500 }}>
                    {formatMinutes(day.total_minutes)}
                  </td>
                  <td style={tdStyle}>
                    {!report.is_closed &&
                      day.entries.map((e) =>
                        e.end_time ? (
                          <button
                            key={e.id}
                            onClick={() => onDeleteEntry(e.id)}
                            style={{
                              padding: "2px 6px",
                              fontSize: 11,
                              color: "var(--text-tertiary)",
                              background: "transparent",
                            }}
                          >
                            ×
                          </button>
                        ) : null
                      )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: "var(--bg)", fontWeight: 500 }}>
                <td style={tdStyle}>合計</td>
                <td style={tdStyle}>{report.working_days}日</td>
                <td className="mono" style={{ ...tdStyle, textAlign: "right" }}>
                  {formatMinutes(report.total_minutes)}
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <div
          className="card"
          style={{ textAlign: "center", padding: 40, color: "var(--text-tertiary)", fontSize: 13 }}
        >
          この月の勤務記録はありません
        </div>
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: "10px 14px",
  textAlign: "left",
  fontSize: 12,
  fontWeight: 500,
  color: "var(--text-secondary)",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 14px",
  verticalAlign: "top",
};

function getDayOfWeek(dateStr: string): string {
  const days = ["日", "月", "火", "水", "木", "金", "土"];
  const d = new Date(dateStr);
  return `(${days[d.getDay()]})`;
}
