import { Router, Request, Response } from 'express';
import { getDb } from '../db/schema';
import {
  SQL_STUDENT_DETAIL,
  SQL_BOOKING_SLOTS, SQL_BOOKING_MY_ACTIVE,
  SQL_BOOKING_SLOT_ONE, SQL_BOOKING_DUP_CHECK,
  SQL_BOOKING_RESERVE_INSERT, SQL_BOOKING_RESERVATION_VALID, SQL_BOOKING_CANCEL_INSERT,
  availableLessonIdSet,
} from '../db/queries';

const router = Router();

// ログイン中の生徒IDを取得（生徒ロールのみ）
function getStudentId(req: Request): number | null {
  const s = req.session as any;
  if (s.role === 'student' && s.userId) return Number(s.userId);
  return null;
}

interface SlotRow {
  id: number; slot_date: string; start_time: string; end_time: string;
  lesson_type: string; max_students: number; lesson_master_id: number | null;
  lesson_code: string | null; lesson_name: string | null; lesson_stage: number | null;
  room_name: string | null; active_count: number;
}

// ────────────────────────────────────────────────────────────
// GET /student/booking — 技能予約グリッド画面
//   発見制御：自分に関係するセルのみ組み立てる。満・受講済・前提未達・無関係は出さない。
// ────────────────────────────────────────────────────────────
router.get('/', (req: Request, res: Response) => {
  const studentId = getStudentId(req);
  if (!studentId) { res.redirect('/select'); return; }

  const db = getDb();
  try {
    const student = db.prepare(SQL_STUDENT_DETAIL).get(studentId) as Record<string, any> | undefined;
    if (!student) { res.status(404).render('error', { message: '生徒が見つかりません' }); return; }

    const licenseType = (student.license_type as string) || '普通車';
    const today = new Date().toISOString().split('T')[0];
    const fromDate = (req.query.from as string) || today;

    const availableIds = availableLessonIdSet(db, studentId, licenseType);

    const slots = db.prepare(SQL_BOOKING_SLOTS).all(fromDate, fromDate, licenseType) as SlotRow[];
    const myActive = db.prepare(SQL_BOOKING_MY_ACTIVE).all(studentId, fromDate, fromDate) as
      { reservation_id: number; slot_id: number; slot_date: string; start_time: string;
        lesson_code: string | null; lesson_name: string | null }[];

    const mySlotMap: Record<number, { reservation_id: number; lesson_code: string | null; lesson_name: string | null }> = {};
    for (const m of myActive) mySlotMap[m.slot_id] = m;

    // grid[date][time] = { self?:..., open?:..., gakka:[...] }
    type Cell = {
      self?: { reservation_id: number; label: string };
      open?: { slot_id: number; label: string };
      gakka: { code: string; room: string }[];
    };
    const grid: Record<string, Record<string, Cell>> = {};
    const ensure = (d: string, t: string): Cell => {
      if (!grid[d]) grid[d] = {};
      if (!grid[d][t]) grid[d][t] = { gakka: [] };
      return grid[d][t];
    };

    for (const sl of slots) {
      const mine = mySlotMap[sl.id];
      if (mine && sl.lesson_type === '技能') {
        // 自分の有効な技能予約 → 黄（タップで取消）
        ensure(sl.slot_date, sl.start_time).self = {
          reservation_id: mine.reservation_id,
          label: sl.lesson_code ? `${sl.lesson_code} ${sl.lesson_name || ''}` : '技能',
        };
        continue;
      }
      // 関係する＝今受講可能なカリキュラムに紐づく枠のみ対象（発見制御＋前提条件）
      if (sl.lesson_master_id === null || !availableIds.has(sl.lesson_master_id)) continue;

      if (sl.lesson_type === '技能') {
        // 空きがある技能枠のみ。満はそもそも返さない。
        if (sl.active_count < sl.max_students) {
          const cell = ensure(sl.slot_date, sl.start_time);
          if (!cell.self && !cell.open) {
            cell.open = {
              slot_id: sl.id,
              label: sl.lesson_code ? `${sl.lesson_code} ${sl.lesson_name || ''}` : '技能',
            };
          }
        }
      } else if (sl.lesson_type === '学科') {
        // 未受講かつ前提OKの学科開講 → 情報チップ（番号＋教室、タップ不可）
        const num = sl.lesson_code ? sl.lesson_code.replace(/^学科-/, '') : '学';
        ensure(sl.slot_date, sl.start_time).gakka.push({
          code: num,
          room: sl.room_name || '',
        });
      }
    }

    // 2週間分の日付・時間帯（9:00〜18:00 1時間刻み）
    const dateList: string[] = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(fromDate);
      d.setDate(d.getDate() + i);
      dateList.push(d.toISOString().split('T')[0]);
    }
    const timeList: string[] = [];
    for (let h = 9; h <= 18; h++) timeList.push(`${String(h).padStart(2, '0')}:00`);

    res.render('studentBooking/index', {
      student, grid, dateList, timeList, fromDate, today,
      error: (req.query.error as string) || null,
    });
  } finally {
    db.close();
  }
});

// ────────────────────────────────────────────────────────────
// POST /student/booking/reserve — 技能予約INSERT
// ────────────────────────────────────────────────────────────
router.post('/reserve', (req: Request, res: Response) => {
  const studentId = getStudentId(req);
  if (!studentId) { res.redirect('/select'); return; }

  const slotId = Number(req.body.slot_id);
  const from = req.body.from as string | undefined;
  const back = `/student/booking${from ? `?from=${from}` : ''}`;

  const db = getDb();
  try {
    const student = db.prepare('SELECT license_type FROM students WHERE id=?').get(studentId) as { license_type: string } | undefined;
    if (!student) { res.redirect('/select'); return; }

    const slot = db.prepare(SQL_BOOKING_SLOT_ONE).get(slotId) as
      { slot_date: string; start_time: string; lesson_type: string; status: string;
        max_students: number; lesson_master_id: number | null; active_count: number } | undefined;

    // 技能枠・受付中・空きあり
    if (!slot || slot.status !== '受付中' || slot.lesson_type !== '技能'
        || slot.active_count >= slot.max_students) {
      res.redirect(`${back}${from ? '&' : '?'}error=この枠は予約できません`); return;
    }

    // 前提条件：今受講可能なカリキュラムか
    const availableIds = availableLessonIdSet(db, studentId, student.license_type);
    if (slot.lesson_master_id === null || !availableIds.has(slot.lesson_master_id)) {
      res.redirect(`${back}${from ? '&' : '?'}error=前提条件を満たしていません`); return;
    }

    // 同時刻重複
    const dup = db.prepare(SQL_BOOKING_DUP_CHECK).get(studentId, slot.slot_date, slot.start_time);
    if (dup) {
      res.redirect(`${back}${from ? '&' : '?'}error=同じ時間帯に予約があります`); return;
    }

    db.prepare(SQL_BOOKING_RESERVE_INSERT).run(slotId, studentId, '第一段階');
    res.redirect(back);
  } finally {
    db.close();
  }
});

// ────────────────────────────────────────────────────────────
// POST /student/booking/cancel — 取消イベントINSERT（DELETE不使用）
// ────────────────────────────────────────────────────────────
router.post('/cancel', (req: Request, res: Response) => {
  const studentId = getStudentId(req);
  if (!studentId) { res.redirect('/select'); return; }

  const reservationId = Number(req.body.reservation_id);
  const from = req.body.from as string | undefined;
  const back = `/student/booking${from ? `?from=${from}` : ''}`;

  const db = getDb();
  try {
    // 自分の有効予約であることを検証
    const valid = db.prepare(SQL_BOOKING_RESERVATION_VALID).get(reservationId, studentId);
    if (!valid) { res.redirect(back); return; }

    db.prepare(SQL_BOOKING_CANCEL_INSERT).run(reservationId, studentId);
    res.redirect(back);
  } finally {
    db.close();
  }
});

export default router;
