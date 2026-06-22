import { Router, Request, Response } from 'express';
import { getDb } from '../db/schema';

const router = Router();

// 事務：スロット一覧 & 作成フォーム
router.get('/admin', (req: Request, res: Response) => {
  const db = getDb();
  const date = req.query.date as string || new Date().toISOString().split('T')[0];

  const slots = db.prepare(`
    SELECT s.*,
           i.name as instructor_name,
           v.vehicle_no,
           COUNT(r.id) as reserved_count
    FROM slots s
    JOIN instructors i ON s.instructor_id = i.id
    LEFT JOIN vehicles v ON s.vehicle_id = v.id
    LEFT JOIN reservations r ON r.slot_id = s.id AND r.status = '予約済'
    WHERE s.slot_date = ?
    GROUP BY s.id
    ORDER BY s.start_time, i.name
  `).all(date);

  const instructors = db.prepare(`SELECT * FROM instructors WHERE status = '在籍' ORDER BY name`).all();
  const vehicles = db.prepare(`SELECT * FROM vehicles WHERE status = '稼働中' ORDER BY license_type, vehicle_no`).all();

  db.close();
  res.render('reservations/admin', { slots, date, instructors, vehicles });
});

// 事務：スロット作成
router.post('/admin/slots', (req: Request, res: Response) => {
  const { slot_date, start_time, end_time, instructor_id, vehicle_id, lesson_type, license_type, max_students } = req.body;
  const db = getDb();
  db.prepare(`
    INSERT INTO slots (slot_date, start_time, end_time, instructor_id, vehicle_id, lesson_type, license_type, max_students)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(slot_date, start_time, end_time, instructor_id, vehicle_id || null, lesson_type, license_type, max_students || 1);
  db.close();
  res.redirect(`/reservations/admin?date=${slot_date}`);
});

// 事務：スロット削除
router.post('/admin/slots/:id/delete', (req: Request, res: Response) => {
  const db = getDb();
  const slot = db.prepare('SELECT slot_date FROM slots WHERE id = ?').get(req.params.id) as { slot_date: string } | undefined;
  db.prepare('DELETE FROM reservations WHERE slot_id = ?').run(req.params.id);
  db.prepare('DELETE FROM slots WHERE id = ?').run(req.params.id);
  db.close();
  res.redirect(`/reservations/admin?date=${slot?.slot_date || ''}`);
});

// 生徒：空き枠一覧（生徒IDを指定して見る想定）
router.get('/book/:studentId', (req: Request, res: Response) => {
  const db = getDb();
  const student = db.prepare('SELECT * FROM students WHERE id = ?').get(req.params.studentId);
  if (!student) { db.close(); res.status(404).render('error', { message: '生徒が見つかりません' }); return; }

  const s = student as { license_type: string; id: number; name: string };
  const today = new Date().toISOString().split('T')[0];

  // 表示開始日（クエリ or 今日）
  const fromDate = req.query.from as string || today;

  // 7日分取得
  const slots = db.prepare(`
    SELECT sl.*,
           i.name as instructor_name,
           v.vehicle_no,
           COUNT(r.id) as reserved_count
    FROM slots sl
    JOIN instructors i ON sl.instructor_id = i.id
    LEFT JOIN vehicles v ON sl.vehicle_id = v.id
    LEFT JOIN reservations r ON r.slot_id = sl.id AND r.status = '予約済'
    WHERE sl.slot_date >= ?
      AND sl.slot_date < date(?, '+7 days')
      AND sl.license_type = ?
      AND sl.status = '受付中'
    GROUP BY sl.id
    ORDER BY sl.slot_date, sl.start_time
  `).all(fromDate, fromDate, s.license_type);

  const myReservations = db.prepare(`
    SELECT r.slot_id FROM reservations r
    JOIN slots sl ON r.slot_id = sl.id
    WHERE r.student_id = ? AND r.status = '予約済' AND sl.slot_date >= ?
  `).all(req.params.studentId, today) as { slot_id: number }[];

  db.close();
  res.render('reservations/book', {
    student,
    slots,
    fromDate,
    today,
    mySlotIds: myReservations.map(r => r.slot_id),
  });
});

// 生徒：予約実行
router.post('/book/:studentId', (req: Request, res: Response) => {
  const { slot_id, stage, date } = req.body;
  const db = getDb();

  // 空き確認
  const slot = db.prepare(`
    SELECT s.*, COUNT(r.id) as reserved_count
    FROM slots s
    LEFT JOIN reservations r ON r.slot_id = s.id AND r.status = '予約済'
    WHERE s.id = ?
    GROUP BY s.id
  `).get(slot_id) as { max_students: number; reserved_count: number; status: string } | undefined;

  if (!slot || slot.status !== '受付中' || slot.reserved_count >= slot.max_students) {
    db.close();
    res.redirect(`/reservations/book/${req.params.studentId}?date=${date}&error=満席または受付終了`);
    return;
  }

  // 重複予約チェック（同日同時間帯）
  const dup = db.prepare(`
    SELECT r.id FROM reservations r
    JOIN slots sl ON r.slot_id = sl.id
    WHERE r.student_id = ? AND sl.slot_date = (SELECT slot_date FROM slots WHERE id = ?)
      AND sl.start_time = (SELECT start_time FROM slots WHERE id = ?)
      AND r.status = '予約済'
  `).get(req.params.studentId, slot_id, slot_id);

  if (dup) {
    db.close();
    res.redirect(`/reservations/book/${req.params.studentId}?date=${date}&error=同時間帯にすでに予約があります`);
    return;
  }

  db.prepare(`
    INSERT INTO reservations (slot_id, student_id, stage, status) VALUES (?, ?, ?, '予約済')
  `).run(slot_id, req.params.studentId, stage || '第一段階');

  db.close();
  res.redirect(`/reservations/book/${req.params.studentId}?date=${date}&success=1`);
});

// 生徒：予約キャンセル
router.post('/cancel/:reservationId', (req: Request, res: Response) => {
  const { student_id, date } = req.body;
  const db = getDb();
  db.prepare(`UPDATE reservations SET status = 'キャンセル' WHERE id = ? AND student_id = ?`)
    .run(req.params.reservationId, student_id);
  db.close();
  res.redirect(`/reservations/book/${student_id}?date=${date}`);
});

// 生徒：自分の予約一覧
router.get('/my/:studentId', (req: Request, res: Response) => {
  const db = getDb();
  const student = db.prepare('SELECT * FROM students WHERE id = ?').get(req.params.studentId);
  if (!student) { db.close(); res.status(404).render('error', { message: '生徒が見つかりません' }); return; }

  const today = new Date().toISOString().split('T')[0];
  const reservations = db.prepare(`
    SELECT r.*,
           sl.slot_date, sl.start_time, sl.end_time, sl.lesson_type, sl.license_type,
           i.name as instructor_name, v.vehicle_no
    FROM reservations r
    JOIN slots sl ON r.slot_id = sl.id
    JOIN instructors i ON sl.instructor_id = i.id
    LEFT JOIN vehicles v ON sl.vehicle_id = v.id
    WHERE r.student_id = ?
    ORDER BY sl.slot_date DESC, sl.start_time DESC
    LIMIT 30
  `).all(req.params.studentId);

  db.close();
  res.render('reservations/my', { student, reservations, today });
});

export default router;
