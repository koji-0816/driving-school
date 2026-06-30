import { Router, Request, Response } from 'express';
import { getDb } from '../db/schema';
import { SQL_WAITLIST_EVENT_INSERT } from '../db/queries';

const router = Router();

// キャンセル待ち登録
router.post('/join', (req: Request, res: Response) => {
  const { slot_id, student_id } = req.body;
  const db = getDb();
  try {
    // 有効なキャンセル待ちの重複チェック（新旧両対応）
    const existing = db.prepare(`
      SELECT w.id FROM waitlist w
      LEFT JOIN waitlist_events e ON e.waitlist_id = w.id
      WHERE w.slot_id = ? AND w.student_id = ? AND e.id IS NULL AND w.status = '待機中'
    `).get(slot_id, student_id);
    if (!existing) {
      db.prepare(`INSERT INTO waitlist (slot_id, student_id) VALUES (?, ?)`).run(slot_id, student_id);
    }
  } finally {
    db.close();
  }
  res.redirect(`/reservations/book/${student_id}?waitlisted=1`);
});

// キャンセル待ちキャンセル（取消イベントをINSERT・UPDATEしない）
router.post('/cancel/:id', (req: Request, res: Response) => {
  const { student_id } = req.body;
  const db = getDb();
  try {
    db.prepare(SQL_WAITLIST_EVENT_INSERT).run(req.params.id, 'CANCELLED');
  } finally {
    db.close();
  }
  res.redirect(`/reservations/my/${student_id}`);
});

export default router;
