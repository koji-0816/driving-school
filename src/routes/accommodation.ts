import { Router, Request, Response } from 'express';
import { getDb } from '../db/schema';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  const db = getDb();
  const accommodations = db.prepare('SELECT * FROM accommodations').all() as {
    id: number; name: string; total_rooms: number; status: string; note: string;
  }[];
  const residents = db.prepare(`
    SELECT s.*, a.name as accommodation_name FROM students s
    JOIN accommodations a ON s.accommodation_id = a.id
    WHERE s.status = '在校' ORDER BY a.id, s.room_number
  `).all();
  const occupancyByAccom = db.prepare(`
    SELECT accommodation_id, COUNT(*) as c FROM students WHERE status = '在校' AND accommodation_id IS NOT NULL GROUP BY accommodation_id
  `).all() as { accommodation_id: number; c: number }[];
  db.close();

  const occupancyMap: Record<number, number> = {};
  for (const r of occupancyByAccom) occupancyMap[r.accommodation_id] = r.c;

  res.render('accommodation/index', { accommodations, residents, occupancyMap });
});

// 新規登録フォーム
router.get('/new', (_req: Request, res: Response) => {
  res.render('accommodation/form', { accommodation: null, error: null });
});

// 新規登録処理
router.post('/', (req: Request, res: Response) => {
  const { name, total_rooms, note, status } = req.body;
  if (!name || !total_rooms) {
    return res.render('accommodation/form', { accommodation: null, error: '施設名と部屋数は必須です' });
  }
  const db = getDb();
  db.prepare(`INSERT INTO accommodations (name, total_rooms, note, status) VALUES (?,?,?,?)`).run(name, total_rooms, note||null, status||'使用可');
  db.close();
  res.redirect('/accommodation');
});

// 編集フォーム
router.get('/:id/edit', (req: Request, res: Response) => {
  const db = getDb();
  const accommodation = db.prepare('SELECT * FROM accommodations WHERE id = ?').get(req.params.id);
  db.close();
  if (!accommodation) return res.status(404).render('error', { message: '施設が見つかりません' });
  res.render('accommodation/form', { accommodation, error: null });
});

// 編集処理
router.post('/:id/edit', (req: Request, res: Response) => {
  const { name, total_rooms, note, status } = req.body;
  if (!name || !total_rooms) {
    const db2 = getDb();
    const accommodation = db2.prepare('SELECT * FROM accommodations WHERE id = ?').get(req.params.id);
    db2.close();
    return res.render('accommodation/form', { accommodation, error: '施設名と部屋数は必須です' });
  }
  const db = getDb();
  db.prepare(`UPDATE accommodations SET name=?,total_rooms=?,note=?,status=? WHERE id=?`).run(name, total_rooms, note||null, status, req.params.id);
  db.close();
  res.redirect('/accommodation');
});

export default router;
