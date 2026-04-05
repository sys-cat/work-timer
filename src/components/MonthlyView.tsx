import { useState } from "react";
import { save, open } from "@tauri-apps/plugin-dialog";
import { api, formatMinutes, formatTimeShort } from "../lib/api";
import type { MonthlyReport, Workplace } from "../types";

interface Props {
  yearMonth: string;
  report: MonthlyReport | null;
  onYearMonthChange: (ym: string) => void;
  onRefresh: (ym?: string) => Promise<void>;
  onDeleteEntry: (entryId: number) => Promise<void>;
  onSetEntryWorkplace: (entryId: number, workplaceId: number | null) => Promise<void>;
  onEditEntry: (entryId: number, startTime: string, endTime: string, note: string, workplaceId: number | null) => Promise<void>;
  workplaces: Workplace[];
  filterWorkplaceId: number | null;
  onFilterChange: (workplaceId: number | null) => void;
}

export default function MonthlyView({
  yearMonth,
  report,
  onYearMonthChange,
  onRefresh,
  onDeleteEntry,
  onSetEntryWorkplace,
  onEditEntry,
  workplaces,
  filterWorkplaceId,
  onFilterChange,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [editingEntryId, setEditingEntryId] = useState<number | null>(null);
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editWorkplaceId, setEditWorkplaceId] = useState<number | null>(null);

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
      if (filterWorkplaceId !== null) {
        // 特定勤務先 → 単一CSVをsaveダイアログで出力
        const filePath = await save({
          defaultPath: `勤務表_${yearMonth}.csv`,
          filters: [{ name: "CSV", extensions: ["csv"] }],
        });
        if (!filePath) return;
        const result = await api.exportCsv(yearMonth, filePath, filterWorkplaceId);
        setMessage(`CSVを出力しました: ${result}`);
      } else {
        // 「全て」→ フォルダ選択 → 勤務先ごとに個別CSV
        const dir = await open({ directory: true, title: "出力先フォルダを選択" });
        if (!dir) return;
        const result = await api.exportCsvAll(yearMonth, dir as string);
        setMessage(result);
      }
    } catch (e) {
      setError(String(e));
    }
  };

  const handleEditStart = (entryId: number, start: string, end: string, note: string, workplaceId: number | null) => {
    setEditingEntryId(entryId);
    setEditStart(start.substring(0, 5));
    setEditEnd(end.substring(0, 5));
    setEditNote(note);
    setEditWorkplaceId(workplaceId);
  };

  const handleEditSave = async () => {
    if (editingEntryId === null) return;
    try {
      setError("");
      await onEditEntry(editingEntryId, editStart, editEnd, editNote, editWorkplaceId);
      setEditingEntryId(null);
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

        {/* 勤務先フィルタ */}
        {workplaces.length > 0 && (
          <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>勤務先</span>
            <select
              value={filterWorkplaceId ?? ""}
              onChange={(e) => onFilterChange(e.target.value ? Number(e.target.value) : null)}
              style={{
                fontSize: 13,
                padding: "4px 8px",
                borderRadius: "var(--radius)",
                border: "1px solid var(--border)",
                background: "var(--bg-card)",
                color: "var(--text)",
              }}
            >
              <option value="">全て</option>
              {workplaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
        )}
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
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: 130 }} />
              <col />
              <col style={{ width: 70 }} />
              <col style={{ width: 40 }} />
            </colgroup>
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
                  <td style={{ ...tdStyle, padding: 0, overflow: "hidden" }}>
                    {day.entries.map((e, i) => {
                      const wp = workplaces.find((w) => w.id === e.workplace_id);
                      const isEditing = editingEntryId === e.id;
                      const canEdit = !report.is_closed && !!e.end_time;

                      if (isEditing) {
                        return (
                          <div key={e.id} style={{
                            display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap",
                            padding: "6px 14px",
                            borderBottom: i < day.entries.length - 1 ? "1px solid var(--border)" : undefined,
                            background: "var(--accent-light)",
                          }}>
                            <input
                              type="time"
                              value={editStart}
                              onChange={(ev) => setEditStart(ev.target.value)}
                              style={{ fontSize: 12, padding: "2px 4px", width: 90 }}
                            />
                            <span style={{ fontSize: 12 }}>-</span>
                            <input
                              type="time"
                              value={editEnd}
                              onChange={(ev) => setEditEnd(ev.target.value)}
                              style={{ fontSize: 12, padding: "2px 4px", width: 90 }}
                            />
                            <select
                              value={editWorkplaceId ?? ""}
                              onChange={(ev) => setEditWorkplaceId(ev.target.value ? Number(ev.target.value) : null)}
                              style={{ fontSize: 12, padding: "2px 4px" }}
                            >
                              <option value="">未設定</option>
                              {workplaces.map((w) => (
                                <option key={w.id} value={w.id}>{w.name}</option>
                              ))}
                            </select>
                            <input
                              type="text"
                              value={editNote}
                              onChange={(ev) => setEditNote(ev.target.value)}
                              placeholder="メモ"
                              style={{ fontSize: 12, padding: "2px 6px", flex: 1, minWidth: 80 }}
                              onKeyDown={(ev) => ev.key === "Enter" && handleEditSave()}
                            />
                            <button
                              className="btn-primary"
                              onClick={handleEditSave}
                              style={{ padding: "2px 10px", fontSize: 12 }}
                            >
                              保存
                            </button>
                            <button
                              className="btn-ghost"
                              onClick={() => setEditingEntryId(null)}
                              style={{ padding: "2px 8px", fontSize: 12 }}
                            >
                              ×
                            </button>
                          </div>
                        );
                      }

                      return (
                        <div key={e.id} style={{
                          display: "flex", alignItems: "center", gap: 6,
                          padding: "6px 14px",
                          borderBottom: i < day.entries.length - 1 ? "1px solid var(--border)" : undefined,
                        }}>
                          <span className="mono" style={{ flex: "none" }}>
                            {formatTimeShort(e.start_time)}-
                            {e.end_time ? formatTimeShort(e.end_time) : "??:??"}
                            <span style={{ color: "var(--text-tertiary)", fontSize: 11, marginLeft: 2 }}>
                              ({formatMinutes(e.duration_minutes)})
                            </span>
                          </span>
                          {wp ? (
                            <span style={{
                              display: "inline-flex", alignItems: "center", gap: 4,
                              fontSize: 11, padding: "1px 6px",
                              background: `${wp.color}22`,
                              color: wp.color, border: `1px solid ${wp.color}44`,
                            }}>
                              <span style={{ width: 6, height: 6, borderRadius: "50%", background: wp.color, display: "inline-block" }} />
                              {wp.name}
                            </span>
                          ) : workplaces.length > 0 && !report.is_closed ? (
                            <select
                              value=""
                              onChange={(ev) => ev.target.value && onSetEntryWorkplace(e.id, Number(ev.target.value))}
                              style={{
                                fontSize: 11,
                                padding: "1px 4px",
                                border: "1px solid var(--border)",
                                color: "var(--text-tertiary)",
                                background: "var(--bg-card)",
                              }}
                            >
                              <option value="">勤務先を設定…</option>
                              {workplaces.map((w) => (
                                <option key={w.id} value={w.id}>{w.name}</option>
                              ))}
                            </select>
                          ) : null}
                          {e.note && (
                            <span style={{ fontSize: 11, color: "var(--text-secondary)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {e.note}
                            </span>
                          )}
                          <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                            {canEdit && (
                              <button
                                onClick={() => handleEditStart(e.id, e.start_time, e.end_time!, e.note, e.workplace_id)}
                                style={{ padding: "1px 6px", fontSize: 11, color: "var(--text-secondary)", background: "transparent" }}
                              >
                                編集
                              </button>
                            )}
                            {!report.is_closed && e.end_time && (
                              confirmDeleteId === e.id ? (
                                <>
                                  <span style={{ fontSize: 11, color: "var(--danger)" }}>削除しますか？</span>
                                  <button
                                    onClick={async () => { setConfirmDeleteId(null); await onDeleteEntry(e.id); }}
                                    style={{ padding: "1px 6px", fontSize: 11, color: "var(--danger)", background: "transparent" }}
                                  >
                                    削除する
                                  </button>
                                  <button
                                    onClick={() => setConfirmDeleteId(null)}
                                    style={{ padding: "1px 6px", fontSize: 11, color: "var(--text-secondary)", background: "transparent" }}
                                  >
                                    キャンセル
                                  </button>
                                </>
                              ) : (
                                <button
                                  onClick={() => setConfirmDeleteId(e.id)}
                                  style={{ padding: "1px 6px", fontSize: 11, color: "var(--danger)", background: "transparent" }}
                                >
                                  削除
                                </button>
                              )
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </td>
                  <td className="mono" style={{ ...tdStyle, textAlign: "right", fontWeight: 500 }}>
                    {formatMinutes(day.total_minutes)}
                  </td>
                  <td style={tdStyle}></td>
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
