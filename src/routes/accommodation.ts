import { Router, Request, Response } from 'express';
import { getDb } from '../db/schema';
import {
  SQL_ACCOMMODATIONS_WITH_STATS, SQL_ACCOMMODATION_OCCUPANCY, SQL_RESIDENTS,
  SQL_ACCOMMODATION_INSERT, SQL_ACCOMMODATION_UPDATE,
  SQL_ROOMS_BY_ACCOMMODATION, SQL_ROOM_INSERT, SQL_ROOM_UPDATE,
  logEdit,
} from '../db/queries';

const router = Router();

// 施設登録フォーム（/:id より先に定義）
router.get('/new', (_req: Request, res: Response) => {
  res.render('accommodation/form', { accommodation: null, error: null });
});

// 施設一覧
router.get('/', (_req: Request, res: Response) => {
  const db = getDb();
  try {
    const accommodations = db.prepare(SQL_ACCOMMODATIONS_WITH_STATS).all() as {
      id: number; name: string; status: string; note: string; total_rooms: number; total_capacity: number;
    }[];
    const occupancy = db.prepare(SQL_ACCOMMODATION_OCCUPANCY).all() as { accommodation_id: number; occupied: number }[];
    const residents = db.prepare(SQL_RESIDENTS).all();

    const occupancyMap: Record<number, number> = {};
    for (const o of occupancy) occupancyMap[o.accommodation_id] = o.occupied;

    res.render('accommodation/index', { accommodations, residents, occupancyMap });
  } finally {
    db.close();
  }
});

// 施設登録
router.post('/', (req: Request, res: Response) => {
  const { name, note, status } = req.body;
  if (!name) return res.render('accommodation/form', { accommodation: null, error: '施設名は必須です' });
  const db = getDb();
  try {
    db.prepare(SQL_ACCOMMODATION_INSERT).run(name, note||null, status||'使用可');
  } finally {
    db.close();
  }
  res.redirect('/accommodation');
});

// 施設詳細（部屋一覧＋追加フォーム）
router.get('/:id', (req: Request, res: Response) => {
  const db = getDb();
  try {
    const accommodation = db.prepare('SELECT * FROM accommodations WHERE id = ?').get(req.params.id) as any;
    if (!accommodation) { res.status(404).render('error', { message: '施設が見つかりません' }); return; }
    const rooms = db.prepare(SQL_ROOMS_BY_ACCOMMODATION).all(req.params.id);
    res.render('accommodation/detail', { accommodation, rooms, error: null });
  } finally {
    db.close();
  }
});

// 部屋追加
router.post('/:id/rooms', (req: Request, res: Response) => {
  const { room_name, capacity, over_capacity, status, note } = req.body;
  const db = getDb();
  try {
    const accommodation = db.prepare('SELECT * FROM accommodations WHERE id = ?').get(req.params.id) as any;
    if (!accommodation) { res.status(404).render('error', { message: '施設が見つかりません' }); return; }

    if (!room_name) {
      const rooms = db.prepare(SQL_ROOMS_BY_ACCOMMODATION).all(req.params.id);
      return res.render('accommodation/detail', { accommodation, rooms, error: '部屋名は必須です' });
    }

    db.prepare(SQL_ROOM_INSERT).run(req.params.id, room_name, capacity||1, Number(over_capacity)||0, status||'使用可', note||null);
  } finally {
    db.close();
  }
  res.redirect(`/accommodation/${req.params.id}`);
});

// 部屋編集フォーム
router.get('/:id/rooms/:rid/edit', (req: Request, res: Response) => {
  const db = getDb();
  try {
    const accommodation = db.prepare('SELECT * FROM accommodations WHERE id = ?').get(req.params.id) as any;
    const room = db.prepare('SELECT * FROM rooms WHERE id = ? AND accommodation_id = ?').get(req.params.rid, req.params.id) as any;
    if (!accommodation || !room) { res.status(404).render('error', { message: '部屋が見つかりません' }); return; }
    res.render('accommodation/room_form', { accommodation, room, error: null });
  } finally {
    db.close();
  }
});

// 部屋更新
router.post('/:id/rooms/:rid/edit', (req: Request, res: Response) => {
  const { room_name, capacity, over_capacity, status, note } = req.body;
  const db = getDb();
  try {
    const accommodation = db.prepare('SELECT * FROM accommodations WHERE id = ?').get(req.params.id) as any;
    const before = db.prepare('SELECT * FROM rooms WHERE id = ? AND accommodation_id = ?').get(req.params.rid, req.params.id) as any;

    if (!before) { res.status(404).render('error', { message: '部屋が見つかりません' }); return; }
    if (!room_name) {
      return res.render('accommodation/room_form', { accommodation, room: before, error: '部屋名は必須です' });
    }

    // 変更差分を記録してからUPDATE（UPDATEの補完設計）
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    const after = { room_name, capacity: Number(capacity)||1, over_capacity: Number(over_capacity)||0, status: status||'使用可', note: note||null };
    for (const key of Object.keys(after) as (keyof typeof after)[]) {
      if (String(before[key] ?? '') !== String(after[key] ?? '')) {
        changes[key] = { from: before[key], to: after[key] };
      }
    }
    if (Object.keys(changes).length > 0) {
      db.prepare(`INSERT INTO edit_logs (table_name, record_id, changes) VALUES (?,?,?)`)
        .run('rooms', req.params.rid, JSON.stringify(changes));
    }

    db.prepare(SQL_ROOM_UPDATE).run(room_name, capacity||1, Number(over_capacity)||0, status||'使用可', note||null, req.params.rid);
  } finally {
    db.close();
  }
  res.redirect(`/accommodation/${req.params.id}`);
});

// 施設編集フォーム
router.get('/:id/edit', (req: Request, res: Response) => {
  const db = getDb();
  try {
    const accommodation = db.prepare('SELECT * FROM accommodations WHERE id = ?').get(req.params.id);
    if (!accommodation) { res.status(404).render('error', { message: '施設が見つかりません' }); return; }
    res.render('accommodation/form', { accommodation, error: null });
  } finally {
    db.close();
  }
});

// 施設更新
router.post('/:id/edit', (req: Request, res: Response) => {
  const { name, note, status } = req.body;
  const db = getDb();
  try {
    const before = db.prepare('SELECT * FROM accommodations WHERE id = ?').get(req.params.id) as any;
    if (!before) { res.status(404).render('error', { message: '施設が見つかりません' }); return; }
    if (!name) {
      return res.render('accommodation/form', { accommodation: before, error: '施設名は必須です' });
    }

    const changes: Record<string, { from: unknown; to: unknown }> = {};
    const after = { name, note: note||null, status };
    for (const key of Object.keys(after) as (keyof typeof after)[]) {
      if (String(before[key] ?? '') !== String(after[key] ?? '')) {
        changes[key] = { from: before[key], to: after[key] };
      }
    }
    if (Object.keys(changes).length > 0) {
      db.prepare(`INSERT INTO edit_logs (table_name, record_id, changes) VALUES (?,?,?)`)
        .run('accommodations', req.params.id, JSON.stringify(changes));
    }

    db.prepare(SQL_ACCOMMODATION_UPDATE).run(name, note||null, status, req.params.id);
  } finally {
    db.close();
  }
  res.redirect('/accommodation');
});

export default router;
