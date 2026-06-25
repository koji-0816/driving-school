import { Router, Request, Response } from 'express';
import { getDb } from '../db/schema';
import {
  SQL_INSTRUCTOR_SCHEDULE, SQL_INSTRUCTORS_ALL,
  SQL_INSTRUCTOR_INSERT, SQL_INSTRUCTOR_UPDATE, logEdit,
} from '../db/queries';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  const db = getDb();
  try {
    const instructors = db.prepare(SQL_INSTRUCTORS_ALL).all();
    res.render('instructors/index', { instructors });
  } finally {
    db.close();
  }
});

// 新規登録フォーム（/:id より先に定義）
router.get('/new', (_req: Request, res: Response) => {
  res.render('instructors/form', { instructor: null, error: null });
});

// 新規登録
router.post('/', (req: Request, res: Response) => {
  const { name, kana, qualifications, is_examiner, examiner_qualifications, status } = req.body;
  if (!name || !kana) {
    return res.render('instructors/form', { instructor: null, error: '氏名・フリガナは必須です' });
  }
  const db = getDb();
  try {
    db.prepare(SQL_INSTRUCTOR_INSERT).run(
      name, kana, qualifications || '普通車',
      is_examiner ? 1 : 0, examiner_qualifications || '', status || '在籍'
    );
  } finally {
    db.close();
  }
  res.redirect('/instructors');
});

router.get('/:id', (req: Request, res: Response) => {
  const db = getDb();
  try {
    const instructor = db.prepare('SELECT * FROM instructors WHERE id = ?').get(req.params.id);
    if (!instructor) { res.status(404).render('error', { message: '教官が見つかりません' }); return; }

    const today = new Date().toISOString().split('T')[0];
    const schedule = db.prepare(SQL_INSTRUCTOR_SCHEDULE).all(req.params.id, today);

    const monthStats = db.prepare(`
      SELECT COUNT(*) as total,
             SUM(CASE WHEN status = '完了' THEN 1 ELSE 0 END) as done
      FROM lessons WHERE instructor_id = ?
      AND lesson_date >= date('now', 'start of month', 'localtime')
    `).get(req.params.id) as { total: number; done: number };

    res.render('instructors/detail', { instructor, schedule, monthStats });
  } finally {
    db.close();
  }
});

// 編集フォーム
router.get('/:id/edit', (req: Request, res: Response) => {
  const db = getDb();
  try {
    const instructor = db.prepare('SELECT * FROM instructors WHERE id = ?').get(req.params.id);
    if (!instructor) { res.status(404).render('error', { message: '教官が見つかりません' }); return; }
    res.render('instructors/form', { instructor, error: null });
  } finally {
    db.close();
  }
});

// 更新（マスタ語彙の変更。差分を edit_logs に記録した上でUPDATE＝既存方式に合わせる）
router.post('/:id/edit', (req: Request, res: Response) => {
  const { name, kana, qualifications, is_examiner, examiner_qualifications, status } = req.body;
  const db = getDb();
  try {
    const before = db.prepare('SELECT * FROM instructors WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
    if (!before) { res.status(404).render('error', { message: '教官が見つかりません' }); return; }
    if (!name || !kana) {
      return res.render('instructors/form', { instructor: before, error: '氏名・フリガナは必須です' });
    }

    const after = {
      name, kana, qualifications: qualifications || '普通車',
      is_examiner: is_examiner ? 1 : 0,
      examiner_qualifications: examiner_qualifications || '',
      status: status || '在籍',
    };
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const key of Object.keys(after) as (keyof typeof after)[]) {
      if (String(before[key] ?? '') !== String(after[key] ?? '')) {
        changes[key] = { from: before[key], to: after[key] };
      }
    }
    if (Object.keys(changes).length > 0) logEdit('instructors', String(req.params.id), changes);

    db.prepare(SQL_INSTRUCTOR_UPDATE).run(
      after.name, after.kana, after.qualifications,
      after.is_examiner, after.examiner_qualifications, after.status,
      String(req.params.id)
    );
  } finally {
    db.close();
  }
  res.redirect(`/instructors/${req.params.id}`);
});

export default router;
