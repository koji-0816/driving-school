import { Router, Request, Response } from 'express';
import { getDb } from '../db/schema';
import {
  SQL_ACCOMMODATIONS_WITH_STATS, SQL_ACCOMMODATION_OCCUPANCY, SQL_RESIDENTS,
  SQL_ACCOMMODATION_INSERT, SQL_ACCOMMODATION_UPDATE,
  SQL_ROOMS_BY_ACCOMMODATION, SQL_ROOM_INSERT, SQL_ROOM_UPDATE,
  SQL_ASSIGNMENTS_IN_RANGE, roomVacancyOn,
  logEdit,
} from '../db/queries';

const router = Router();

// 施設登録フォーム（/:id より先に定義）
router.get('/new', (_req: Request, res: Response) => {
  res.render('accommodation/form', { accommodation: null, error: null });
});

// 日別在室グリッド（見せ球・閲覧のみ）。在室・空きは保存せず割当イベント＋定員から導出
router.get('/occupancy', (req: Request, res: Response) => {
  const db = getDb();
  try {
    const today = new Date().toISOString().split('T')[0];
    const from = (req.query.from as string) || today;
    const days = Math.min(Math.max(Number(req.query.days) || 14, 7), 31);

    // 日付列
    const dates: string[] = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(from); d.setDate(d.getDate() + i);
      dates.push(d.toISOString().split('T')[0]);
    }
    const rangeEnd = dates[dates.length - 1];

    // 部屋（施設>部屋）
    const rooms = db.prepare(`
      SELECT r.id, r.room_name, r.capacity, r.over_capacity, r.accommodation_id,
             a.name AS accommodation_name
      FROM rooms r JOIN accommodations a ON a.id = r.accommodation_id
      WHERE r.status = '使用可'
      ORDER BY a.id, r.room_name
    `).all() as { id: number; room_name: string; capacity: number; over_capacity: number | null;
                  accommodation_id: number; accommodation_name: string }[];

    // 期間内の有効割当（valid_from<=末 AND valid_to>=始）
    const assignments = db.prepare(SQL_ASSIGNMENTS_IN_RANGE).all(rangeEnd, from) as Record<string, any>[];

    // grid[room_id][date] = { color, name, isStart, isExclusive } / 無ければ空き数
    const byRoom: Record<number, Record<string, any>> = {};
    for (const a of assignments) {
      for (const dt of dates) {
        if (a.valid_from <= dt && a.valid_to >= dt) {
          (byRoom[a.room_id] ||= {})[dt] = {
            color: a.color_code, name: a.student_name, usage: a.usage_name,
            isStart: dt === a.valid_from || dt === from, isExclusive: a.is_exclusive,
          };
        }
      }
    }

    // 空き数（割当が無いセル用）。状態を持たず導出
    const vacancy: Record<number, Record<string, number>> = {};
    for (const r of rooms) {
      vacancy[r.id] = {};
      for (const dt of dates) {
        if (!(byRoom[r.id] && byRoom[r.id][dt])) vacancy[r.id][dt] = roomVacancyOn(db, r.id, dt);
      }
    }

    const usageTypes = db.prepare('SELECT usage_code, display_name, color_code FROM m_room_usage_type ORDER BY sort_order').all();

    const prevD = new Date(from); prevD.setDate(prevD.getDate() - days);
    const nextD = new Date(from); nextD.setDate(nextD.getDate() + days);

    res.render('accommodation/occupancy', {
      rooms, dates, byRoom, vacancy, usageTypes, from, days, today,
      prevFrom: prevD.toISOString().split('T')[0],
      nextFrom: nextD.toISOString().split('T')[0],
    });
  } finally {
    db.close();
  }
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
