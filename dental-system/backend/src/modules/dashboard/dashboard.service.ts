import { RowDataPacket } from 'mysql2';
import { dbPool } from '../../config';

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

export type WeekPatientStat = {
  label: string;
  count: number;
};

export type DashboardFinanceKpis = {
  incomeTodayUsd: number;
  incomeMonthUsd: number;
  outstandingUsd: number;
  collectedUsd: number;
};

function ymdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return ymdLocal(dt);
}

function todayYmd(): string {
  return ymdLocal(new Date());
}

function monthStartYmd(ymd: string): string {
  const [y, m] = ymd.split('-').map(Number);
  return `${y}-${String(m).padStart(2, '0')}-01`;
}

export class DashboardService {
  private async topProcedures(
    clinicId: string,
    fromYmd: string,
    toYmdExclusive: string,
    limit = 8,
  ): Promise<ProcStat[]> {
    const [rows] = await dbPool.query<RowDataPacket[]>(
      `SELECT i.treatment_id AS treatmentId,
              tc.name AS name,
              tc.code AS code,
              SUM(i.quantity) AS quantity
       FROM treatment_plan_items i
       INNER JOIN treatment_plans tp
         ON tp.id = i.treatment_plan_id AND tp.clinic_id = :clinicId
       INNER JOIN treatment_catalog tc
         ON tc.id = i.treatment_id AND tc.clinic_id = :clinicId
       WHERE tp.id IN (
         SELECT DISTINCT cr.treatment_plan_id
         FROM clinical_records cr
         WHERE cr.clinic_id = :clinicId
           AND cr.treatment_plan_id IS NOT NULL
           AND cr.signed_at >= :fromTs
           AND cr.signed_at < :toTs
       )
       GROUP BY i.treatment_id, tc.name, tc.code
       ORDER BY quantity DESC
       LIMIT ${Math.max(1, Math.min(20, limit))}`,
      {
        clinicId,
        fromTs: `${fromYmd} 00:00:00`,
        toTs: `${toYmdExclusive} 00:00:00`,
      },
    );

    return rows.map((r) => ({
      treatmentId: Number(r.treatmentId),
      name: String(r.name),
      code: String(r.code),
      quantity: Number(r.quantity) || 0,
    }));
  }

  private async dailySeries(
    clinicId: string,
    fromYmd: string,
    toYmdInclusive: string,
  ): Promise<DayPerformance[]> {
    const toExclusive = addDaysYmd(toYmdInclusive, 1);

    const [patientRows] = await dbPool.query<RowDataPacket[]>(
      `SELECT DATE_FORMAT(cr.signed_at, '%Y-%m-%d') AS d,
              COUNT(DISTINCT cr.patient_id) AS patients
       FROM clinical_records cr
       WHERE cr.clinic_id = :clinicId
         AND cr.signed_at >= :fromTs
         AND cr.signed_at < :toTs
       GROUP BY DATE_FORMAT(cr.signed_at, '%Y-%m-%d')`,
      {
        clinicId,
        fromTs: `${fromYmd} 00:00:00`,
        toTs: `${toExclusive} 00:00:00`,
      },
    );

    const [incomeRows] = await dbPool.query<RowDataPacket[]>(
      `SELECT DATE_FORMAT(p.paid_at, '%Y-%m-%d') AS d,
              COALESCE(SUM(p.amount_paid), 0) AS incomeUsd
       FROM payments p
       WHERE p.clinic_id = :clinicId
         AND p.paid_at >= :fromTs
         AND p.paid_at < :toTs
       GROUP BY DATE_FORMAT(p.paid_at, '%Y-%m-%d')`,
      {
        clinicId,
        fromTs: `${fromYmd} 00:00:00`,
        toTs: `${toExclusive} 00:00:00`,
      },
    );

    const [billedRows] = await dbPool.query<RowDataPacket[]>(
      `SELECT d, COALESCE(SUM(total_amount), 0) AS billedUsd
       FROM (
         SELECT DATE_FORMAT(cr.signed_at, '%Y-%m-%d') AS d,
                tp.id AS plan_id,
                tp.total_amount
         FROM clinical_records cr
         INNER JOIN treatment_plans tp
           ON tp.id = cr.treatment_plan_id AND tp.clinic_id = cr.clinic_id
         WHERE cr.clinic_id = :clinicId
           AND cr.treatment_plan_id IS NOT NULL
           AND cr.signed_at >= :fromTs
           AND cr.signed_at < :toTs
         GROUP BY DATE_FORMAT(cr.signed_at, '%Y-%m-%d'), tp.id, tp.total_amount
       ) x
       GROUP BY d`,
      {
        clinicId,
        fromTs: `${fromYmd} 00:00:00`,
        toTs: `${toExclusive} 00:00:00`,
      },
    );

    const patientsMap = new Map(
      patientRows.map((r) => [String(r.d), Number(r.patients) || 0]),
    );
    const incomeMap = new Map(
      incomeRows.map((r) => [String(r.d), Number(r.incomeUsd) || 0]),
    );
    const billedMap = new Map(
      billedRows.map((r) => [String(r.d), Number(r.billedUsd) || 0]),
    );

    const out: DayPerformance[] = [];
    let cur = fromYmd;
    while (cur <= toYmdInclusive) {
      out.push({
        date: cur,
        patients: patientsMap.get(cur) ?? 0,
        incomeUsd: Math.round((incomeMap.get(cur) ?? 0) * 100) / 100,
        billedUsd: Math.round((billedMap.get(cur) ?? 0) * 100) / 100,
      });
      cur = addDaysYmd(cur, 1);
    }
    return out;
  }

  private async financeKpis(
    clinicId: string,
    today: string,
  ): Promise<DashboardFinanceKpis> {
    const tomorrow = addDaysYmd(today, 1);
    const monthFrom = monthStartYmd(today);

    const [[todayRow]] = await dbPool.query<RowDataPacket[]>(
      `SELECT COALESCE(SUM(amount_paid), 0) AS total
       FROM payments
       WHERE clinic_id = :clinicId
         AND paid_at >= :fromTs AND paid_at < :toTs`,
      {
        clinicId,
        fromTs: `${today} 00:00:00`,
        toTs: `${tomorrow} 00:00:00`,
      },
    );

    const [[monthRow]] = await dbPool.query<RowDataPacket[]>(
      `SELECT COALESCE(SUM(amount_paid), 0) AS total
       FROM payments
       WHERE clinic_id = :clinicId
         AND paid_at >= :fromTs AND paid_at < :toTs`,
      {
        clinicId,
        fromTs: `${monthFrom} 00:00:00`,
        toTs: `${tomorrow} 00:00:00`,
      },
    );

    const [[balanceRow]] = await dbPool.query<RowDataPacket[]>(
      `SELECT COALESCE(SUM(GREATEST(tp.total_amount - tp.paid_amount, 0)), 0) AS outstanding
       FROM treatment_plans tp
       WHERE tp.clinic_id = :clinicId
         AND tp.total_amount > tp.paid_amount`,
      { clinicId },
    );

    const incomeTodayUsd =
      Math.round((Number(todayRow?.total) || 0) * 100) / 100;
    const incomeMonthUsd =
      Math.round((Number(monthRow?.total) || 0) * 100) / 100;
    const outstandingUsd =
      Math.round((Number(balanceRow?.outstanding) || 0) * 100) / 100;

    return {
      incomeTodayUsd,
      incomeMonthUsd,
      outstandingUsd,
      collectedUsd: incomeMonthUsd,
    };
  }

  private async newPatientsWeekly(
    clinicId: string,
    weeks = 7,
  ): Promise<WeekPatientStat[]> {
    const today = todayYmd();
    const from = addDaysYmd(today, -(weeks * 7 - 1));
    const [rows] = await dbPool.query<RowDataPacket[]>(
      `SELECT created_at
       FROM patients
       WHERE clinic_id = :clinicId
         AND created_at >= :fromTs`,
      { clinicId, fromTs: `${from} 00:00:00` },
    );

    const buckets = Array.from({ length: weeks }, () => 0);
    const startMs = new Date(`${from}T00:00:00`).getTime();
    for (const r of rows) {
      const t = new Date(r.created_at as string | Date).getTime();
      if (Number.isNaN(t)) continue;
      const dayIndex = Math.floor((t - startMs) / 86_400_000);
      const weekIndex = Math.min(weeks - 1, Math.max(0, Math.floor(dayIndex / 7)));
      buckets[weekIndex] += 1;
    }

    return buckets.map((count, i) => ({
      label: `Sem ${i + 1}`,
      count,
    }));
  }

  async getStats(clinicId: string) {
    const today = todayYmd();
    const weekFrom = addDaysYmd(today, -6);
    const tomorrow = addDaysYmd(today, 1);

    const [
      proceduresToday,
      proceduresWeek,
      dailyPerformance,
      finance,
      newPatientsWeekly,
    ] = await Promise.all([
      this.topProcedures(clinicId, today, tomorrow, 8),
      this.topProcedures(clinicId, weekFrom, tomorrow, 8),
      this.dailySeries(clinicId, weekFrom, today),
      this.financeKpis(clinicId, today),
      this.newPatientsWeekly(clinicId, 7),
    ]);

    return {
      today,
      weekFrom,
      proceduresToday,
      proceduresWeek,
      dailyPerformance,
      finance,
      newPatientsWeekly,
    };
  }
}

export const dashboardService = new DashboardService();
