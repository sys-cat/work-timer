import { invoke } from "@tauri-apps/api/core";
import type {
  WorkEntry,
  Workplace,
  DailySummary,
  MonthlyReport,
  MonthlyClose,
} from "../types";

export const api = {
  clockIn: (workplaceId: number | null) =>
    invoke<WorkEntry>("clock_in", { workplaceId }),

  clockOut: (entryId: number) =>
    invoke<WorkEntry>("clock_out", { entryId }),

  addManualEntry: (
    workDate: string,
    startTime: string,
    endTime: string,
    note: string,
    workplaceId: number | null
  ) =>
    invoke<WorkEntry>("add_manual_entry", {
      workDate,
      startTime,
      endTime,
      note,
      workplaceId,
    }),

  deleteEntry: (entryId: number) =>
    invoke<void>("delete_entry", { entryId }),

  getDailyEntries: (workDate: string) =>
    invoke<DailySummary>("get_daily_entries", { workDate }),

  getMonthlyReport: (yearMonth: string, workplaceId?: number | null) =>
    invoke<MonthlyReport>("get_monthly_report", {
      yearMonth,
      workplaceId: workplaceId ?? null,
    }),

  closeMonth: (yearMonth: string) =>
    invoke<MonthlyClose>("close_month", { yearMonth }),

  exportCsv: (yearMonth: string, filePath: string, workplaceId?: number | null) =>
    invoke<string>("export_csv", { yearMonth, filePath, workplaceId: workplaceId ?? null }),

  exportCsvAll: (yearMonth: string, dirPath: string) =>
    invoke<string>("export_csv_all", { yearMonth, dirPath }),

  dumpYearly: (year: number, filePath: string) =>
    invoke<string>("dump_yearly", { year, filePath }),

  getActiveEntry: () => invoke<WorkEntry | null>("get_active_entry"),

  getToday: () => invoke<string>("get_today"),

  getCurrentTime: () => invoke<string>("get_current_time"),

  recalculateDurations: () =>
    invoke<number>("recalculate_durations"),

  // ── Workplace ──────────────────────────────────────────────────
  getWorkplaces: () => invoke<Workplace[]>("get_workplaces"),

  addWorkplace: (name: string, color: string) =>
    invoke<Workplace>("add_workplace", { name, color }),

  updateWorkplace: (id: number, name: string, color: string) =>
    invoke<Workplace>("update_workplace", { id, name, color }),

  deleteWorkplace: (id: number) =>
    invoke<void>("delete_workplace", { id }),

  setEntryWorkplace: (entryId: number, workplaceId: number | null) =>
    invoke<WorkEntry>("set_entry_workplace", { entryId, workplaceId }),

  reorderWorkplaces: (ids: number[]) =>
    invoke<void>("reorder_workplaces", { ids }),

  updateEntry: (
    entryId: number,
    startTime: string,
    endTime: string,
    note: string,
    workplaceId: number | null
  ) =>
    invoke<WorkEntry>("update_entry", { entryId, startTime, endTime, note, workplaceId }),
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
