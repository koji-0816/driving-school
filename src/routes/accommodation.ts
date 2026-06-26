import { Router, Request, Response } from 'express';
import { getDb } from '../db/schema';
import {
  SQL_ACCOMMODATIONS_WITH_STATS, SQL_ACCOMMODATION_OCCUPANCY, SQL_RESIDENTS,
  SQL_ACCOMMODATION_INSERT, SQL_ACCOMMODATION_UPDATE,
  SQL_ROOMS_BY_ACCOMMODATION, SQL_ROOM_INSERT, SQL_ROOM_UPDATE,
  SQL_ASSIGNMENTS_IN_RANGE, roomVacancyOn, SQL_ROOM_ACTIVE_COUNT_ON,
  SQL_ROOM_ASSIGNMENT_INSERT, SQL_ROOM_ASSIGNMENT_CANCEL, SQL_STUDENT_ACTIVE_ASSIGNMENTS,
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

    // grid[room_id][date]：割当の帯。氏名は表示範囲内の中央セルにのみ出す（Excel風）
    const byRoom: Record<number, Record<string, any>> = {};
    for (const a of assignments) {
      const span = dates.filter(dt => a.valid_from <= dt && a.valid_to >= dt);
      if (span.length === 0) continue;
      const midIdx = Math.floor((span.length - 1) / 2);
      span.forEach((dt, i) => {
        (byRoom[a.room_id] ||= {})[dt] = {
          color: a.color_code, name: a.student_name, usage: a.usage_name,
          isExclusive: a.is_exclusive,
          showName: i === midIdx,
          isStart: dt === span[0],
          isEnd: dt === span[span.length - 1],
        };
      });
    }

    // 空き数（割当が無いセル用）。状態を持たず導出
    const vacancy: Record<number, Record<string, number>> = {};
    for (const r of rooms) {
      vacancy[r.id] = {};
      for (const dt of dates) {
        if (!(byRoom[r.id] && byRoom[r.id][dt])) vacancy[r.id][dt] = roomVacancyOn(db, r.id, dt);
      }
    }

    // 部屋ごとの「今日の状態」要約（新データを持たず導出結果を表示に回すだけ）
    const todayAssign = db.prepare(SQL_ASSIGNMENTS_IN_RANGE).all(today, today) as Record<string, any>[];
    const todayByRoom: Record<number, Record<string, any>[]> = {};
    for (const a of todayAssign) (todayByRoom[a.room_id] ||= []).push(a);
    const roomStatus: Record<number, { vacancy: number; label: string; kind: string }> = {};
    for (const r of rooms) {
      const v = roomVacancyOn(db, r.id, today);
      const occ = todayByRoom[r.id] || [];
      let label: string, kind: string;
      if (occ.some(a => a.is_exclusive)) { label = 'シングル利用中'; kind = 'single'; }
      else if (occ.some(a => a.usage_code === 'OVER')) { label = `超過利用中（空き${v}）`; kind = 'over'; }
      else if (v <= 0) { label = '満室'; kind = 'full'; }
      else { label = `空き ${v}`; kind = 'free'; }
      roomStatus[r.id] = { vacancy: v, label, kind };
    }

    const usageTypes = db.prepare('SELECT usage_code, display_name, color_code FROM m_room_usage_type ORDER BY sort_order').all();

    const prevD = new Date(from); prevD.setDate(prevD.getDate() - days);
    const nextD = new Date(from); nextD.setDate(nextD.getDate() + days);

    res.render('accommodation/occupancy', {
      rooms, dates, byRoom, vacancy, usageTypes, roomStatus, from, days, today,
      prevFrom: prevD.toISOString().split('T')[0],
      nextFrom: nextD.toISOString().split('T')[0],
    });
  } finally {
    db.close();
  }
});

// 部屋割当 登録フォーム（/:id より先に定義）
function renderAssign(db: ReturnType<typeof getDb>, res: Response, studentId: string, error: string | null) {
  const students = db.prepare(`
    SELECT id, name, student_no, enrollment_date, expected_graduation
    FROM students WHERE status = '在校' ORDER BY name
  `).all();
  const rooms = db.prepare(`
    SELECT r.id, r.room_name, r.capacity, r.over_capacity, a.name AS accommodation_name
    FROM rooms r JOIN accommodations a ON a.id = r.accommodation_id
    WHERE r.status = '使用可' ORDER BY a.id, r.room_name
  `).all();
  const usageTypes = db.prepare('SELECT usage_code, display_name FROM m_room_usage_type ORDER BY sort_order').all();
  const heldAssignments = studentId
    ? db.prepare(SQL_STUDENT_ACTIVE_ASSIGNMENTS).all(studentId, studentId)
    : [];
  res.render('accommodation/assign', { students, rooms, usageTypes, studentId, heldAssignments, error });
}

router.get('/assign', (req: Request, res: Response) => {
  const db = getDb();
  try {
    renderAssign(db, res, (req.query.student_id as string) || '', null);
  } finally {
    db.close();
  }
});

// 部屋割当 登録（INSERT中心。空きは roomVacancyOn で導出して満室を弾く）
router.post('/assign', (req: Request, res: Response) => {
  const { student_id, room_id, usage_code, valid_from, valid_to } = req.body;
  const db = getDb();
  try {
    if (!student_id || !room_id || !usage_code || !valid_from || !valid_to) {
      return renderAssign(db, res, student_id || '', '生徒・部屋・利用形態・期間は必須です');
    }
    if (valid_to < valid_from) {
      return renderAssign(db, res, student_id, '終了日は開始日以降にしてください');
    }

    const usage = db.prepare('SELECT consume_count, is_exclusive, allow_over FROM m_room_usage_type WHERE usage_code = ?')
      .get(usage_code) as { consume_count: number; is_exclusive: number; allow_over: number } | undefined;
    if (!usage) return renderAssign(db, res, student_id, '利用形態が不正です');

    // 期間内の各日で空きを導出チェック（状態を持たず導出）
    const start = new Date(valid_from), end = new Date(valid_to);
    const countOn = db.prepare(SQL_ROOM_ACTIVE_COUNT_ON);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const ds = d.toISOString().split('T')[0];
      if (usage.is_exclusive) {
        // シングル＝部屋占有。その日に既存の有効割当が1つでもあれば登録不可（同居を防ぐ）
        const cnt = (countOn.get(Number(room_id), ds, ds) as { c: number }).c;
        if (cnt > 0) {
          return renderAssign(db, res, student_id,
            `${ds} はこの部屋に既に割当があります。シングル（占有）で登録するには空室である必要があります`);
        }
      } else {
        const vac = roomVacancyOn(db, Number(room_id), ds);
        if (vac < usage.consume_count) {
          return renderAssign(db, res, student_id,
            `${ds} はこの部屋に空きがありません（必要 ${usage.consume_count} / 空き ${vac}）。超過利用や別の部屋・期間をご検討ください`);
        }
      }
    }

    db.prepare(SQL_ROOM_ASSIGNMENT_INSERT).run(student_id, room_id, usage_code, valid_from, valid_to);
    res.redirect(`/accommodation/occupancy?from=${valid_from}`);
  } finally {
    db.close();
  }
});

// 部屋割当 取消（赤伝・UPDATE/DELETEしない）
router.post('/assign/:id/cancel', (req: Request, res: Response) => {
  const db = getDb();
  try {
    const a = db.prepare('SELECT * FROM t_room_assignment WHERE id = ?').get(req.params.id) as
      { id: number; student_id: number; room_id: number; usage_code: string; valid_from: string; valid_to: string } | undefined;
    if (a) {
      db.prepare(SQL_ROOM_ASSIGNMENT_CANCEL).run(a.student_id, a.room_id, a.usage_code, a.valid_from, a.valid_to, a.id);
    }
    res.redirect(`/accommodation/assign?student_id=${a ? a.student_id : ''}`);
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
