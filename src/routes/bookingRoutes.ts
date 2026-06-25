import { Router, Request, Response } from 'express';
import { getDb } from '../db/schema';
import {
  SQL_BOOKING_ROUTES_ALL, SQL_BOOKING_ROUTE_INSERT, SQL_BOOKING_ROUTE_UPDATE, logEdit,
} from '../db/queries';

const router = Router();

// 一覧
router.get('/', (_req: Request, res: Response) => {
  const db = getDb();
  try {
    const routes = db.prepare(SQL_BOOKING_ROUTES_ALL).all();
    res.render('bookingRoutes/index', { routes, error: null });
  } finally {
    db.close();
  }
});

// 新規追加
router.post('/', (req: Request, res: Response) => {
  const { route_name, sort_order } = req.body;
  const db = getDb();
  try {
    if (!route_name) {
      const routes = db.prepare(SQL_BOOKING_ROUTES_ALL).all();
      return res.render('bookingRoutes/index', { routes, error: '経路名は必須です' });
    }
    db.prepare(SQL_BOOKING_ROUTE_INSERT).run(route_name, Number(sort_order) || 0);
  } finally {
    db.close();
  }
  res.redirect('/booking-routes');
});

// 編集（名称変更・有効無効切替。差分を edit_logs に記録した上でUPDATE）
router.post('/:id/edit', (req: Request, res: Response) => {
  const { route_name, is_active } = req.body;
  const db = getDb();
  try {
    const before = db.prepare('SELECT * FROM m_booking_route WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
    if (!before) { res.status(404).render('error', { message: '経路が見つかりません' }); return; }

    const after = { route_name: route_name || before.route_name, is_active: is_active ? 1 : 0 };
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const key of Object.keys(after) as (keyof typeof after)[]) {
      if (String(before[key] ?? '') !== String(after[key] ?? '')) {
        changes[key] = { from: before[key], to: after[key] };
      }
    }
    if (Object.keys(changes).length > 0) logEdit('m_booking_route', String(req.params.id), changes);

    db.prepare(SQL_BOOKING_ROUTE_UPDATE).run(after.route_name, after.is_active, String(req.params.id));
  } finally {
    db.close();
  }
  res.redirect('/booking-routes');
});

export default router;
