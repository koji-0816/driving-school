import { Router, Request, Response } from 'express';
import { getDb } from '../db/schema';
import { promoteWaitlist } from './waitlist';

const router = Router();

// 事務：スロット一覧 & 作成フォーム
router.get('/admin', (req: Request, res: Response) => {
  const db = getDb();
  try {
    const date = req.query.date as string || new Date().toISOString().split('T')[0];

    const slots = db.prepare(`
      SELECT s.*, i.name as instructor_name, f.name as facility_name, f.category as facility_category,
             COUNT(r.id) as reserved_count
      FROM slots s
      JOIN instructors i ON s.instructor_id = i.id
      LEFT JOIN facilities f ON s.facility_id = f.id
      LEFT JOIN reservations r ON r.slot_id = s.id AND r.status = '予約済'
      WHERE s.slot_date = ?
      GROUP BY s.id ORDER BY s.start_time, i.name
    `).all(date);

    const instructors = db.prepare(`SELECT * FROM instructors WHERE status = '在籍' ORDER BY name`).all();
    const facilities = db.prepare(`SELECT * FROM facilities WHERE status = '使用可' ORDER BY category, name`).all();
    res.render('reservations/admin', { slots, date, instructors, facilities, error: null });
  } finally {
    db.close();
  }
});

// 事務：スロット作成（ダブルブッキングチェック付き）
router.post('/admin/slots', (req: Request, res: Response) => {
  const { slot_date, start_time, end_time, instructor_id, facility_id, lesson_type, license_type, max_students } = req.body;
  const db = getDb();
  try {
    const instrDup = db.prepare(`
      SELECT id FROM slots WHERE slot_date=? AND instructor_id=? AND status='受付中'
      AND NOT (end_time <= ? OR start_time >= ?)
    `).get(slot_date, instructor_id, start_time, end_time);

    const facDup = facility_id ? db.prepare(`
      SELECT id FROM slots WHERE slot_date=? AND facility_id=? AND status='受付中'
      AND NOT (end_time <= ? OR start_time >= ?)
    `).get(slot_date, facility_id, start_time, end_time) : null;

    if (instrDup || facDup) {
      const slots = db.prepare(`
        SELECT s.*, i.name as instructor_name, f.name as facility_name, f.category as facility_category,
               COUNT(r.id) as reserved_count
        FROM slots s JOIN instructors i ON s.instructor_id = i.id
        LEFT JOIN facilities f ON s.facility_id = f.id
        LEFT JOIN reservations r ON r.slot_id = s.id AND r.status = '予約済'
        WHERE s.slot_date = ? GROUP BY s.id ORDER BY s.start_time, i.name
      `).all(slot_date);
      const instructors = db.prepare(`SELECT * FROM instructors WHERE status = '在籍' ORDER BY name`).all();
      const facilities = db.prepare(`SELECT * FROM facilities WHERE status = '使用可' ORDER BY category, name`).all();
      const errMsg = instrDup ? 'この教官はすでに同時間帯に枠があります' : 'この設備はすでに同時間帯に割当済みです（ダブルブッキング）';
      return res.render('reservations/admin', { slots, date: slot_date, instructors, facilities, error: errMsg });
    }

    db.prepare(`
      INSERT INTO slots (slot_date,start_time,end_time,instructor_id,facility_id,lesson_type,license_type,max_students)
      VALUES (?,?,?,?,?,?,?,?)
    `).run(slot_date, start_time, end_time, instructor_id, facility_id||null, lesson_type, license_type, max_students||1);
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
             COUNT(r.id) as reserved_count
      FROM slots sl
      JOIN instructors i ON sl.instructor_id = i.id
      LEFT JOIN facilities f ON sl.facility_id = f.id
      LEFT JOIN reservations r ON r.slot_id = sl.id AND r.status = '予約済'
      WHERE sl.slot_date >= ? AND sl.slot_date < date(?, '+7 days')
        AND sl.license_type = ? AND sl.status = '受付中'
      GROUP BY sl.id ORDER BY sl.slot_date, sl.start_time
    `).all(fromDate, fromDate, s.license_type);

    const myReservations = db.prepare(`
      SELECT r.slot_id FROM reservations r JOIN slots sl ON r.slot_id = sl.id
      WHERE r.student_id = ? AND r.status = '予約済' AND sl.slot_date >= ?
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
      WHERE s.id = ? GROUP BY s.id
    `).get(slot_id) as { max_students: number; reserved_count: number; status: string } | undefined;

    if (!slot || slot.status !== '受付中' || slot.reserved_count >= slot.max_students) {
      res.redirect(`/reservations/book/${req.params.studentId}?from=${date}&error=満席または受付終了`); return;
    }

    const dup = db.prepare(`
      SELECT r.id FROM reservations r JOIN slots sl ON r.slot_id = sl.id
      WHERE r.student_id = ? AND sl.slot_date=(SELECT slot_date FROM slots WHERE id=?)
        AND sl.start_time=(SELECT start_time FROM slots WHERE id=?) AND r.status='予約済'
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
    // キャンセルはINSERTではなくUPDATEを使用（予約IDとの紐付きを維持するため）
    const reservation = db.prepare(`SELECT slot_id FROM reservations WHERE id=? AND student_id=?`).get(req.params.reservationId, student_id) as { slot_id: number } | undefined;
    db.prepare(`UPDATE reservations SET status='キャンセル' WHERE id=? AND student_id=?`).run(req.params.reservationId, student_id);
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
