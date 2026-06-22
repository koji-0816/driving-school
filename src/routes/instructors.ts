import { Router, Request, Response } from 'express';
import { getDb } from '../db/schema';
import { SQL_INSTRUCTOR_SCHEDULE } from '../db/queries';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  const db = getDb();
  try {
    const instructors = db.prepare('SELECT * FROM instructors ORDER BY status, name').all();
    res.render('instructors/index', { instructors });
  } finally {
    db.close();
  }
});

router.get('/:id', (req: Request, res: Response) => {
  const db = getDb();
  try {
    const instructor = db.prepare('SELECT * FROM instructors WHERE id = ?').get(req.params.id);
    if (!instructor) { res.status(404).render('error', { message: '教官が見つかりません' }); return; }

    const today = new Date().toISOString().split('T')[0];
    const schedule = db.prepare(SQL_INSTRUCTOR_SCHEDULE).all(req.params.id, today);

    const monthStats = db.prepare(`
      SELECT COUNT(*) as total,
             SUM(CASE WHEN status = '完了' THEN 1 ELSE 0 END) as done
      FROM lessons WHERE instructor_id = ?
      AND lesson_date >= date('now', 'start of month', 'localtime')
    `).get(req.params.id) as { total: number; done: number };

    res.render('instructors/detail', { instructor, schedule, monthStats });
  } finally {
    db.close();
  }
});

export default router;
