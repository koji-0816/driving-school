import { Router, Request, Response } from 'express';
import { getDb } from '../db/schema';
import {
  SQL_STUDENT_STATUS_COUNTS,
  SQL_FACILITIES_WITH_VEHICLE_STATS,
  SQL_DASHBOARD_TODAY_LESSONS,
  SQL_DASHBOARD_UPCOMING_EXAMS,
} from '../db/queries';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  const db = getDb();
  try {
    const today = new Date().toISOString().split('T')[0];

    const studentStats = db.prepare(SQL_STUDENT_STATUS_COUNTS).all() as { status: string; c: number }[];
    const vehicleStats = db.prepare(SQL_FACILITIES_WITH_VEHICLE_STATS).all() as { license_type: string; status: string; c: number }[];
    const todayLessons = db.prepare(SQL_DASHBOARD_TODAY_LESSONS).all(today) as { lesson_type: string; status: string; c: number }[];
    const upcomingExams = db.prepare(SQL_DASHBOARD_UPCOMING_EXAMS).all(today);

    const instructorStats = db.prepare(`SELECT status, COUNT(*) as c FROM instructors GROUP BY status`).all() as { status: string; c: number }[];

    const accommodationStats = db.prepare(`
      SELECT a.id, a.name,
             SUM(r.capacity) as total_capacity,
             COUNT(s.id) as occupied
      FROM accommodations a
      LEFT JOIN rooms r ON r.accommodation_id = a.id
      LEFT JOIN students s ON s.room_id = r.id AND s.status = '在校'
      GROUP BY a.id
    `).all() as { id: number; name: string; total_capacity: number; occupied: number }[];

    const toMap = (arr: { status: string; c: number }[]) => {
      const m: Record<string, number> = {};
      for (const r of arr) m[r.status] = r.c;
      return m;
    };

    res.render('dashboard', {
      studentMap: toMap(studentStats),
      vehicleStats,
      todayLessons,
      upcomingExams,
      instructorMap: toMap(instructorStats),
      accommodationStats,
      today,
    });
  } finally {
    db.close();
  }
});

export default router;
