import { Router, Request, Response } from 'express';
import { getDb } from '../db/schema';

const router = Router();

// 通知一覧（生徒用）
router.get('/:student_id', (req: Request, res: Response) => {
  const db = getDb();
  try {
    const student = db.prepare('SELECT id, name FROM students WHERE id=?').get(req.params.student_id) as any;
    if (!student) { res.status(404).render('error', { message: '生徒が見つかりません' }); return; }

    db.prepare(`UPDATE notifications SET is_read=1 WHERE student_id=? AND is_read=0`).run(req.params.student_id);

    const notifications = db.prepare(
      `SELECT * FROM notifications WHERE student_id=? ORDER BY created_at DESC LIMIT 50`
    ).all(req.params.student_id);

    res.render('notifications/index', { student, notifications });
  } finally {
    db.close();
  }
});

// 既読化（個別）
router.post('/read/:id', (req: Request, res: Response) => {
  const { student_id } = req.body;
  const db = getDb();
  try {
    db.prepare(`UPDATE notifications SET is_read=1 WHERE id=?`).run(req.params.id);
  } finally {
    db.close();
  }
  res.redirect(`/notifications/${student_id}`);
});

/**
 * 期限アラート自動生成（起動時・日次バッチ想定）
 * 既に同じ type+student_id の未読通知がある場合は重複生成しない
 */
export function generateDeadlineNotifications(): void {
  const db = getDb();
  try {
    const today = new Date();
    const students = db.prepare(
      `SELECT id, name, lesson_start_date, provisional_license_date, stage2_complete_date FROM students WHERE status='在校'`
    ).all() as any[];

    const addDays = (dateStr: string, days: number): string => {
      const d = new Date(dateStr);
      d.setDate(d.getDate() + days);
      return d.toISOString().split('T')[0];
    };
    const addMonths = (dateStr: string, months: number): string => {
      const d = new Date(dateStr);
      d.setMonth(d.getMonth() + months);
      return d.toISOString().split('T')[0];
    };
    const diffDays = (target: string): number =>
      Math.floor((new Date(target).getTime() - today.getTime()) / 86400000);

    const hasNotif = (studentId: number, type: string): boolean =>
      !!(db.prepare(`SELECT id FROM notifications WHERE student_id=? AND type=? AND is_read=0 AND date(created_at) = date('now','localtime')`).get(studentId, type));

    const notify = (studentId: number, type: string, title: string, message: string) => {
      if (!hasNotif(studentId, type)) {
        db.prepare(`INSERT INTO notifications (student_id, type, title, message) VALUES (?,?,?,?)`).run(studentId, type, title, message);
      }
    };

    for (const s of students) {
      const thresholds = [7, 30, 90];
      if (s.lesson_start_date) {
        const deadline = addMonths(s.lesson_start_date, 9);
        const diff = diffDays(deadline);
        if (thresholds.includes(diff)) notify(s.id, `deadline_lesson_${diff}d`, `教習期限まで残り${diff}日`, `教習期限は ${deadline} です。早めに教習を進めてください。`);
      }
      if (s.provisional_license_date) {
        const deadline = addMonths(s.provisional_license_date, 6);
        const diff = diffDays(deadline);
        if (thresholds.includes(diff)) notify(s.id, `deadline_prov_${diff}d`, `仮免許期限まで残り${diff}日`, `仮免許期限は ${deadline} です。第二段階を急いでください。`);
      }
      if (s.stage2_complete_date) {
        const deadline = addMonths(s.stage2_complete_date, 3);
        const diff = diffDays(deadline);
        if (thresholds.includes(diff)) notify(s.id, `deadline_stage2_${diff}d`, `卒業検定期限まで残り${diff}日`, `卒業検定期限は ${deadline} です。早めに受検してください。`);
      }
    }
  } finally {
    db.close();
  }
}

/** 生徒の未読通知数を返す */
export function getUnreadCount(studentId: number | string): number {
  const db = getDb();
  try {
    const row = db.prepare(`SELECT COUNT(*) as c FROM notifications WHERE student_id=? AND is_read=0`).get(studentId) as { c: number };
    return row.c;
  } finally {
    db.close();
  }
}

export default router;
