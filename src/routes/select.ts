import { Router, Request, Response } from 'express';
import { getDb } from '../db/schema';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  const db = getDb();
  try {
    const instructors = db.prepare(`SELECT id, name, kana, qualifications, status FROM instructors WHERE status = '在籍' ORDER BY id`).all() as any[];
    const students = db.prepare(`SELECT id, name, kana, student_type, license_type, status FROM students WHERE status = '在校' ORDER BY id`).all() as any[];
    res.render('select', { instructors, students });
  } finally {
    db.close();
  }
});

router.post('/', (req: Request, res: Response) => {
  const { role, user_id, user_name } = req.body;
  (req.session as any).role = role;
  (req.session as any).userId = user_id;
  (req.session as any).userName = user_name;

  if (role === 'admin') res.redirect('/');
  else if (role === 'staff') res.redirect('/schedule');
  else if (role === 'instructor') res.redirect(`/instructors/${user_id}`);
  else if (role === 'student') res.redirect(`/students/${user_id}`);
  else res.redirect('/');
});

export default router;
