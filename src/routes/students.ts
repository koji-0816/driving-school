import { Router, Request, Response } from 'express';
import { getDb } from '../db/schema';

const router = Router();

// 日付に月を加算
function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().split('T')[0];
}

// 期限情報を計算して返す
function calcDeadlines(s: Record<string, string | null>) {
  const today = new Date().toISOString().split('T')[0];

  const lessonDeadline   = s.lesson_start_date        ? addMonths(s.lesson_start_date, 9)        : null;
  const provLicDeadline  = s.provisional_license_date ? addMonths(s.provisional_license_date, 6) : null;
  const stage2Deadline   = s.stage2_complete_date      ? addMonths(s.stage2_complete_date, 3)     : null;

  function level(d: string | null): 'expired' | 'warn' | 'ok' | null {
    if (!d) return null;
    const diff = (new Date(d).getTime() - new Date(today).getTime()) / 86400000;
    if (diff < 0)  return 'expired';
    if (diff < 30) return 'warn';
    return 'ok';
  }

  return {
    lessonDeadline,   lessonLevel:  level(lessonDeadline),
    provLicDeadline,  provLicLevel: level(provLicDeadline),
    stage2Deadline,   stage2Level:  level(stage2Deadline),
  };
}

router.get('/', (req: Request, res: Response) => {
  const db = getDb();
  const status  = req.query.status  as string || '';
  const license = req.query.license as string || '';
  const type    = req.query.type    as string || '';

  let query = 'SELECT * FROM students WHERE 1=1';
  const params: string[] = [];

  if (status)  { query += ' AND status = ?';       params.push(status); }
  if (license) { query += ' AND license_type = ?'; params.push(license); }
  if (type)    { query += ' AND student_type = ?'; params.push(type); }
  query += ' ORDER BY enrollment_date DESC';

  const students = db.prepare(query).all() as Record<string, string | null>[];
  const filtered = db.prepare(query).all(...params) as Record<string, string | null>[];

  const counts = db.prepare(`SELECT status, COUNT(*) as c FROM students GROUP BY status`).all() as { status: string; c: number }[];
  db.close();

  const countMap: Record<string, number> = {};
  for (const row of counts) countMap[row.status] = row.c;

  // 期限情報を付加
  const studentsWithDeadlines = filtered.map(s => ({ ...s, ...calcDeadlines(s) }));

  res.render('students/index', { students: studentsWithDeadlines, countMap, status, license, type });
});

router.get('/:id', (req: Request, res: Response) => {
  const db = getDb();
  const student = db.prepare('SELECT * FROM students WHERE id = ?').get(req.params.id) as Record<string, string | null> | undefined;
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

  const deadlines = calcDeadlines(student);

  res.render('students/detail', { student, lessons, exams, stageMap, ...deadlines });
});

export default router;
