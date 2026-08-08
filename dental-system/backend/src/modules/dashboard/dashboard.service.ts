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

    /** Facturado: total de planes distintos ligados a atenciones del día */
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

  async getStats(clinicId: string) {
    const today = todayYmd();
    const weekFrom = addDaysYmd(today, -6);
    const tomorrow = addDaysYmd(today, 1);

    const [proceduresToday, proceduresWeek, dailyPerformance] =
      await Promise.all([
        this.topProcedures(clinicId, today, tomorrow, 8),
        this.topProcedures(clinicId, weekFrom, tomorrow, 8),
        this.dailySeries(clinicId, weekFrom, today),
      ]);

    return {
      today,
      weekFrom,
      proceduresToday,
      proceduresWeek,
      dailyPerformance,
    };
  }
}

export const dashboardService = new DashboardService();
