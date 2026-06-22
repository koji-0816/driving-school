import { Router, Request, Response } from 'express';
import { getDb } from '../db/schema';
import { SQL_FACILITY_INSERT, SQL_FACILITY_UPDATE } from '../db/queries';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  const db = getDb();
  try {
    const category = req.query.category as string || '';
    let query = 'SELECT * FROM facilities WHERE 1=1';
    const params: string[] = [];
    if (category) { query += ' AND category = ?'; params.push(category); }
    query += ' ORDER BY category, name';
    const facilities = db.prepare(query).all(...params);
    const categories = db.prepare('SELECT DISTINCT category FROM facilities ORDER BY category').all() as { category: string }[];
    res.render('facilities/index', { facilities, categories, category });
  } finally {
    db.close();
  }
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
  try {
    db.prepare(SQL_FACILITY_INSERT).run(name, category, license_type||null, capacity||1, status||'使用可', note||null);
  } finally {
    db.close();
  }
  res.redirect('/facilities');
});

router.get('/:id/edit', (req: Request, res: Response) => {
  const db = getDb();
  try {
    const facility = db.prepare('SELECT * FROM facilities WHERE id = ?').get(req.params.id);
    if (!facility) { res.status(404).render('error', { message: '設備が見つかりません' }); return; }
    res.render('facilities/form', { facility, error: null });
  } finally {
    db.close();
  }
});

router.post('/:id/edit', (req: Request, res: Response) => {
  const { name, category, license_type, capacity, status, note } = req.body;
  const db = getDb();
  try {
    const before = db.prepare('SELECT * FROM facilities WHERE id = ?').get(req.params.id) as any;
    if (!before) { res.status(404).render('error', { message: '設備が見つかりません' }); return; }
    if (!name || !category) {
      return res.render('facilities/form', { facility: before, error: '設備名とカテゴリは必須です' });
    }

    const changes: Record<string, { from: unknown; to: unknown }> = {};
    const after = { name, category, license_type: license_type||null, capacity: Number(capacity)||1, status, note: note||null };
    for (const key of Object.keys(after) as (keyof typeof after)[]) {
      if (String(before[key] ?? '') !== String(after[key] ?? '')) {
        changes[key] = { from: before[key], to: after[key] };
      }
    }
    if (Object.keys(changes).length > 0) {
      db.prepare(`INSERT INTO edit_logs (table_name, record_id, changes) VALUES (?,?,?)`)
        .run('facilities', req.params.id, JSON.stringify(changes));
    }

    db.prepare(SQL_FACILITY_UPDATE).run(name, category, license_type||null, capacity||1, status, note||null, req.params.id);
  } finally {
    db.close();
  }
  res.redirect('/facilities');
});

export default router;
