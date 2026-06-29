import { Router, Request, Response } from 'express';
import { getDb } from '../db/schema';
import { promoteWaitlist } from './waitlist';
import { buildCurriculumProgress, SQL_BOOKING_CANCEL_INSERT } from '../db/queries';

const router = Router();

// admin一覧の組み立て（教習生名・番号・実施教習を含める）
function loadAdminSlots(db: ReturnType<typeof getDb>, date: string, instructorId?: string) {
  let sql = `
    SELECT s.*, i.name as instructor_name, f.name as facility_name, f.category as facility_category,
           lm.code as lesson_code, lm.name as lesson_name,
           COUNT(r.id) as reserved_count
    FROM slots s
    JOIN instructors i ON s.instructor_id = i.id
    LEFT JOIN facilities f ON s.facility_id = f.id
    LEFT JOIN lesson_master lm ON s.lesson_master_id = lm.id
    LEFT JOIN reservations r ON r.slot_id = s.id AND r.status = '予約済'
      AND NOT EXISTS (SELECT 1 FROM reservation_cancellations rc WHERE rc.reservation_id = r.id)
    WHERE s.slot_date = ?`;
  const params: string[] = [date];
  if (instructorId) { sql += ' AND s.instructor_id = ?'; params.push(instructorId); }
  sql += ' GROUP BY s.id ORDER BY s.start_time, i.name';
  const slots = db.prepare(sql).all(...params) as Record<string, any>[];

  // 各枠の予約生徒（教習生番号・名）
  const reserved = db.prepare(`
    SELECT r.slot_id, st.id as student_id, st.name as student_name, st.student_no
    FROM reservations r
    JOIN students st ON r.student_id = st.id
    JOIN slots s ON r.slot_id = s.id
    WHERE r.status = '予約済' AND s.slot_date = ?
      AND NOT EXISTS (SELECT 1 FROM reservation_cancellations rc WHERE rc.reservation_id = r.id)
    ORDER BY st.name
  `).all(date) as { slot_id: number; student_id: number; student_name: string; student_no: string | null }[];

  const bySlot: Record<number, typeof reserved> = {};
  for (const row of reserved) (bySlot[row.slot_id] ||= []).push(row);
  for (const s of slots) s.reserved_students = bySlot[s.id] || [];
  return slots;
}

// 事務：スロット一覧 & 作成フォーム
router.get('/admin', (req: Request, res: Response) => {
  const db = getDb();
  try {
    const date = req.query.date as string || new Date().toISOString().split('T')[0];
    const instructorId = (req.query.instructor_id as string) || '';

    const slots = loadAdminSlots(db, date, instructorId || undefined);
    const instructors = db.prepare(`SELECT * FROM instructors WHERE status = '在籍' ORDER BY name`).all();
    const facilities = db.prepare(`SELECT * FROM facilities WHERE status = '使用可' ORDER BY category, name`).all();
    const students = db.prepare(`SELECT id, name, student_no, license_type FROM students WHERE status = '在校' ORDER BY name`).all();
    const lessons = db.prepare(`SELECT id, code, name, lesson_type, stage FROM lesson_master ORDER BY sort_order`).all();

    res.render('reservations/admin', { slots, date, instructorId, instructors, facilities, students, lessons, error: null });
  } finally {
    db.close();
  }
});

// 事務：指定生徒の選択可能な教習（受講済を除外）
// buildCurriculumProgress 経由。plan有り生徒は plan の課程集合、plan無し生徒は従来 lesson_master フォールバック（Step3で接続済み）
router.get('/admin/student-lessons/:studentId', (req: Request, res: Response) => {
  const db = getDb();
  try {
    const student = db.prepare('SELECT license_type FROM students WHERE id = ?').get(req.params.studentId) as { license_type: string } | undefined;
    if (!student) { res.json({ lessons: [] }); return; }
    const progress = buildCurriculumProgress(db, String(req.params.studentId), student.license_type);
    // 受講済（completed）は選択不可。available/locked のみ返し、status を添える
    const lessons = progress
      .filter(p => p.status !== 'completed')
      .map(p => ({ id: p.lesson.id, code: p.lesson.code, name: p.lesson.name, status: p.status }));
    res.json({ lessons });
  } finally {
    db.close();
  }
});

// 事務：スロット作成（ダブルブッキングチェック付き・教習生／実施教習の指定可）
router.post('/admin/slots', (req: Request, res: Response) => {
  const { slot_date, start_time, end_time, instructor_id, facility_id, lesson_type, license_type, max_students,
          lesson_master_id, student_id } = req.body;
  // 教習生は複数登録可（同一枠に複数 reservation）。配列・単一どちらでも受ける
  const sids = [...new Set(
    (Array.isArray(student_id) ? student_id : (student_id ? [student_id] : []))
      .map((v: unknown) => String(v)).filter((s: string) => s)
  )];
  const db = getDb();
  try {
    const rerender = (errMsg: string) => {
      const slots = loadAdminSlots(db, slot_date);
      const instructors = db.prepare(`SELECT * FROM instructors WHERE status = '在籍' ORDER BY name`).all();
      const facilities = db.prepare(`SELECT * FROM facilities WHERE status = '使用可' ORDER BY category, name`).all();
      const students = db.prepare(`SELECT id, name, student_no, license_type FROM students WHERE status = '在校' ORDER BY name`).all();
      const lessons = db.prepare(`SELECT id, code, name, lesson_type, stage FROM lesson_master ORDER BY sort_order`).all();
      return res.render('reservations/admin', { slots, date: slot_date, instructorId: '', instructors, facilities, students, lessons, error: errMsg });
    };

    const instrDup = db.prepare(`
      SELECT id FROM slots WHERE slot_date=? AND instructor_id=? AND status='受付中'
      AND NOT (end_time <= ? OR start_time >= ?)
    `).get(slot_date, instructor_id, start_time, end_time);

    const facDup = facility_id ? db.prepare(`
      SELECT id FROM slots WHERE slot_date=? AND facility_id=? AND status='受付中'
      AND NOT (end_time <= ? OR start_time >= ?)
    `).get(slot_date, facility_id, start_time, end_time) : null;

    if (instrDup || facDup) {
      return rerender(instrDup ? 'この教官はすでに同時間帯に枠があります' : 'この設備はすでに同時間帯に割当済みです（ダブルブッキング）');
    }

    // 受講済み教習は割当不可（各生徒に適用。plan有り生徒はplan課程で判定）
    if (lesson_master_id && sids.length > 0) {
      for (const sid of sids) {
        const stu = db.prepare('SELECT name, license_type FROM students WHERE id = ?').get(sid) as { name: string; license_type: string } | undefined;
        if (!stu) continue;
        const progress = buildCurriculumProgress(db, sid, stu.license_type);
        const target = progress.find(p => p.lesson.id === Number(lesson_master_id));
        if (target && target.status === 'completed') {
          return rerender(`${stu.name} さんは指定教習が受講済みのため割当できません`);
        }
      }
    }

    const result = db.prepare(`
      INSERT INTO slots (slot_date,start_time,end_time,instructor_id,facility_id,lesson_type,license_type,max_students,lesson_master_id)
      VALUES (?,?,?,?,?,?,?,?,?)
    `).run(slot_date, start_time, end_time, instructor_id, facility_id||null, lesson_type, license_type, max_students||1, lesson_master_id||null);

    // 教習生を指定した場合は予約も作成（定員まで・複数可）
    const cap = Number(max_students) || 1;
    const insRes = db.prepare(`INSERT INTO reservations (slot_id, student_id, stage, status) VALUES (?,?,?, '予約済')`);
    for (const sid of sids.slice(0, cap)) {
      insRes.run(Number(result.lastInsertRowid), sid, '第一段階');
    }

    res.redirect(`/reservations/admin?date=${slot_date}`);
  } finally {
    db.close();
  }
});

// 事務：スロット削除
router.post('/admin/slots/:id/delete', (req: Request, res: Response) => {
  const db = getDb();
  try {
    const slot = db.prepare('SELECT slot_date FROM slots WHERE id = ?').get(req.params.id) as { slot_date: string } | undefined;
    db.prepare('DELETE FROM reservations WHERE slot_id = ?').run(req.params.id);
    db.prepare('DELETE FROM slots WHERE id = ?').run(req.params.id);
    res.redirect(`/reservations/admin?date=${slot?.slot_date || ''}`);
  } finally {
    db.close();
  }
});

// 生徒：空き枠一覧
router.get('/book/:studentId', (req: Request, res: Response) => {
  const db = getDb();
  try {
    const student = db.prepare('SELECT * FROM students WHERE id = ?').get(req.params.studentId);
    if (!student) { res.status(404).render('error', { message: '生徒が見つかりません' }); return; }
    const s = student as { license_type: string; id: number; name: string };
    const today = new Date().toISOString().split('T')[0];
    const fromDate = req.query.from as string || today;

    const slots = db.prepare(`
      SELECT sl.*, i.name as instructor_name, f.name as facility_name, f.category as facility_category,
             lm.code as lesson_code, lm.name as lesson_name, lm.stage as lesson_stage,
             COUNT(r.id) as reserved_count
      FROM slots sl
      JOIN instructors i ON sl.instructor_id = i.id
      LEFT JOIN facilities f ON sl.facility_id = f.id
      LEFT JOIN lesson_master lm ON sl.lesson_master_id = lm.id
      LEFT JOIN reservations r ON r.slot_id = sl.id AND r.status = '予約済'
        AND NOT EXISTS (SELECT 1 FROM reservation_cancellations rc WHERE rc.reservation_id = r.id)
      WHERE sl.slot_date >= ? AND sl.slot_date < date(?, '+7 days')
        AND sl.license_type = ? AND sl.status = '受付中'
      GROUP BY sl.id ORDER BY sl.slot_date, sl.start_time
    `).all(fromDate, fromDate, s.license_type);

    const myReservations = db.prepare(`
      SELECT r.slot_id FROM reservations r JOIN slots sl ON r.slot_id = sl.id
      WHERE r.student_id = ? AND r.status = '予約済' AND sl.slot_date >= ?
        AND NOT EXISTS (SELECT 1 FROM reservation_cancellations rc WHERE rc.reservation_id = r.id)
    `).all(req.params.studentId, today) as { slot_id: number }[];

    res.render('reservations/book', { student, slots, fromDate, today, mySlotIds: myReservations.map(r => r.slot_id) });
  } finally {
    db.close();
  }
});

// 生徒：予約実行
router.post('/book/:studentId', (req: Request, res: Response) => {
  const { slot_id, stage, date } = req.body;
  const db = getDb();
  try {
    const slot = db.prepare(`
      SELECT s.*, COUNT(r.id) as reserved_count FROM slots s
      LEFT JOIN reservations r ON r.slot_id = s.id AND r.status = '予約済'
        AND NOT EXISTS (SELECT 1 FROM reservation_cancellations rc WHERE rc.reservation_id = r.id)
      WHERE s.id = ? GROUP BY s.id
    `).get(slot_id) as { max_students: number; reserved_count: number; status: string } | undefined;

    if (!slot || slot.status !== '受付中' || slot.reserved_count >= slot.max_students) {
      res.redirect(`/reservations/book/${req.params.studentId}?from=${date}&error=満席または受付終了`); return;
    }

    const dup = db.prepare(`
      SELECT r.id FROM reservations r JOIN slots sl ON r.slot_id = sl.id
      WHERE r.student_id = ? AND sl.slot_date=(SELECT slot_date FROM slots WHERE id=?)
        AND sl.start_time=(SELECT start_time FROM slots WHERE id=?) AND r.status='予約済'
        AND NOT EXISTS (SELECT 1 FROM reservation_cancellations rc WHERE rc.reservation_id = r.id)
    `).get(req.params.studentId, slot_id, slot_id);

    if (dup) {
      res.redirect(`/reservations/book/${req.params.studentId}?from=${date}&error=同時間帯にすでに予約があります`); return;
    }

    db.prepare(`INSERT INTO reservations (slot_id,student_id,stage,status) VALUES (?,?,?,'予約済')`).run(slot_id, req.params.studentId, stage||'第一段階');
    res.redirect(`/reservations/book/${req.params.studentId}?from=${date}&success=1`);
  } finally {
    db.close();
  }
});

// 生徒：予約キャンセル
router.post('/cancel/:reservationId', (req: Request, res: Response) => {
  const { student_id, date } = req.body;
  const db = getDb();
  try {
    // 取消イベントをreservation_cancellationsにINSERT（UPDATEしない）
    const reservation = db.prepare(`
      SELECT r.slot_id FROM reservations r
      LEFT JOIN reservation_cancellations c ON c.reservation_id = r.id
      WHERE r.id=? AND r.student_id=? AND c.id IS NULL AND r.status <> 'キャンセル'
    `).get(req.params.reservationId, student_id) as { slot_id: number } | undefined;
    if (reservation) {
      db.prepare(SQL_BOOKING_CANCEL_INSERT).run(req.params.reservationId, student_id);
    }
    const slotId = reservation?.slot_id;
    res.redirect(`/reservations/book/${student_id}?from=${date}`);
    if (slotId) promoteWaitlist(slotId);
  } finally {
    db.close();
  }
});

// 生徒：自分の予約一覧
router.get('/my/:studentId', (req: Request, res: Response) => {
  const db = getDb();
  try {
    const student = db.prepare('SELECT * FROM students WHERE id = ?').get(req.params.studentId);
    if (!student) { res.status(404).render('error', { message: '生徒が見つかりません' }); return; }
    const reservations = db.prepare(`
      SELECT r.*, sl.slot_date, sl.start_time, sl.end_time, sl.lesson_type, sl.license_type,
             i.name as instructor_name, f.name as facility_name
      FROM reservations r JOIN slots sl ON r.slot_id = sl.id
      JOIN instructors i ON sl.instructor_id = i.id
      LEFT JOIN facilities f ON sl.facility_id = f.id
      WHERE r.student_id = ? ORDER BY sl.slot_date DESC, sl.start_time DESC LIMIT 30
    `).all(req.params.studentId);
    const today = new Date().toISOString().split('T')[0];
    res.render('reservations/my', { student, reservations, today });
  } finally {
    db.close();
  }
});

export default router;
