import { Router, Request, Response } from 'express';
import { getDb } from '../db/schema';

const router = Router();

// キャンセル待ち登録
router.post('/join', (req: Request, res: Response) => {
  const { slot_id, student_id } = req.body;
  const db = getDb();
  try {
    const existing = db.prepare(
      "SELECT id FROM waitlist WHERE slot_id=? AND student_id=? AND status='待機中'"
    ).get(slot_id, student_id);
    if (!existing) {
      db.prepare(`INSERT INTO waitlist (slot_id, student_id) VALUES (?, ?)`).run(slot_id, student_id);
    }
  } finally {
    db.close();
  }
  res.redirect(`/reservations/book/${student_id}?waitlisted=1`);
});

// キャンセル待ちキャンセル
router.post('/cancel/:id', (req: Request, res: Response) => {
  const { student_id } = req.body;
  const db = getDb();
  try {
    db.prepare(`UPDATE waitlist SET status='キャンセル' WHERE id=?`).run(req.params.id);
  } finally {
    db.close();
  }
  res.redirect(`/reservations/my/${student_id}`);
});

// キャンセル発生時に繰り上がり処理（reservations キャンセル後に呼ぶ）
export function promoteWaitlist(slotId: number): void {
  const db = getDb();
  try {
    const next = db.prepare(
      "SELECT * FROM waitlist WHERE slot_id=? AND status='待機中' ORDER BY created_at LIMIT 1"
    ).get(slotId) as { id: number; student_id: number } | undefined;
    if (!next) return;

    const slot = db.prepare('SELECT * FROM slots WHERE id=?').get(slotId) as any;
    const reserved = (db.prepare(
      "SELECT COUNT(*) as c FROM reservations WHERE slot_id=? AND status='予約済'"
    ).get(slotId) as { c: number }).c;

    if (reserved < slot.max_students) {
      db.prepare(`INSERT INTO reservations (slot_id, student_id, stage, status) VALUES (?,?,'第一段階','予約済')`).run(slotId, next.student_id);
      db.prepare(`UPDATE waitlist SET status='繰り上がり' WHERE id=?`).run(next.id);
      db.prepare(`INSERT INTO notifications (student_id, type, title, message) VALUES (?,?,?,?)`)
        .run(next.student_id, 'waitlist_promoted', 'キャンセル待ちが繰り上がりました', `${slot.slot_date} ${slot.start_time}〜${slot.end_time} の予約が確定しました`);
    }
  } finally {
    db.close();
  }
}

export default router;
