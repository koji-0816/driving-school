import { Router, Request, Response } from 'express';
import { getDb } from '../db/schema';
import {
  SQL_STUDENT_DETAIL, SQL_STUDENTS_LIST_BASE, SQL_STUDENT_STATUS_COUNTS,
  SQL_STUDENT_INSERT, SQL_STUDENT_UPDATE,
  SQL_ROOMS_FOR_STUDENT_FORM,
  SQL_INSTRUCTOR_SCHEDULE,
  recordStudentChanges, logStudentEvent, buildCurriculumProgress,
} from '../db/queries';

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

function getRooms(db: ReturnType<typeof getDb>) {
  return db.prepare(SQL_ROOMS_FOR_STUDENT_FORM).all() as {
    id: number; accommodation_id: number; accommodation_name: string;
    room_name: string; capacity: number; available: number;
  }[];
}

// 一覧
router.get('/', (req: Request, res: Response) => {
  const db = getDb();
  try {
    const status  = req.query.status  as string || '';
    const license = req.query.license as string || '';
    const type    = req.query.type    as string || '';

    let query = SQL_STUDENTS_LIST_BASE;
    const params: string[] = [];
    if (status)  { query += ' AND status = ?';       params.push(status); }
    if (license) { query += ' AND license_type = ?'; params.push(license); }
    if (type)    { query += ' AND student_type = ?'; params.push(type); }
    query += ' ORDER BY enrollment_date DESC';

    const students = (db.prepare(query).all(...params) as Record<string, string | null>[])
      .map(s => ({ ...s, ...calcDeadlines(s) }));

    const counts = db.prepare(SQL_STUDENT_STATUS_COUNTS).all() as { status: string; c: number }[];
    const countMap: Record<string, number> = {};
    for (const row of counts) countMap[row.status] = row.c;

    res.render('students/index', { students, countMap, status, license, type });
  } finally {
    db.close();
  }
});

// 新規登録フォーム
router.get('/new', (_req: Request, res: Response) => {
  const db = getDb();
  try {
    const rooms = getRooms(db);
    res.render('students/form', { student: null, rooms, error: null });
  } finally {
    db.close();
  }
});

// 新規登録処理
router.post('/', (req: Request, res: Response) => {
  const { name, kana, phone, email, license_type, student_type, enrollment_date, expected_graduation,
          lesson_start_date, provisional_license_date, stage2_complete_date,
          status, room_id, note } = req.body;

  if (!name || !kana || !enrollment_date) {
    const db = getDb();
    try {
      const rooms = getRooms(db);
      return res.render('students/form', { student: null, rooms, error: '氏名・フリガナ・入校日は必須です' });
    } finally {
      db.close();
    }
  }

  // 定員チェック
  if (room_id) {
    const db = getDb();
    try {
      const roomInfo = db.prepare(`
        SELECT r.capacity, COUNT(s.id) as occupied
        FROM rooms r LEFT JOIN students s ON s.room_id = r.id AND s.status = '在校'
        WHERE r.id = ? GROUP BY r.id
      `).get(room_id) as { capacity: number; occupied: number } | undefined;

      if (roomInfo && roomInfo.occupied >= roomInfo.capacity) {
        const rooms = getRooms(db);
        return res.render('students/form', { student: null, rooms, error: 'この部屋は定員に達しています' });
      }
    } finally {
      db.close();
    }
  }

  const db = getDb();
  try {
    const result = db.prepare(SQL_STUDENT_INSERT).run(
      name, kana, phone||null, email||null, license_type, student_type, enrollment_date,
      expected_graduation||null, lesson_start_date||null, provisional_license_date||null,
      stage2_complete_date||null, status, room_id||null, note||null
    );
    logStudentEvent(Number(result.lastInsertRowid), 'enrollment', `入校: ${name}（${student_type}・${license_type}）`);
  } finally {
    db.close();
  }
  res.redirect('/students');
});

// 詳細
router.get('/:id', (req: Request, res: Response) => {
  const db = getDb();
  try {
    const student = db.prepare(SQL_STUDENT_DETAIL).get(req.params.id) as Record<string, string | null> | undefined;
    if (!student) { res.status(404).render('error', { message: '生徒が見つかりません' }); return; }

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

    const events = db.prepare(`
      SELECT * FROM student_events WHERE student_id = ? ORDER BY created_at DESC LIMIT 20
    `).all(req.params.id);

    const stageMap: Record<string, number> = {};
    for (const row of lessonCounts) stageMap[row.stage] = row.c;

    // lesson_master が未投入の場合は空配列（普通MT以外も同様）
    const licenseType = (student['license_type'] as string) || '普通MT';
    const progress = buildCurriculumProgress(db, String(req.params.id), licenseType);

    // 受講記録登録用：受講可能科目の一覧
    const availableForRecord = progress.filter(p => p.status !== 'locked');

    const instructors = db.prepare(
      "SELECT id, name FROM instructors WHERE status = '在籍' ORDER BY id"
    ).all() as { id: number; name: string }[];

    res.render('students/detail', {
      student, lessons, exams, stageMap, events,
      progress, availableForRecord, instructors,
      ...calcDeadlines(student),
    });
  } finally {
    db.close();
  }
});

// 受講記録登録
router.post('/:id/record-lesson', (req: Request, res: Response) => {
  const { lesson_master_id, lesson_date, instructor_id, note } = req.body;
  if (!lesson_master_id || !lesson_date) {
    return res.redirect(`/students/${req.params.id}?error=科目と日付は必須です`);
  }
  const db = getDb();
  try {
    db.prepare(`
      INSERT INTO student_lesson_records (student_id, lesson_master_id, lesson_date, instructor_id, status, note)
      VALUES (?, ?, ?, ?, '完了', ?)
    `).run(req.params.id, lesson_master_id, lesson_date, instructor_id || null, note || null);

    const lm = db.prepare('SELECT code, name FROM lesson_master WHERE id = ?').get(lesson_master_id) as { code: string; name: string } | undefined;
    logStudentEvent(String(req.params.id), 'lesson_completed', `受講完了: ${lm?.name || lesson_master_id}（${lesson_date}）`);
  } finally {
    db.close();
  }
  res.redirect(`/students/${req.params.id}?success=1`);
});

// 編集フォーム
router.get('/:id/edit', (req: Request, res: Response) => {
  const db = getDb();
  try {
    const student = db.prepare(SQL_STUDENT_DETAIL).get(req.params.id);
    if (!student) { res.status(404).render('error', { message: '生徒が見つかりません' }); return; }
    const rooms = getRooms(db);
    res.render('students/form', { student, rooms, error: null });
  } finally {
    db.close();
  }
});

// 編集処理
router.post('/:id/edit', (req: Request, res: Response) => {
  const { name, kana, phone, email, license_type, student_type, enrollment_date, expected_graduation,
          lesson_start_date, provisional_license_date, stage2_complete_date,
          status, room_id, note } = req.body;

  if (!name || !kana || !enrollment_date) {
    const db = getDb();
    try {
      const rooms = getRooms(db);
      const student = db.prepare(SQL_STUDENT_DETAIL).get(req.params.id);
      return res.render('students/form', { student, rooms, error: '氏名・フリガナ・入校日は必須です' });
    } finally {
      db.close();
    }
  }

  const db = getDb();
  try {
    const before = db.prepare(SQL_STUDENT_DETAIL).get(req.params.id) as Record<string, unknown>;
    if (!before) { res.status(404).render('error', { message: '生徒が見つかりません' }); return; }

    // 定員チェック（部屋が変わった場合のみ）
    const newRoomId = room_id || null;
    if (newRoomId && String(newRoomId) !== String(before['room_id'])) {
      const roomInfo = db.prepare(`
        SELECT r.capacity, COUNT(s.id) as occupied
        FROM rooms r LEFT JOIN students s ON s.room_id = r.id AND s.status = '在校'
        WHERE r.id = ? GROUP BY r.id
      `).get(newRoomId) as { capacity: number; occupied: number } | undefined;

      if (roomInfo && roomInfo.occupied >= roomInfo.capacity) {
        const rooms = getRooms(db);
        return res.render('students/form', { student: before, rooms, error: 'この部屋は定員に達しています' });
      }
    }

    const after = {
      status, room_id: newRoomId,
      license_type, student_type, enrollment_date,
    };

    db.prepare(SQL_STUDENT_UPDATE).run(
      name, kana, phone||null, email||null, license_type, student_type, enrollment_date,
      expected_graduation||null, lesson_start_date||null, provisional_license_date||null,
      stage2_complete_date||null, status, newRoomId, note||null,
      req.params.id
    );

    recordStudentChanges(String(req.params.id), before as Record<string, unknown>, after);
  } finally {
    db.close();
  }
  res.redirect(`/students/${req.params.id}`);
});

export default router;
