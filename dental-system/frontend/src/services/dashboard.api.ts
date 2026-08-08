import { api } from './api';

export type ProcStat = {
  treatmentId: number;
  name: string;
  code: string;
  quantity: number;
};

export type DayPerformance = {
  date: string;
  patients: number;
  incomeUsd: number;
  billedUsd: number;
};

export type DashboardStats = {
  today: string;
  weekFrom: string;
  proceduresToday: ProcStat[];
  proceduresWeek: ProcStat[];
  dailyPerformance: DayPerformance[];
};

export async function getDashboardStatsApi(): Promise<DashboardStats> {
  const { data } = await api.get<{ data: DashboardStats }>('/dashboard/stats');
  return data.data;
}
