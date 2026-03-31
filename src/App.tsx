import { useState, useEffect, useCallback } from "react";
import { api } from "./lib/api";
import type { WorkEntry, MonthlyReport } from "./types";
import TimerPanel from "./components/TimerPanel";
import MonthlyView from "./components/MonthlyView";
import ManualEntry from "./components/ManualEntry";

type Tab = "timer" | "monthly" | "manual";

export default function App() {
  const [tab, setTab] = useState<Tab>("timer");
  const [today, setToday] = useState("");
  const [currentYearMonth, setCurrentYearMonth] = useState("");
  const [activeEntry, setActiveEntry] = useState<WorkEntry | null>(null);
  const [monthlyReport, setMonthlyReport] = useState<MonthlyReport | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const d = await api.getToday();
        setToday(d);
        setCurrentYearMonth(d.substring(0, 7));
        const active = await api.getActiveEntry();
        setActiveEntry(active);
      } catch (e) {
        setError(String(e));
      }
    })();
  }, []);

  const refreshMonthly = useCallback(async (ym?: string) => {
    try {
      const target = ym || currentYearMonth;
      if (!target) return;
      const report = await api.getMonthlyReport(target);
      setMonthlyReport(report);
    } catch (e) {
      setError(String(e));
    }
  }, [currentYearMonth]);

  useEffect(() => {
    if (currentYearMonth) refreshMonthly();
  }, [currentYearMonth, refreshMonthly]);

  const handleClockIn = async () => {
    try {
      setError("");
      const entry = await api.clockIn();
      setActiveEntry(entry);
      await refreshMonthly();
    } catch (e) {
      setError(String(e));
    }
  };

  const handleClockOut = async () => {
    if (!activeEntry) return;
    try {
      setError("");
      await api.clockOut(activeEntry.id);
      setActiveEntry(null);
      await refreshMonthly();
    } catch (e) {
      setError(String(e));
    }
  };

  const handleManualAdd = async (
    workDate: string,
    startTime: string,
    endTime: string,
    note: string
  ) => {
    try {
      setError("");
      await api.addManualEntry(workDate, startTime, endTime, note);
      await refreshMonthly();
      setTab("monthly");
    } catch (e) {
      setError(String(e));
    }
  };

  const handleDeleteEntry = async (entryId: number) => {
    try {
      setError("");
      await api.deleteEntry(entryId);
      await refreshMonthly();
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "24px 16px" }}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", marginBottom: 4 }}>
          Work Timer
        </h1>
        <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
          勤務時間管理 — {today}
        </p>
      </header>

      {error && (
        <div style={{
          background: "var(--danger-light)", color: "var(--danger)",
          padding: "10px 14px", borderRadius: "var(--radius)", marginBottom: 16,
          fontSize: 13, display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <span>{error}</span>
          <button onClick={() => setError("")}
            style={{ background: "none", color: "var(--danger)", padding: "2px 8px", fontSize: 12 }}>
            ✕
          </button>
        </div>
      )}

      <nav style={{
        display: "flex", gap: 4, marginBottom: 20,
        background: "var(--bg-card)", border: "1px solid var(--border)",
        borderRadius: "var(--radius)", padding: 4,
      }}>
        {([["timer", "打刻"], ["monthly", "勤務表"], ["manual", "手動入力"]] as [Tab, string][]).map(
          ([key, label]) => (
            <button key={key} onClick={() => setTab(key)} style={{
              flex: 1,
              background: tab === key ? "var(--accent)" : "transparent",
              color: tab === key ? "white" : "var(--text-secondary)",
              borderRadius: 7, padding: "8px 0", fontSize: 13, fontWeight: 500,
            }}>
              {label}
            </button>
          )
        )}
      </nav>

      {tab === "timer" && (
        <TimerPanel
          activeEntry={activeEntry}
          onClockIn={handleClockIn}
          onClockOut={handleClockOut}
          todayReport={monthlyReport?.daily_summaries.find((d) => d.work_date === today) ?? null}
        />
      )}
      {tab === "monthly" && (
        <MonthlyView
          yearMonth={currentYearMonth}
          report={monthlyReport}
          onYearMonthChange={setCurrentYearMonth}
          onRefresh={refreshMonthly}
          onDeleteEntry={handleDeleteEntry}
        />
      )}
      {tab === "manual" && (
        <ManualEntry today={today} onSubmit={handleManualAdd} />
      )}
    </div>
  );
}
