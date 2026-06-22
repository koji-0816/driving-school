import { Router, Request, Response } from 'express';
import { getDb } from '../db/schema';

const router = Router();

function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().split('T')[0];
}

function calcDeadlines(s: Record<string, string | null>) {
  const today = new Date().toISOString().split('T')[0];
  const lessonDeadline  = s.lesson_start_date        ? addMonths(s.lesson_start_date, 9)        : null;
  const provLicDeadline = s.provisional_license_date ? addMonths(s.provisional_license_date, 6) : null;
  const stage2Deadline  = s.stage2_complete_date     ? addMonths(s.stage2_complete_date, 3)     : null;
  function level(d: string | null): 'expired' | 'warn' | 'ok' | null {
    if (!d) return null;
    const diff = (new Date(d).getTime() - new Date(today).getTime()) / 86400000;
    if (diff < 0) return 'expired';
    if (diff < 30) return 'warn';
    return 'ok';
  }
  return { lessonDeadline, lessonLevel: level(lessonDeadline), provLicDeadline, provLicLevel: level(provLicDeadline), stage2Deadline, stage2Level: level(stage2Deadline) };
}

// 一覧
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

  const students = (db.prepare(query).all(...params) as Record<string, string | null>[])
    .map(s => ({ ...s, ...calcDeadlines(s) }));

  const counts = db.prepare(`SELECT status, COUNT(*) as c FROM students GROUP BY status`).all() as { status: string; c: number }[];
  db.close();

  const countMap: Record<string, number> = {};
  for (const row of counts) countMap[row.status] = row.c;

  res.render('students/index', { students, countMap, status, license, type });
});

function getRooms(db: ReturnType<typeof getDb>) {
  return db.prepare(`
    SELECT r.*, a.name as accommodation_name
    FROM rooms r JOIN accommodations a ON r.accommodation_id = a.id
    WHERE r.status = '使用可'
    ORDER BY a.id, r.room_name
  `).all() as { id: number; accommodation_id: number; accommodation_name: string; room_name: string; capacity: number }[];
}

// 新規登録フォーム
router.get('/new', (_req: Request, res: Response) => {
  const db = getDb();
  const rooms = getRooms(db);
  db.close();
  res.render('students/form', { student: null, rooms, error: null });
});

// 新規登録処理
router.post('/', (req: Request, res: Response) => {
  const { name, kana, phone, email, license_type, student_type, enrollment_date, expected_graduation,
          lesson_start_date, provisional_license_date, stage2_complete_date,
          status, room_id, note } = req.body;

  if (!name || !kana || !enrollment_date) {
    const db = getDb();
    const rooms = getRooms(db);
    db.close();
    return res.render('students/form', { student: null, rooms, error: '氏名・フリガナ・入校日は必須です' });
  }

  const db = getDb();
  db.prepare(`
    INSERT INTO students (name,kana,phone,email,license_type,student_type,enrollment_date,expected_graduation,
      lesson_start_date,provisional_license_date,stage2_complete_date,status,room_id,note)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    name, kana, phone||null, email||null, license_type, student_type, enrollment_date,
    expected_graduation||null, lesson_start_date||null, provisional_license_date||null,
    stage2_complete_date||null, status, room_id||null, note||null
  );
  db.close();
  res.redirect('/students');
});

// 詳細
router.get('/:id', (req: Request, res: Response) => {
  const db = getDb();
  const student = db.prepare(`
    SELECT s.*, r.room_name, a.name as accommodation_name
    FROM students s
    LEFT JOIN rooms r ON s.room_id = r.id
    LEFT JOIN accommodations a ON r.accommodation_id = a.id
    WHERE s.id = ?
  `).get(req.params.id) as Record<string, string | null> | undefined;
  if (!student) { db.close(); res.status(404).render('error', { message: '生徒が見つかりません' }); return; }

  const lessons = db.prepare(`
    SELECT l.*, i.name as instructor_name, f.name as facility_name
    FROM lessons l
    LEFT JOIN instructors i ON l.instructor_id = i.id
    LEFT JOIN facilities f ON l.facility_id = f.id
    WHERE l.student_id = ?
    ORDER BY l.lesson_date DESC, l.start_time DESC LIMIT 20
  `).all(req.params.id);

  const exams = db.prepare(`
    SELECT e.*, i.name as examiner_name FROM exams e
    LEFT JOIN instructors i ON e.examiner_id = i.id
    WHERE e.student_id = ? ORDER BY e.exam_date DESC
  `).all(req.params.id);

  const lessonCounts = db.prepare(`
    SELECT stage, COUNT(*) as c FROM lessons WHERE student_id = ? AND status = '完了' GROUP BY stage
  `).all(req.params.id) as { stage: string; c: number }[];
  db.close();

  const stageMap: Record<string, number> = {};
  for (const row of lessonCounts) stageMap[row.stage] = row.c;

  res.render('students/detail', { student, lessons, exams, stageMap, ...calcDeadlines(student) });
});

// 編集フォーム
router.get('/:id/edit', (req: Request, res: Response) => {
  const db = getDb();
  const student = db.prepare('SELECT * FROM students WHERE id = ?').get(req.params.id);
  if (!student) { db.close(); res.status(404).render('error', { message: '生徒が見つかりません' }); return; }
  const rooms = getRooms(db);
  db.close();
  res.render('students/form', { student, rooms, error: null });
});

// 編集処理
router.post('/:id/edit', (req: Request, res: Response) => {
  const { name, kana, phone, email, license_type, student_type, enrollment_date, expected_graduation,
          lesson_start_date, provisional_license_date, stage2_complete_date,
          status, room_id, note } = req.body;

  if (!name || !kana || !enrollment_date) {
    const db2 = getDb();
    const rooms = getRooms(db2);
    const student = db2.prepare('SELECT * FROM students WHERE id = ?').get(req.params.id);
    db2.close();
    return res.render('students/form', { student, rooms, error: '氏名・フリガナ・入校日は必須です' });
  }

  const db = getDb();
  db.prepare(`
    UPDATE students SET name=?,kana=?,phone=?,email=?,license_type=?,student_type=?,enrollment_date=?,
      expected_graduation=?,lesson_start_date=?,provisional_license_date=?,stage2_complete_date=?,
      status=?,room_id=?,note=?
    WHERE id=?
  `).run(
    name, kana, phone||null, email||null, license_type, student_type, enrollment_date,
    expected_graduation||null, lesson_start_date||null, provisional_license_date||null,
    stage2_complete_date||null, status, room_id||null, note||null,
    req.params.id
  );
  db.close();
  res.redirect(`/students/${req.params.id}`);
});

export default router;
