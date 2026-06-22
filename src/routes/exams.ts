import { Router, Request, Response } from 'express';
import { getDb } from '../db/schema';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  const db = getDb();
  const exams = db.prepare(`
    SELECT e.*,
           s.name as student_name, s.license_type as student_license,
           i.name as examiner_name
    FROM exams e
    JOIN students s ON e.student_id = s.id
    JOIN instructors i ON e.examiner_id = i.id
    ORDER BY e.exam_date DESC
  `).all();

  const stats = db.prepare(`
    SELECT result, COUNT(*) as c FROM exams GROUP BY result
  `).all() as { result: string; c: number }[];

  db.close();
  const statMap: Record<string, number> = {};
  for (const s of stats) statMap[s.result] = s.c;

  res.render('exams', { exams, statMap });
});

export default router;
