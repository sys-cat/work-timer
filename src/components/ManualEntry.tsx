import { useState } from "react";
import type { Workplace } from "../types";

interface Props {
  today: string;
  onSubmit: (workDate: string, startTime: string, endTime: string, note: string, workplaceId: number | null) => Promise<void>;
  workplaces: Workplace[];
  defaultWorkplaceId: number | null;
}

export default function ManualEntry({ today, onSubmit, workplaces, defaultWorkplaceId }: Props) {
  const [workDate, setWorkDate] = useState(today);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [note, setNote] = useState("");
  const [workplaceId, setWorkplaceId] = useState<number | null>(defaultWorkplaceId);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!workDate || !startTime || !endTime) return;
    setLoading(true);
    try {
      await onSubmit(workDate, startTime + ":00", endTime + ":00", note, workplaceId);
      setStartTime("");
      setEndTime("");
      setNote("");
    } finally {
      setLoading(false);
    }
  };

  const fieldLabel: React.CSSProperties = {
    fontSize: 12,
    color: "var(--text-secondary)",
    display: "block",
    marginBottom: 4,
  };

  return (
    <div className="card">
      <h2 style={{ fontSize: 15, fontWeight: 500, marginBottom: 16 }}>手動入力</h2>

      {workplaces.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <label style={fieldLabel}>勤務先</label>
          <select
            value={workplaceId ?? ""}
            onChange={(e) => setWorkplaceId(e.target.value ? Number(e.target.value) : null)}
            style={{ width: "100%" }}
          >
            <option value="">未設定</option>
            {workplaces.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
        <div>
          <label style={fieldLabel}>日付</label>
          <input
            type="date"
            value={workDate}
            onChange={(e) => setWorkDate(e.target.value)}
            style={{ width: "100%" }}
          />
        </div>
        <div>
          <label style={fieldLabel}>開始時刻</label>
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            style={{ width: "100%" }}
          />
        </div>
        <div>
          <label style={fieldLabel}>終了時刻</label>
          <input
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            style={{ width: "100%" }}
          />
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={fieldLabel}>メモ（任意）</label>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="例：リモート作業、客先常駐"
          style={{ width: "100%" }}
        />
      </div>

      <button
        className="btn-primary"
        onClick={handleSubmit}
        disabled={loading || !startTime || !endTime}
        style={{ padding: "10px 24px" }}
      >
        {loading ? "追加中..." : "勤務記録を追加"}
      </button>
    </div>
  );
}
