import { Router, Request, Response } from 'express';
import { getDb } from '../db/schema';
import { SQL_COURSES_LIST, SQL_COURSE_ONE, SQL_COURSE_LESSONS } from '../db/queries';

const router = Router();

// 教習コース一覧（閲覧のみ。現行版）
router.get('/', (_req: Request, res: Response) => {
  const db = getDb();
  try {
    const courses = db.prepare(SQL_COURSES_LIST).all();
    res.render('courses/index', { courses });
  } finally {
    db.close();
  }
});

// 教習コース詳細（閲覧のみ。必要教習一覧）
router.get('/:id', (req: Request, res: Response) => {
  const db = getDb();
  try {
    const course = db.prepare(SQL_COURSE_ONE).get(req.params.id) as Record<string, any> | undefined;
    if (!course) { res.status(404).render('error', { message: 'コースが見つかりません' }); return; }
    const lessons = db.prepare(SQL_COURSE_LESSONS).all(req.params.id) as Record<string, any>[];
    res.render('courses/detail', { course, lessons });
  } finally {
    db.close();
  }
});

export default router;
