import { Router, Request, Response } from 'express';
import { getDb } from '../db/schema';

const router = Router();

// 施設登録フォーム（/:id より先に定義）
router.get('/new', (_req: Request, res: Response) => {
  res.render('accommodation/form', { accommodation: null, error: null });
});

// 施設一覧
router.get('/', (_req: Request, res: Response) => {
  const db = getDb();
  const accommodations = db.prepare(`
    SELECT a.*,
           COUNT(r.id) as total_rooms,
           SUM(CASE WHEN r.status = '使用可' THEN r.capacity ELSE 0 END) as total_capacity
    FROM accommodations a
    LEFT JOIN rooms r ON r.accommodation_id = a.id
    GROUP BY a.id
  `).all() as { id: number; name: string; status: string; note: string; total_rooms: number; total_capacity: number }[];

  const occupancy = db.prepare(`
    SELECT r.accommodation_id, COUNT(s.id) as occupied
    FROM rooms r
    JOIN students s ON s.room_id = r.id AND s.status = '在校'
    GROUP BY r.accommodation_id
  `).all() as { accommodation_id: number; occupied: number }[];

  const residents = db.prepare(`
    SELECT s.*, a.name as accommodation_name, r.room_name
    FROM students s
    JOIN rooms r ON s.room_id = r.id
    JOIN accommodations a ON r.accommodation_id = a.id
    WHERE s.status = '在校'
    ORDER BY a.id, r.room_name
  `).all();

  db.close();

  const occupancyMap: Record<number, number> = {};
  for (const o of occupancy) occupancyMap[o.accommodation_id] = o.occupied;

  res.render('accommodation/index', { accommodations, residents, occupancyMap });
});

// 施設詳細（部屋一覧＋追加フォーム）
router.get('/:id', (req: Request, res: Response) => {
  const db = getDb();
  const accommodation = db.prepare('SELECT * FROM accommodations WHERE id = ?').get(req.params.id) as any;
  if (!accommodation) { db.close(); return res.status(404).render('error', { message: '施設が見つかりません' }); }

  const rooms = db.prepare(`
    SELECT r.*, COUNT(s.id) as occupied
    FROM rooms r
    LEFT JOIN students s ON s.room_id = r.id AND s.status = '在校'
    WHERE r.accommodation_id = ?
    GROUP BY r.id
    ORDER BY r.room_name
  `).all(req.params.id);

  db.close();
  res.render('accommodation/detail', { accommodation, rooms, error: null });
});

// 部屋追加
router.post('/:id/rooms', (req: Request, res: Response) => {
  const { room_name, capacity, status, note } = req.body;
  const db = getDb();
  const accommodation = db.prepare('SELECT * FROM accommodations WHERE id = ?').get(req.params.id) as any;
  if (!accommodation) { db.close(); return res.status(404).render('error', { message: '施設が見つかりません' }); }

  if (!room_name) {
    const rooms = db.prepare(`
      SELECT r.*, COUNT(s.id) as occupied FROM rooms r
      LEFT JOIN students s ON s.room_id = r.id AND s.status = '在校'
      WHERE r.accommodation_id = ? GROUP BY r.id ORDER BY r.room_name
    `).all(req.params.id);
    db.close();
    return res.render('accommodation/detail', { accommodation, rooms, error: '部屋名は必須です' });
  }

  db.prepare(`INSERT INTO rooms (accommodation_id,room_name,capacity,status,note) VALUES (?,?,?,?,?)`)
    .run(req.params.id, room_name, capacity || 1, status || '使用可', note || null);
  db.close();
  res.redirect(`/accommodation/${req.params.id}`);
});

// 部屋編集フォーム
router.get('/:id/rooms/:rid/edit', (req: Request, res: Response) => {
  const db = getDb();
  const accommodation = db.prepare('SELECT * FROM accommodations WHERE id = ?').get(req.params.id) as any;
  const room = db.prepare('SELECT * FROM rooms WHERE id = ? AND accommodation_id = ?').get(req.params.rid, req.params.id) as any;
  db.close();
  if (!accommodation || !room) return res.status(404).render('error', { message: '部屋が見つかりません' });
  res.render('accommodation/room_form', { accommodation, room, error: null });
});

// 部屋更新
router.post('/:id/rooms/:rid/edit', (req: Request, res: Response) => {
  const { room_name, capacity, status, note } = req.body;
  const db = getDb();
  const accommodation = db.prepare('SELECT * FROM accommodations WHERE id = ?').get(req.params.id) as any;
  const room = db.prepare('SELECT * FROM rooms WHERE id = ? AND accommodation_id = ?').get(req.params.rid, req.params.id) as any;

  if (!room_name) {
    db.close();
    return res.render('accommodation/room_form', { accommodation, room, error: '部屋名は必須です' });
  }

  db.prepare(`UPDATE rooms SET room_name=?,capacity=?,status=?,note=? WHERE id=?`)
    .run(room_name, capacity || 1, status || '使用可', note || null, req.params.rid);
  db.close();
  res.redirect(`/accommodation/${req.params.id}`);
});

// 施設登録
router.post('/', (req: Request, res: Response) => {
  const { name, note, status } = req.body;
  if (!name) return res.render('accommodation/form', { accommodation: null, error: '施設名は必須です' });
  const db = getDb();
  db.prepare(`INSERT INTO accommodations (name,note,status) VALUES (?,?,?)`).run(name, note || null, status || '使用可');
  db.close();
  res.redirect('/accommodation');
});

// 施設編集フォーム
router.get('/:id/edit', (req: Request, res: Response) => {
  const db = getDb();
  const accommodation = db.prepare('SELECT * FROM accommodations WHERE id = ?').get(req.params.id);
  db.close();
  if (!accommodation) return res.status(404).render('error', { message: '施設が見つかりません' });
  res.render('accommodation/form', { accommodation, error: null });
});

// 施設更新
router.post('/:id/edit', (req: Request, res: Response) => {
  const { name, note, status } = req.body;
  const db = getDb();
  if (!name) {
    const accommodation = db.prepare('SELECT * FROM accommodations WHERE id = ?').get(req.params.id);
    db.close();
    return res.render('accommodation/form', { accommodation, error: '施設名は必須です' });
  }
  db.prepare(`UPDATE accommodations SET name=?,note=?,status=? WHERE id=?`).run(name, note || null, status, req.params.id);
  db.close();
  res.redirect('/accommodation');
});

export default router;
