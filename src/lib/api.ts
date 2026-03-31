import { invoke } from "@tauri-apps/api/core";
import type {
  WorkEntry,
  DailySummary,
  MonthlyReport,
  MonthlyClose,
} from "../types";

export const api = {
  clockIn: () => invoke<WorkEntry>("clock_in"),

  clockOut: (entryId: number) =>
    invoke<WorkEntry>("clock_out", { entryId }),

  addManualEntry: (
    workDate: string,
    startTime: string,
    endTime: string,
    note: string
  ) =>
    invoke<WorkEntry>("add_manual_entry", {
      workDate,
      startTime,
      endTime,
      note,
    }),

  deleteEntry: (entryId: number) =>
    invoke<void>("delete_entry", { entryId }),

  getDailyEntries: (workDate: string) =>
    invoke<DailySummary>("get_daily_entries", { workDate }),

  getMonthlyReport: (yearMonth: string) =>
    invoke<MonthlyReport>("get_monthly_report", { yearMonth }),

  closeMonth: (yearMonth: string) =>
    invoke<MonthlyClose>("close_month", { yearMonth }),

  exportCsv: (yearMonth: string, filePath: string) =>
    invoke<string>("export_csv", { yearMonth, filePath }),

  dumpYearly: (year: number, filePath: string) =>
    invoke<string>("dump_yearly", { year, filePath }),

  getActiveEntry: () => invoke<WorkEntry | null>("get_active_entry"),

  getToday: () => invoke<string>("get_today"),

  getCurrentTime: () => invoke<string>("get_current_time"),
};

// 時間フォーマットユーティリティ
export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

export function formatTimeShort(time: string): string {
  return time.substring(0, 5); // "HH:MM:SS" -> "HH:MM"
}
