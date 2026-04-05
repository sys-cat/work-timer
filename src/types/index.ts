export interface Workplace {
  id: number;
  name: string;
  color: string;
  sort_order: number;
}

export interface WorkEntry {
  id: number;
  work_date: string;
  start_time: string;
  end_time: string | null;
  duration_minutes: number;
  note: string;
  created_at: string;
  updated_at: string;
  workplace_id: number | null;
}

export interface DailySummary {
  work_date: string;
  entries: WorkEntry[];
  total_minutes: number;
}

export interface MonthlyClose {
  id: number;
  year_month: string;
  closed_at: string;
  total_minutes: number;
  working_days: number;
}

export interface MonthlyReport {
  year_month: string;
  daily_summaries: DailySummary[];
  total_minutes: number;
  working_days: number;
  is_closed: boolean;
}
