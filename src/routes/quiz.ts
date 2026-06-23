import { Router, Request, Response } from 'express';
import { getDb } from '../db/schema';

const router = Router();

// 模擬試験トップ（生徒用）
router.get('/:student_id', (req: Request, res: Response) => {
  const db = getDb();
  try {
    const student = db.prepare('SELECT id, name, license_type FROM students WHERE id=?').get(req.params.student_id) as any;
    if (!student) { res.status(404).render('error', { message: '生徒が見つかりません' }); return; }

    // カテゴリ別の正答率
    const stats = db.prepare(`
      SELECT q.category,
             COUNT(*) as total,
             SUM(r.is_correct) as correct
      FROM student_quiz_records r
      JOIN quiz_questions q ON r.question_id = q.id
      WHERE r.student_id = ?
      GROUP BY q.category
    `).all(req.params.student_id) as any[];

    // 苦手問題（直近3回以内に間違えた問題）
    const weakQuestions = db.prepare(`
      SELECT q.*, COUNT(*) as wrong_count
      FROM student_quiz_records r
      JOIN quiz_questions q ON r.question_id = q.id
      WHERE r.student_id = ? AND r.is_correct = 0
        AND r.created_at >= datetime('now', '-30 days', 'localtime')
      GROUP BY q.id
      ORDER BY wrong_count DESC LIMIT 5
    `).all(req.params.student_id);

    res.render('quiz/index', { student, stats, weakQuestions });
  } finally {
    db.close();
  }
});

// 模擬試験開始（10問ランダム or カテゴリ指定）
router.get('/:student_id/start', (req: Request, res: Response) => {
  const { category } = req.query;
  const db = getDb();
  try {
    const student = db.prepare('SELECT id, name, license_type FROM students WHERE id=?').get(req.params.student_id) as any;
    if (!student) { res.status(404).render('error', { message: '生徒が見つかりません' }); return; }

    let questions: any[];
    if (category) {
      questions = db.prepare(
        `SELECT * FROM quiz_questions WHERE license_type=? AND category=? ORDER BY RANDOM() LIMIT 10`
      ).all(student.license_type, category);
    } else {
      questions = db.prepare(
        `SELECT * FROM quiz_questions WHERE license_type=? ORDER BY RANDOM() LIMIT 10`
      ).all(student.license_type);
    }

    res.render('quiz/exam', { student, questions, category: category || '全カテゴリ' });
  } finally {
    db.close();
  }
});

// 模擬試験採点
router.post('/:student_id/submit', (req: Request, res: Response) => {
  const answers: Record<string, string> = req.body;
  const db = getDb();
  try {
    const student = db.prepare('SELECT id, name FROM students WHERE id=?').get(req.params.student_id) as any;
    const results: any[] = [];

    for (const [key, selected] of Object.entries(answers)) {
      if (!key.startsWith('q_')) continue;
      const qId = key.replace('q_', '');
      const question = db.prepare('SELECT * FROM quiz_questions WHERE id=?').get(qId) as any;
      if (!question) continue;
      const isCorrect = selected === question.answer ? 1 : 0;
      db.prepare(`INSERT INTO student_quiz_records (student_id, question_id, selected, is_correct) VALUES (?,?,?,?)`).run(req.params.student_id, qId, selected, isCorrect);
      results.push({ ...question, selected, isCorrect });
    }

    const correct = results.filter(r => r.isCorrect).length;
    res.render('quiz/result', { student, results, correct, total: results.length });
  } finally {
    db.close();
  }
});

export default router;
