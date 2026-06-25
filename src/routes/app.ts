import { Router, Request, Response } from 'express';
import { getDb } from '../db/schema';
import { SQL_STUDENT_DETAIL, buildCurriculumProgress } from '../db/queries';

const router = Router();

// 期限計算（students.ts の calcDeadlines と同一ロジック。デモ画面用に必要分のみ）
function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().split('T')[0];
}

function diffDays(target: string): number {
  const today = new Date().toISOString().split('T')[0];
  return Math.floor((new Date(target).getTime() - new Date(today).getTime()) / 86400000);
}

// 教習生スマホアプリ画面（デモ用・見せ球）
router.get('/:student_id', (req: Request, res: Response) => {
  const db = getDb();
  try {
    const student = db.prepare(SQL_STUDENT_DETAIL).get(req.params.student_id) as Record<string, any> | undefined;
    if (!student) { res.status(404).render('error', { message: '生徒が見つかりません' }); return; }

    const licenseType = (student.license_type as string) || '普通車';
    const progress = buildCurriculumProgress(db, String(req.params.student_id), licenseType);
    const completed = progress.filter(p => p.status === 'completed').length;
    const total     = progress.length;
    const available = progress.filter(p => p.status === 'available');

    // 次回予約（直近5件）
    const upcoming = db.prepare(`
      SELECT r.id, sl.slot_date, sl.start_time, sl.end_time, sl.lesson_type,
             i.name as instructor_name, lm.name as lesson_name, lm.stage as lesson_stage
      FROM reservations r
      JOIN slots sl ON r.slot_id = sl.id
      LEFT JOIN instructors i ON sl.instructor_id = i.id
      LEFT JOIN lesson_master lm ON sl.lesson_master_id = lm.id
      WHERE r.student_id = ? AND r.status = '予約済' AND sl.slot_date >= date('now','localtime')
      ORDER BY sl.slot_date, sl.start_time LIMIT 5
    `).all(req.params.student_id) as any[];

    // キャンセル待ち（待機中）
    const waiting = db.prepare(`
      SELECT w.id, sl.slot_date, sl.start_time, sl.lesson_type, lm.name as lesson_name
      FROM waitlist w
      JOIN slots sl ON w.slot_id = sl.id
      LEFT JOIN lesson_master lm ON sl.lesson_master_id = lm.id
      WHERE w.student_id = ? AND w.status = '待機中'
      ORDER BY sl.slot_date, sl.start_time
    `).all(req.params.student_id) as any[];

    // 未読通知件数
    const unread = (db.prepare(
      `SELECT COUNT(*) as c FROM notifications WHERE student_id = ? AND is_read = 0`
    ).get(req.params.student_id) as { c: number }).c;

    // 期限アラート（近い順。students.ts の calcDeadlines と同基準）
    const deadlines: { label: string; date: string; days: number }[] = [];
    if (student.lesson_start_date) {
      const d = addMonths(student.lesson_start_date, 9);
      deadlines.push({ label: '教習期限', date: d, days: diffDays(d) });
    }
    if (student.provisional_license_date) {
      const d = addMonths(student.provisional_license_date, 6);
      deadlines.push({ label: '仮免許期限', date: d, days: diffDays(d) });
    }
    if (student.stage2_complete_date) {
      const d = addMonths(student.stage2_complete_date, 3);
      deadlines.push({ label: '卒検期限', date: d, days: diffDays(d) });
    }
    deadlines.sort((a, b) => a.days - b.days);
    // 一番近い期限のみ前面に出す（残90日以内のときだけ警告扱い）
    const nearestDeadline = deadlines.length > 0 ? deadlines[0] : null;

    res.render('app/home', {
      student, completed, total, available,
      upcoming, waiting, unread, nearestDeadline,
    });
  } finally {
    db.close();
  }
});

export default router;
