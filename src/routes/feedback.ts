import { Router, Request, Response } from 'express';
import { getDb } from '../db/schema';

const router = Router();

// フィードバック入力フォーム
router.get('/new/:student_id', (req: Request, res: Response) => {
  const db = getDb();
  try {
    const student = db.prepare('SELECT id, name FROM students WHERE id=?').get(req.params.student_id) as any;
    if (!student) { res.status(404).render('error', { message: '生徒が見つかりません' }); return; }

    const instructors = db.prepare("SELECT id, name FROM instructors WHERE status='在籍' ORDER BY id").all();
    const today = new Date().toISOString().split('T')[0];
    res.render('feedback/form', { student, instructors, today, error: null, success: false });
  } finally {
    db.close();
  }
});

// フィードバック登録
router.post('/new/:student_id', (req: Request, res: Response) => {
  const { lesson_date, instructor_id, rating, comment } = req.body;
  const db = getDb();
  try {
    db.prepare(`
      INSERT INTO lesson_feedback (student_id, lesson_date, instructor_id, rating, comment)
      VALUES (?, ?, ?, ?, ?)
    `).run(req.params.student_id, lesson_date, instructor_id || null, Number(rating), comment || null);

    const student = db.prepare('SELECT id, name FROM students WHERE id=?').get(req.params.student_id) as any;
    const instructors = db.prepare("SELECT id, name FROM instructors WHERE status='在籍' ORDER BY id").all();
    const today = new Date().toISOString().split('T')[0];
    res.render('feedback/form', { student, instructors, today, error: null, success: true });
  } finally {
    db.close();
  }
});

// フィードバック一覧（管理者用）
router.get('/admin', (_req: Request, res: Response) => {
  const db = getDb();
  try {
    const feedbacks = db.prepare(`
      SELECT f.*, s.name as student_name, i.name as instructor_name
      FROM lesson_feedback f
      JOIN students s ON f.student_id = s.id
      LEFT JOIN instructors i ON f.instructor_id = i.id
      ORDER BY f.created_at DESC LIMIT 100
    `).all();

    const stats = db.prepare(`
      SELECT instructor_id, i.name, AVG(rating) as avg_rating, COUNT(*) as cnt
      FROM lesson_feedback f
      JOIN instructors i ON f.instructor_id = i.id
      WHERE f.instructor_id IS NOT NULL
      GROUP BY f.instructor_id ORDER BY avg_rating DESC
    `).all();

    res.render('feedback/admin', { feedbacks, stats });
  } finally {
    db.close();
  }
});

export default router;
