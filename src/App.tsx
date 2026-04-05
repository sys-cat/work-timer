import { useState, useEffect, useCallback } from "react";
import { api } from "./lib/api";
import type { WorkEntry, Workplace, MonthlyReport } from "./types";
import TimerPanel from "./components/TimerPanel";
import MonthlyView from "./components/MonthlyView";
import ManualEntry from "./components/ManualEntry";
import SettingsPanel from "./components/SettingsPanel";

type Tab = "timer" | "monthly" | "manual" | "settings";

export default function App() {
  const [tab, setTab] = useState<Tab>("timer");
  const [today, setToday] = useState("");
  const [currentYearMonth, setCurrentYearMonth] = useState("");
  const [activeEntry, setActiveEntry] = useState<WorkEntry | null>(null);
  const [monthlyReport, setMonthlyReport] = useState<MonthlyReport | null>(null);
  const [workplaces, setWorkplaces] = useState<Workplace[]>([]);
  const [selectedWorkplaceId, setSelectedWorkplaceId] = useState<number | null>(null);
  const [monthlyFilterWorkplaceId, setMonthlyFilterWorkplaceId] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [d, active, wps] = await Promise.all([
          api.getToday(),
          api.getActiveEntry(),
          api.getWorkplaces(),
        ]);
        setToday(d);
        setCurrentYearMonth(d.substring(0, 7));
        setActiveEntry(active);
        setWorkplaces(wps);
      } catch (e) {
        setError(String(e));
      }
    })();
  }, []);

  const refreshWorkplaces = useCallback(async () => {
    try {
      const wps = await api.getWorkplaces();
      setWorkplaces(wps);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const refreshMonthly = useCallback(async (ym?: string) => {
    try {
      const target = ym || currentYearMonth;
      if (!target) return;
      const report = await api.getMonthlyReport(target, monthlyFilterWorkplaceId);
      setMonthlyReport(report);
    } catch (e) {
      setError(String(e));
    }
  }, [currentYearMonth, monthlyFilterWorkplaceId]);

  useEffect(() => {
    if (currentYearMonth) refreshMonthly();
  }, [currentYearMonth, refreshMonthly]);

  const handleClockIn = async () => {
    try {
      setError("");
      const entry = await api.clockIn(selectedWorkplaceId);
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
    note: string,
    workplaceId: number | null
  ) => {
    try {
      setError("");
      await api.addManualEntry(workDate, startTime, endTime, note, workplaceId);
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

  const handleSetEntryWorkplace = async (entryId: number, workplaceId: number | null) => {
    try {
      setError("");
      await api.setEntryWorkplace(entryId, workplaceId);
      await refreshMonthly();
    } catch (e) {
      setError(String(e));
    }
  };

  const handleEditEntry = async (
    entryId: number,
    startTime: string,
    endTime: string,
    note: string,
    workplaceId: number | null
  ) => {
    try {
      setError("");
      await api.updateEntry(entryId, startTime, endTime, note, workplaceId);
      await refreshMonthly();
    } catch (e) {
      setError(String(e));
    }
  };

  const handleMonthlyFilterChange = (workplaceId: number | null) => {
    setMonthlyFilterWorkplaceId(workplaceId);
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
        {([["timer", "打刻"], ["monthly", "勤務表"], ["manual", "手動入力"], ["settings", "設定"]] as [Tab, string][]).map(
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
          workplaces={workplaces}
          selectedWorkplaceId={selectedWorkplaceId}
          onWorkplaceSelect={setSelectedWorkplaceId}
        />
      )}
      {tab === "monthly" && (
        <MonthlyView
          yearMonth={currentYearMonth}
          report={monthlyReport}
          onYearMonthChange={setCurrentYearMonth}
          onRefresh={refreshMonthly}
          onDeleteEntry={handleDeleteEntry}
          onSetEntryWorkplace={handleSetEntryWorkplace}
          onEditEntry={handleEditEntry}
          workplaces={workplaces}
          filterWorkplaceId={monthlyFilterWorkplaceId}
          onFilterChange={handleMonthlyFilterChange}
        />
      )}
      {tab === "manual" && (
        <ManualEntry
          today={today}
          onSubmit={handleManualAdd}
          workplaces={workplaces}
          defaultWorkplaceId={selectedWorkplaceId}
        />
      )}
      {tab === "settings" && (
        <SettingsPanel workplaces={workplaces} onChanged={refreshWorkplaces} onRefresh={refreshMonthly} />
      )}
    </div>
  );
}
