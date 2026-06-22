import { Router, Request, Response } from 'express';
import { getDb } from '../db/schema';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  const db = getDb();
  const category = req.query.category as string || '';
  let query = 'SELECT * FROM facilities WHERE 1=1';
  const params: string[] = [];
  if (category) { query += ' AND category = ?'; params.push(category); }
  query += ' ORDER BY category, name';
  const facilities = db.prepare(query).all(...params);
  const categories = db.prepare('SELECT DISTINCT category FROM facilities ORDER BY category').all() as { category: string }[];
  db.close();
  res.render('facilities/index', { facilities, categories, category });
});

router.get('/new', (_req: Request, res: Response) => {
  res.render('facilities/form', { facility: null, error: null });
});

router.post('/', (req: Request, res: Response) => {
  const { name, category, license_type, capacity, status, note } = req.body;
  if (!name || !category) {
    return res.render('facilities/form', { facility: null, error: '設備名とカテゴリは必須です' });
  }
  const db = getDb();
  db.prepare(`INSERT INTO facilities (name,category,license_type,capacity,status,note) VALUES (?,?,?,?,?,?)`)
    .run(name, category, license_type||null, capacity||1, status||'使用可', note||null);
  db.close();
  res.redirect('/facilities');
});

router.get('/:id/edit', (req: Request, res: Response) => {
  const db = getDb();
  const facility = db.prepare('SELECT * FROM facilities WHERE id = ?').get(req.params.id);
  db.close();
  if (!facility) return res.status(404).render('error', { message: '設備が見つかりません' });
  res.render('facilities/form', { facility, error: null });
});

router.post('/:id/edit', (req: Request, res: Response) => {
  const { name, category, license_type, capacity, status, note } = req.body;
  if (!name || !category) {
    const db2 = getDb();
    const facility = db2.prepare('SELECT * FROM facilities WHERE id = ?').get(req.params.id);
    db2.close();
    return res.render('facilities/form', { facility, error: '設備名とカテゴリは必須です' });
  }
  const db = getDb();
  db.prepare(`UPDATE facilities SET name=?,category=?,license_type=?,capacity=?,status=?,note=? WHERE id=?`)
    .run(name, category, license_type||null, capacity||1, status, note||null, req.params.id);
  db.close();
  res.redirect('/facilities');
});

export default router;
