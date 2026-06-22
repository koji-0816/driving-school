import { Router, Request, Response } from 'express';
import { getDb } from '../db/schema';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  const db = getDb();
  const instructors = db.prepare('SELECT * FROM instructors ORDER BY status, name').all();
  db.close();
  res.render('instructors/index', { instructors });
});

router.get('/:id', (req: Request, res: Response) => {
  const db = getDb();
  const instructor = db.prepare('SELECT * FROM instructors WHERE id = ?').get(req.params.id);
  if (!instructor) { db.close(); res.status(404).render('error', { message: '教官が見つかりません' }); return; }

  const today = new Date().toISOString().split('T')[0];
  const schedule = db.prepare(`
    SELECT l.*, s.name as student_name, v.vehicle_no
    FROM lessons l
    JOIN students s ON l.student_id = s.id
    LEFT JOIN vehicles v ON l.vehicle_id = v.id
    WHERE l.instructor_id = ? AND l.lesson_date >= ?
    ORDER BY l.lesson_date, l.start_time
    LIMIT 20
  `).all(req.params.id, today);

  const monthStats = db.prepare(`
    SELECT COUNT(*) as total,
           SUM(CASE WHEN status = '完了' THEN 1 ELSE 0 END) as done
    FROM lessons WHERE instructor_id = ?
    AND lesson_date >= date('now', 'start of month', 'localtime')
  `).get(req.params.id) as { total: number; done: number };

  db.close();
  res.render('instructors/detail', { instructor, schedule, monthStats });
});

export default router;
