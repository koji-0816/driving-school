import { Router, Request, Response } from 'express';
import { getDb } from '../db/schema';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  const db = getDb();
  const today = new Date().toISOString().split('T')[0];
  const date = req.query.date as string || today;
  const instructorId = req.query.instructor_id as string || '';

  let query = `
    SELECT l.*,
           s.name as student_name, s.license_type,
           i.name as instructor_name,
           f.name as facility_name
    FROM lessons l
    JOIN students s ON l.student_id = s.id
    JOIN instructors i ON l.instructor_id = i.id
    LEFT JOIN facilities f ON l.facility_id = f.id
    WHERE l.lesson_date = ?
  `;
  const params: (string)[] = [date];
  if (instructorId) { query += ' AND l.instructor_id = ?'; params.push(instructorId); }
  query += ' ORDER BY l.start_time, i.name';

  const lessons = db.prepare(query).all(...params);

  const vehicleStats = db.prepare(`
    SELECT license_type,
           COUNT(*) as total,
           SUM(CASE WHEN status = '使用可' THEN 1 ELSE 0 END) as active
    FROM facilities WHERE category = '車両' GROUP BY license_type
  `).all() as { license_type: string; total: number; active: number }[];

  const instructors = db.prepare(`SELECT id, name FROM instructors WHERE status = '在籍' ORDER BY name`).all();

  db.close();
  res.render('schedule', { lessons, date, vehicleStats, instructors, instructorId });
});

export default router;
