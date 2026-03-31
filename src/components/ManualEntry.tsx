import { useState } from "react";

interface Props {
  today: string;
  onSubmit: (workDate: string, startTime: string, endTime: string, note: string) => Promise<void>;
}

export default function ManualEntry({ today, onSubmit }: Props) {
  const [workDate, setWorkDate] = useState(today);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!workDate || !startTime || !endTime) return;
    setLoading(true);
    try {
      await onSubmit(workDate, startTime + ":00", endTime + ":00", note);
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
