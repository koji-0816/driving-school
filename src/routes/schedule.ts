import { Router, Request, Response } from 'express';
import { getDb } from '../db/schema';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  const db = getDb();
  const today = new Date().toISOString().split('T')[0];
  const date = req.query.date as string || today;

  const lessons = db.prepare(`
    SELECT l.*,
           s.name as student_name, s.license_type,
           i.name as instructor_name,
           v.vehicle_no
    FROM lessons l
    JOIN students s ON l.student_id = s.id
    JOIN instructors i ON l.instructor_id = i.id
    LEFT JOIN vehicles v ON l.vehicle_id = v.id
    WHERE l.lesson_date = ?
    ORDER BY l.start_time, i.name
  `).all(date);

  const vehicleStats = db.prepare(`
    SELECT license_type,
           COUNT(*) as total,
           SUM(CASE WHEN status = '稼働中' THEN 1 ELSE 0 END) as active
    FROM vehicles GROUP BY license_type
  `).all() as { license_type: string; total: number; active: number }[];

  const usedVehicles = db.prepare(`
    SELECT DISTINCT vehicle_id FROM lessons
    WHERE lesson_date = ? AND status IN ('予定', '完了')
  `).all(date) as { vehicle_id: number }[];

  db.close();
  res.render('schedule', { lessons, date, vehicleStats, usedVehicleIds: usedVehicles.map(r => r.vehicle_id) });
});

export default router;
