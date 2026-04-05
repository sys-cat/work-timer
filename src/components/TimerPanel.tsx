import { useState, useEffect } from "react";
import type { WorkEntry, DailySummary, Workplace } from "../types";
import { formatMinutes, formatTimeShort } from "../lib/api";

interface Props {
  activeEntry: WorkEntry | null;
  onClockIn: () => Promise<void>;
  onClockOut: () => Promise<void>;
  todayReport: DailySummary | null;
  workplaces: Workplace[];
  selectedWorkplaceId: number | null;
  onWorkplaceSelect: (id: number | null) => void;
}

export default function TimerPanel({
  activeEntry,
  onClockIn,
  onClockOut,
  todayReport,
  workplaces,
  selectedWorkplaceId,
  onWorkplaceSelect,
}: Props) {
  const [now, setNow] = useState(new Date());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const currentTime = now.toLocaleTimeString("ja-JP", { hour12: false });

  // 勤務中の経過時間を計算（日またぎ対応）
  const getElapsed = (): string => {
    if (!activeEntry) return "0:00";
    const [h, m, s] = activeEntry.start_time.split(":").map(Number);
    const startMs = (h * 3600 + m * 60 + (s || 0)) * 1000;
    const nowMs =
      (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()) * 1000;
    const DAY_MS = 24 * 3600 * 1000;
    const diff = nowMs >= startMs ? nowMs - startMs : nowMs + DAY_MS - startMs;
    const mins = Math.floor(diff / 60000);
    return formatMinutes(mins);
  };

  const handleAction = async (action: () => Promise<void>) => {
    setLoading(true);
    try {
      await action();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* 現在時刻・打刻ボタン */}
      <div className="card" style={{ textAlign: "center", padding: 32 }}>
        <div
          className="mono"
          style={{ fontSize: 48, fontWeight: 300, letterSpacing: "0.04em", marginBottom: 8 }}
        >
          {currentTime}
        </div>

        {/* 勤務先セレクタ */}
        {workplaces.length > 0 && (
          <div style={{ marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>勤務先</span>
            <select
              value={selectedWorkplaceId ?? ""}
              onChange={(e) => onWorkplaceSelect(e.target.value ? Number(e.target.value) : null)}
              disabled={!!activeEntry}
              style={{
                fontSize: 13,
                padding: "4px 8px",
                borderRadius: "var(--radius)",
                border: "1px solid var(--border)",
                background: "var(--bg-card)",
                color: "var(--text)",
                minWidth: 140,
                opacity: activeEntry ? 0.6 : 1,
              }}
            >
              <option value="">未設定</option>
              {workplaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {activeEntry ? (
          <div>
            <div style={{ marginBottom: 12 }}>
              <span className="badge badge-active">勤務中</span>
              <span style={{ marginLeft: 8, fontSize: 13, color: "var(--text-secondary)" }}>
                {formatTimeShort(activeEntry.start_time)} から
              </span>
              {activeEntry.workplace_id != null && workplaces.length > 0 && (
                <span style={{ marginLeft: 8, fontSize: 12, color: "var(--text-tertiary)" }}>
                  {workplaces.find((w) => w.id === activeEntry.workplace_id)?.name ?? ""}
                </span>
              )}
            </div>
            <div className="mono" style={{ fontSize: 28, fontWeight: 400, marginBottom: 16 }}>
              {getElapsed()}
            </div>
            <button
              className="btn-danger"
              onClick={() => handleAction(onClockOut)}
              disabled={loading}
              style={{ padding: "12px 48px", fontSize: 15 }}
            >
              {loading ? "処理中..." : "退勤"}
            </button>
          </div>
        ) : (
          <button
            className="btn-success"
            onClick={() => handleAction(onClockIn)}
            disabled={loading}
            style={{ padding: "12px 48px", fontSize: 15, marginTop: 8 }}
          >
            {loading ? "処理中..." : "出勤"}
          </button>
        )}
      </div>

      {/* 本日の勤務記録 */}
      <div className="card">
        <h2 style={{ fontSize: 15, fontWeight: 500, marginBottom: 12 }}>本日の勤務記録</h2>

        {!todayReport || todayReport.entries.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
            本日の記録はまだありません
          </p>
        ) : (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {todayReport.entries.map((entry, i) => (
                <div
                  key={entry.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "8px 12px",
                    background: "var(--bg)",
                    borderRadius: "var(--radius)",
                    fontSize: 13,
                  }}
                >
                  <span style={{ color: "var(--text-tertiary)", minWidth: 20 }}>
                    #{i + 1}
                  </span>
                  <span className="mono">
                    {formatTimeShort(entry.start_time)}
                    {" — "}
                    {entry.end_time ? formatTimeShort(entry.end_time) : "..."}
                  </span>
                  <span className="mono" style={{ fontWeight: 500 }}>
                    {entry.end_time ? formatMinutes(entry.duration_minutes) : "勤務中"}
                  </span>
                </div>
              ))}
            </div>

            <div
              style={{
                marginTop: 12,
                paddingTop: 12,
                borderTop: "1px solid var(--border)",
                display: "flex",
                justifyContent: "space-between",
                fontSize: 14,
                fontWeight: 500,
              }}
            >
              <span>合計</span>
              <span className="mono">{formatMinutes(todayReport.total_minutes)}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
