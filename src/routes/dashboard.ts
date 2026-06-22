import { Router, Request, Response } from 'express';
import { getDb } from '../db/schema';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  const db = getDb();
  const today = new Date().toISOString().split('T')[0];

  const studentStats = db.prepare(`
    SELECT status, COUNT(*) as c FROM students GROUP BY status
  `).all() as { status: string; c: number }[];

  const vehicleStats = db.prepare(`
    SELECT license_type, status, COUNT(*) as c FROM facilities
    WHERE category = '車両' GROUP BY license_type, status
  `).all() as { license_type: string; status: string; c: number }[];

  const todayLessons = db.prepare(`
    SELECT lesson_type, status, COUNT(*) as c FROM lessons
    WHERE lesson_date = ? GROUP BY lesson_type, status
  `).all(today) as { lesson_type: string; status: string; c: number }[];

  const upcomingExams = db.prepare(`
    SELECT e.*, s.name as student_name, i.name as examiner_name
    FROM exams e
    JOIN students s ON e.student_id = s.id
    JOIN instructors i ON e.examiner_id = i.id
    WHERE e.exam_date >= ? AND e.result = '未実施'
    ORDER BY e.exam_date
    LIMIT 5
  `).all(today);

  const instructorStats = db.prepare(`
    SELECT status, COUNT(*) as c FROM instructors GROUP BY status
  `).all() as { status: string; c: number }[];

  const accommodationStats = db.prepare(`
    SELECT a.id, a.name, a.total_rooms,
           COUNT(s.id) as occupied
    FROM accommodations a
    LEFT JOIN students s ON s.accommodation_id = a.id AND s.status = '在校'
    GROUP BY a.id
  `).all() as { id: number; name: string; total_rooms: number; occupied: number }[];

  db.close();

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
});

export default router;
