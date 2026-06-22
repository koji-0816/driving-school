import { Router, Request, Response } from 'express';
import { getDb } from '../db/schema';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  const db = getDb();
  const status = req.query.status as string || '';
  const license = req.query.license as string || '';

  let query = 'SELECT * FROM students WHERE 1=1';
  const params: string[] = [];

  if (status) { query += ' AND status = ?'; params.push(status); }
  if (license) { query += ' AND license_type = ?'; params.push(license); }
  query += ' ORDER BY enrollment_date DESC';

  const students = db.prepare(query).all(...params);
  const counts = db.prepare(`
    SELECT status, COUNT(*) as c FROM students GROUP BY status
  `).all() as { status: string; c: number }[];
  db.close();

  const countMap: Record<string, number> = {};
  for (const row of counts) countMap[row.status] = row.c;

  res.render('students/index', { students, countMap, status, license });
});

router.get('/:id', (req: Request, res: Response) => {
  const db = getDb();
  const student = db.prepare('SELECT * FROM students WHERE id = ?').get(req.params.id);
  if (!student) { db.close(); res.status(404).render('error', { message: '生徒が見つかりません' }); return; }

  const lessons = db.prepare(`
    SELECT l.*, i.name as instructor_name, v.vehicle_no
    FROM lessons l
    LEFT JOIN instructors i ON l.instructor_id = i.id
    LEFT JOIN vehicles v ON l.vehicle_id = v.id
    WHERE l.student_id = ?
    ORDER BY l.lesson_date DESC, l.start_time DESC
    LIMIT 20
  `).all(req.params.id);

  const exams = db.prepare(`
    SELECT e.*, i.name as examiner_name
    FROM exams e
    LEFT JOIN instructors i ON e.examiner_id = i.id
    WHERE e.student_id = ?
    ORDER BY e.exam_date DESC
  `).all(req.params.id);

  const lessonCounts = db.prepare(`
    SELECT stage, COUNT(*) as c FROM lessons WHERE student_id = ? AND status = '完了' GROUP BY stage
  `).all(req.params.id) as { stage: string; c: number }[];
  db.close();

  const stageMap: Record<string, number> = {};
  for (const row of lessonCounts) stageMap[row.stage] = row.c;

  res.render('students/detail', { student, lessons, exams, stageMap });
});

export default router;
