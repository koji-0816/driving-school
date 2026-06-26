import { Router, Request, Response } from 'express';
import { getDb } from '../db/schema';
import {
  SQL_LICENSE_TYPES_ALL, SQL_LICENSE_TYPE_INSERT, SQL_LICENSE_TYPE_UPDATE, logEdit,
} from '../db/queries';

const router = Router();

// 一覧
router.get('/', (_req: Request, res: Response) => {
  const db = getDb();
  try {
    const licenseTypes = db.prepare(SQL_LICENSE_TYPES_ALL).all();
    res.render('licenseTypes/index', { licenseTypes, error: null });
  } finally {
    db.close();
  }
});

// 追加（license_code は不変キー。追加時のみ入力）
router.post('/', (req: Request, res: Response) => {
  const { license_code, license_name, category, sort_order } = req.body;
  const db = getDb();
  try {
    if (!license_code || !license_name) {
      const licenseTypes = db.prepare(SQL_LICENSE_TYPES_ALL).all();
      return res.render('licenseTypes/index', { licenseTypes, error: '判定コードと表示名は必須です' });
    }
    db.prepare(SQL_LICENSE_TYPE_INSERT).run(
      String(license_code).toUpperCase(), license_name, category || '四輪', Number(sort_order) || 0
    );
  } catch (e) {
    const licenseTypes = db.prepare(SQL_LICENSE_TYPES_ALL).all();
    return res.render('licenseTypes/index', { licenseTypes, error: 'その判定コードは既に存在します' });
  } finally {
    db.close();
  }
  res.redirect('/license-types');
});

// 編集（license_code は変更不可。表示名・区分・並び順のみ。差分は edit_logs に記録）
router.post('/:id/edit', (req: Request, res: Response) => {
  const { license_name, category, sort_order } = req.body;
  const db = getDb();
  try {
    const before = db.prepare('SELECT * FROM m_license_type WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
    if (!before) { res.status(404).render('error', { message: '免許種別が見つかりません' }); return; }

    const after = { license_name: license_name || before.license_name, category: category || before.category, sort_order: Number(sort_order) || 0 };
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const key of Object.keys(after) as (keyof typeof after)[]) {
      if (String(before[key] ?? '') !== String(after[key] ?? '')) {
        changes[key] = { from: before[key], to: after[key] };
      }
    }
    if (Object.keys(changes).length > 0) logEdit('m_license_type', String(req.params.id), changes);

    db.prepare(SQL_LICENSE_TYPE_UPDATE).run(after.license_name, after.category, after.sort_order, String(req.params.id));
  } finally {
    db.close();
  }
  res.redirect('/license-types');
});

export default router;
