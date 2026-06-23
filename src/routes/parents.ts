import { Router, Request, Response } from 'express';
import { getDb } from '../db/schema';
import { buildCurriculumProgress } from '../db/queries';

const router = Router();

// 保護者ビュー（読み取り専用）
router.get('/:student_id', (req: Request, res: Response) => {
  const db = getDb();
  try {
    const student = db.prepare(`
      SELECT s.*, r.room_name, a.name as accommodation_name
      FROM students s
      LEFT JOIN rooms r ON s.room_id = r.id
      LEFT JOIN accommodations a ON r.accommodation_id = a.id
      WHERE s.id = ?
    `).get(req.params.student_id) as any;
    if (!student) { res.status(404).render('error', { message: '生徒が見つかりません' }); return; }

    const progress = buildCurriculumProgress(db, String(req.params.student_id), String(student.license_type));
    const completed = progress.filter(p => p.status === 'completed').length;
    const total     = progress.length;

    const exams = db.prepare(`
      SELECT e.*, i.name as examiner_name FROM exams e
      LEFT JOIN instructors i ON e.examiner_id = i.id
      WHERE e.student_id = ? ORDER BY e.exam_date DESC
    `).all(req.params.student_id);

    const upcomingReservations = db.prepare(`
      SELECT r.*, sl.slot_date, sl.start_time, sl.end_time, sl.lesson_type, i.name as instructor_name
      FROM reservations r
      JOIN slots sl ON r.slot_id = sl.id
      LEFT JOIN instructors i ON sl.instructor_id = i.id
      WHERE r.student_id = ? AND r.status = '予約済' AND sl.slot_date >= date('now','localtime')
      ORDER BY sl.slot_date, sl.start_time LIMIT 5
    `).all(req.params.student_id);

    const addMonths = (dateStr: string, months: number): string => {
      const d = new Date(dateStr);
      d.setMonth(d.getMonth() + months);
      return d.toISOString().split('T')[0];
    };
    const today = new Date().toISOString().split('T')[0];
    const diffDays = (target: string): number =>
      Math.floor((new Date(target).getTime() - new Date(today).getTime()) / 86400000);

    const deadlines: { label: string; date: string; diff: number }[] = [];
    if (student.lesson_start_date) {
      const d = addMonths(student.lesson_start_date, 9);
      deadlines.push({ label: '教習期限', date: d, diff: diffDays(d) });
    }
    if (student.provisional_license_date) {
      const d = addMonths(student.provisional_license_date, 6);
      deadlines.push({ label: '仮免許期限', date: d, diff: diffDays(d) });
    }
    if (student.stage2_complete_date) {
      const d = addMonths(student.stage2_complete_date, 3);
      deadlines.push({ label: '卒業検定期限', date: d, diff: diffDays(d) });
    }

    res.render('parents/view', { student, progress, completed, total, exams, upcomingReservations, deadlines });
  } finally {
    db.close();
  }
});

export default router;
