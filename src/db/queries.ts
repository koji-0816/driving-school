import { getDb } from './schema';

// ────────────────────────────────────────────────────────────
// Students
// ────────────────────────────────────────────────────────────
export const SQL_STUDENT_DETAIL = `
  SELECT s.*, r.room_name, r.capacity as room_capacity, a.name as accommodation_name
  FROM students s
  LEFT JOIN rooms r ON s.room_id = r.id
  LEFT JOIN accommodations a ON r.accommodation_id = a.id
  WHERE s.id = ?
`;

export const SQL_STUDENTS_LIST_BASE = `SELECT * FROM students WHERE 1=1`;

export const SQL_STUDENT_STATUS_COUNTS = `SELECT status, COUNT(*) as c FROM students GROUP BY status`;

export const SQL_STUDENT_INSERT = `
  INSERT INTO students
    (name,kana,phone,email,license_type,student_type,enrollment_date,expected_graduation,
     lesson_start_date,provisional_license_date,stage2_complete_date,status,room_id,note,
     student_no,birth_date,provisional_acquired_date,booking_route_id,target_license_id,updated_at)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now','localtime'))
`;

export const SQL_STUDENT_UPDATE = `
  UPDATE students SET
    name=?,kana=?,phone=?,email=?,license_type=?,student_type=?,enrollment_date=?,
    expected_graduation=?,lesson_start_date=?,provisional_license_date=?,stage2_complete_date=?,
    status=?,room_id=?,note=?,
    student_no=?,birth_date=?,provisional_acquired_date=?,booking_route_id=?,target_license_id=?,
    updated_at=datetime('now','localtime')
  WHERE id=?
`;

// ── 免許種別・所持免許・予約経路・教官 ───────────────────────────
export const SQL_LICENSE_TYPES_ALL = `SELECT * FROM m_license_type ORDER BY sort_order`;

export const SQL_HELD_LICENSE_BY_STUDENT = `
  SELECT h.*, m.license_code, m.license_name, m.category
  FROM t_student_held_license h
  JOIN m_license_type m ON h.license_type_id = m.id
  WHERE h.student_id = ?
  ORDER BY h.recorded_at DESC
`;
export const SQL_HELD_LICENSE_INSERT = `
  INSERT INTO t_student_held_license (student_id, license_type_id, acquired_date, expiry_date)
  VALUES (?,?,?,?)
`;

export const SQL_BOOKING_ROUTES_ALL    = `SELECT * FROM m_booking_route ORDER BY sort_order`;
export const SQL_BOOKING_ROUTES_ACTIVE = `SELECT * FROM m_booking_route WHERE is_active = 1 ORDER BY sort_order`;
export const SQL_BOOKING_ROUTE_INSERT  = `INSERT INTO m_booking_route (route_name, sort_order) VALUES (?,?)`;
export const SQL_BOOKING_ROUTE_UPDATE  = `UPDATE m_booking_route SET route_name=?, is_active=? WHERE id=?`;

export const SQL_INSTRUCTORS_ALL = `SELECT * FROM instructors ORDER BY status, name`;
export const SQL_INSTRUCTOR_INSERT = `
  INSERT INTO instructors (name,kana,qualifications,is_examiner,examiner_qualifications,status,updated_at)
  VALUES (?,?,?,?,?,?,datetime('now','localtime'))
`;
export const SQL_INSTRUCTOR_UPDATE = `
  UPDATE instructors SET
    name=?,kana=?,qualifications=?,is_examiner=?,examiner_qualifications=?,status=?,
    updated_at=datetime('now','localtime')
  WHERE id=?
`;

// ────────────────────────────────────────────────────────────
// Rooms
// ────────────────────────────────────────────────────────────
export const SQL_ROOMS_FOR_STUDENT_FORM = `
  SELECT r.*, a.name as accommodation_name,
         (r.capacity - COUNT(s.id)) as available
  FROM rooms r
  JOIN accommodations a ON r.accommodation_id = a.id
  LEFT JOIN students s ON s.room_id = r.id AND s.status = '在校'
  WHERE r.status = '使用可'
  GROUP BY r.id
  ORDER BY a.id, r.room_name
`;

export const SQL_ROOMS_BY_ACCOMMODATION = `
  SELECT r.*, COUNT(s.id) as occupied
  FROM rooms r
  LEFT JOIN students s ON s.room_id = r.id AND s.status = '在校'
  WHERE r.accommodation_id = ?
  GROUP BY r.id
  ORDER BY r.room_name
`;

export const SQL_ROOM_INSERT = `
  INSERT INTO rooms (accommodation_id,room_name,capacity,status,note,updated_at)
  VALUES (?,?,?,?,?,datetime('now','localtime'))
`;

export const SQL_ROOM_UPDATE = `
  UPDATE rooms SET room_name=?,capacity=?,status=?,note=?,updated_at=datetime('now','localtime')
  WHERE id=?
`;

// ────────────────────────────────────────────────────────────
// 教習コース閲覧・生徒のplan/免除（閲覧UI用）
// ────────────────────────────────────────────────────────────

// コース一覧（現行版のみ＝course_family内の valid_from 最新）＋明細件数
export const SQL_COURSES_LIST = `
  SELECT c.*, t.license_name AS target_license_name,
         (SELECT COUNT(*) FROM m_course_lesson cl WHERE cl.course_id = c.id) AS lesson_count
  FROM m_course c
  JOIN m_license_type t ON t.id = c.target_license_id
  WHERE c.id IN (
    SELECT id FROM m_course c2
    WHERE c2.version = (SELECT MAX(version) FROM m_course c3 WHERE c3.course_family = c2.course_family)
  )
  ORDER BY t.sort_order, c.course_family
`;

export const SQL_COURSE_ONE = `
  SELECT c.*, t.license_name AS target_license_name
  FROM m_course c JOIN m_license_type t ON t.id = c.target_license_id
  WHERE c.id = ?
`;

export const SQL_COURSE_LESSONS = `
  SELECT cl.seq, cl.is_mikiwame, cl.required_count,
         lm.code, lm.name, lm.lesson_type, lm.stage
  FROM m_course_lesson cl
  JOIN lesson_master lm ON lm.id = cl.lesson_master_id
  WHERE cl.course_id = ?
  ORDER BY cl.seq
`;

// 生徒のplan（必要教習）＋展開元コース名
export const SQL_STUDENT_PLAN = `
  SELECT p.seq, p.is_mikiwame, p.required_count, p.source_course_id, p.planned_at,
         lm.code, lm.name, lm.lesson_type, lm.stage,
         c.course_name, c.course_family
  FROM t_student_lesson_plan p
  JOIN lesson_master lm ON lm.id = p.lesson_master_id
  JOIN m_course c ON c.id = p.source_course_id
  WHERE p.student_id = ?
  ORDER BY p.seq
`;

// 生徒の免除済み科目（reason_code→表示名は m_exemption_reason で変換。無ければ '免除'）
export const SQL_STUDENT_EXEMPTIONS = `
  SELECT e.reason_code, e.exempted_at,
         lm.code, lm.name, lm.lesson_type, lm.stage,
         COALESCE(r.display_name, '免除') AS reason_name
  FROM t_student_exemption e
  JOIN lesson_master lm ON lm.id = e.lesson_master_id
  LEFT JOIN m_exemption_reason r ON r.reason_code = e.reason_code
  WHERE e.student_id = ?
  ORDER BY lm.sort_order
`;

// ────────────────────────────────────────────────────────────
// Accommodations
// ────────────────────────────────────────────────────────────
export const SQL_ACCOMMODATIONS_WITH_STATS = `
  SELECT a.*,
         COUNT(r.id) as total_rooms,
         SUM(CASE WHEN r.status = '使用可' THEN r.capacity ELSE 0 END) as total_capacity
  FROM accommodations a
  LEFT JOIN rooms r ON r.accommodation_id = a.id
  GROUP BY a.id
`;

export const SQL_ACCOMMODATION_OCCUPANCY = `
  SELECT r.accommodation_id, COUNT(s.id) as occupied
  FROM rooms r
  JOIN students s ON s.room_id = r.id AND s.status = '在校'
  GROUP BY r.accommodation_id
`;

export const SQL_RESIDENTS = `
  SELECT s.*, a.name as accommodation_name, r.room_name
  FROM students s
  JOIN rooms r ON s.room_id = r.id
  JOIN accommodations a ON r.accommodation_id = a.id
  WHERE s.status = '在校'
  ORDER BY a.id, r.room_name
`;

export const SQL_ACCOMMODATION_INSERT = `
  INSERT INTO accommodations (name,note,status,updated_at)
  VALUES (?,?,?,datetime('now','localtime'))
`;

export const SQL_ACCOMMODATION_UPDATE = `
  UPDATE accommodations SET name=?,note=?,status=?,updated_at=datetime('now','localtime')
  WHERE id=?
`;

// ────────────────────────────────────────────────────────────
// Facilities
// ────────────────────────────────────────────────────────────
export const SQL_FACILITIES_WITH_VEHICLE_STATS = `
  SELECT license_type, status, COUNT(*) as c
  FROM facilities WHERE category = '車両'
  GROUP BY license_type, status
`;

export const SQL_FACILITY_INSERT = `
  INSERT INTO facilities (name,category,license_type,capacity,status,note,updated_at)
  VALUES (?,?,?,?,?,?,datetime('now','localtime'))
`;

export const SQL_FACILITY_UPDATE = `
  UPDATE facilities SET name=?,category=?,license_type=?,capacity=?,status=?,note=?,
    updated_at=datetime('now','localtime')
  WHERE id=?
`;

// ────────────────────────────────────────────────────────────
// Instructors
// ────────────────────────────────────────────────────────────
export const SQL_INSTRUCTOR_SCHEDULE = `
  SELECT l.*, s.name as student_name, f.name as facility_name
  FROM lessons l
  JOIN students s ON l.student_id = s.id
  LEFT JOIN facilities f ON l.facility_id = f.id
  WHERE l.instructor_id = ? AND l.lesson_date >= ?
  ORDER BY l.lesson_date, l.start_time
  LIMIT 20
`;

// ────────────────────────────────────────────────────────────
// Dashboard
// ────────────────────────────────────────────────────────────
export const SQL_DASHBOARD_TODAY_LESSONS = `
  SELECT lesson_type, status, COUNT(*) as c FROM lessons
  WHERE lesson_date = ? GROUP BY lesson_type, status
`;

export const SQL_DASHBOARD_UPCOMING_EXAMS = `
  SELECT e.*, s.name as student_name, i.name as examiner_name
  FROM exams e
  JOIN students s ON e.student_id = s.id
  JOIN instructors i ON e.examiner_id = i.id
  WHERE e.exam_date >= ? AND e.result = '未実施'
  ORDER BY e.exam_date
  LIMIT 5
`;

// ────────────────────────────────────────────────────────────
// Curriculum
// ────────────────────────────────────────────────────────────

export interface LessonMaster {
  id: number; license_type: string; stage: number; lesson_type: string;
  code: string; name: string; required_count: number; note: string | null; sort_order: number;
}

export interface CurriculumRule {
  id: number; lesson_master_id: number; rule_type: string; rule_group_id: number;
  condition_type: string; condition_value: string; condition_min: number | null; note: string | null;
}

export interface LessonProgress {
  lesson: LessonMaster;
  status: 'completed' | 'available' | 'locked';
  completedCount: number;
  blockedBy: string[];
}

/** 試験テーブルの exam_type → lesson_master.code のマッピング */
const EXAM_TYPE_TO_CODE: Record<string, string> = {
  '仮免':     '検定-仮免',
  '修了検定': '検定-仮免',
  '卒業検定': '検定-卒業',
};

/**
 * 生徒のカリキュラム進捗を計算する。
 * 返り値の各要素に status: 'completed'|'available'|'locked' を付与。
 */
/**
 * 進捗計算の対象集合を決める。
 *  plan有り → t_student_lesson_plan（その生徒の課程・required_count上書き）を対象にする
 *  plan無し → 従来 lesson_master WHERE license_type=?（既存生徒のフォールバック）
 */
function getProgressLessonSet(
  db: ReturnType<typeof getDb>,
  studentId: string | number,
  licenseType: string
): LessonMaster[] {
  const plan = db.prepare(`
    SELECT lesson_master_id, required_count, seq
    FROM t_student_lesson_plan WHERE student_id = ?
  `).all(studentId) as { lesson_master_id: number; required_count: number; seq: number }[];

  if (plan.length === 0) {
    return db.prepare(
      'SELECT * FROM lesson_master WHERE license_type = ? ORDER BY stage, sort_order'
    ).all(licenseType) as LessonMaster[];
  }

  // plan優先：lesson_master を plan の id で引き、required_count を上書き、seq順に並べる
  const planMap = new Map(plan.map(p => [p.lesson_master_id, p]));
  const ids = plan.map(p => p.lesson_master_id);
  const placeholders = ids.map(() => '?').join(',');
  const lms = db.prepare(
    `SELECT * FROM lesson_master WHERE id IN (${placeholders})`
  ).all(...ids) as LessonMaster[];

  return lms
    .map(lm => ({ ...lm, required_count: planMap.get(lm.id)!.required_count ?? lm.required_count }))
    .sort((a, b) => planMap.get(a.id)!.seq - planMap.get(b.id)!.seq);
}

export function buildCurriculumProgress(
  db: ReturnType<typeof getDb>,
  studentId: string | number,
  licenseType: string
): LessonProgress[] {
  const lessonMasters = getProgressLessonSet(db, studentId, licenseType);

  if (lessonMasters.length === 0) return [];

  // 受講記録（科目ごとの完了回数）
  const records = db.prepare(`
    SELECT slr.lesson_master_id, lm.code, lm.lesson_type, lm.stage, COUNT(*) as cnt
    FROM student_lesson_records slr
    JOIN lesson_master lm ON slr.lesson_master_id = lm.id
    WHERE slr.student_id = ? AND slr.status = '完了'
    GROUP BY slr.lesson_master_id
  `).all(studentId) as { lesson_master_id: number; code: string; lesson_type: string; stage: number; cnt: number }[];

  // 科目ごとの完了回数マップ
  const completedById: Record<number, number> = {};
  const countByTypeStage: Record<string, number> = {};
  for (const r of records) {
    completedById[r.lesson_master_id] = r.cnt;
    const key = `${r.lesson_type}-${r.stage}`;
    countByTypeStage[key] = (countByTypeStage[key] || 0) + r.cnt;
  }

  // 必要回数を満たした科目コードのセット（前提チェックで参照）
  const completedCodes = new Set<string>();
  for (const lm of lessonMasters) {
    const cnt = completedById[lm.id] || 0;
    if (cnt >= lm.required_count) completedCodes.add(lm.code);
  }

  // 合格済み試験（exams テーブルから lesson_master.code にマッピング）
  const passedExams = db.prepare(
    "SELECT exam_type FROM exams WHERE student_id = ? AND result = '合格'"
  ).all(studentId) as { exam_type: string }[];
  for (const e of passedExams) {
    const code = EXAM_TYPE_TO_CODE[e.exam_type];
    if (code) completedCodes.add(code);
  }

  // 免除済み（第3の事実ソース）。受講ではないが前提充足の観点では「済」とみなす。
  // 免除科目は plan に無く一覧には出ない。前提判定でのみ合流する。
  const exemptions = db.prepare(`
    SELECT lm.code FROM t_student_exemption e
    JOIN lesson_master lm ON lm.id = e.lesson_master_id
    WHERE e.student_id = ?
  `).all(studentId) as { code: string }[];
  for (const e of exemptions) completedCodes.add(e.code);

  // この license_type の全ルールを一括取得
  const allRules = db.prepare(`
    SELECT cr.* FROM curriculum_rules cr
    JOIN lesson_master lm ON cr.lesson_master_id = lm.id
    WHERE lm.license_type = ? AND cr.is_active = 1
  `).all(licenseType) as CurriculumRule[];

  const rulesMap: Record<number, CurriculumRule[]> = {};
  for (const r of allRules) {
    if (!rulesMap[r.lesson_master_id]) rulesMap[r.lesson_master_id] = [];
    rulesMap[r.lesson_master_id].push(r);
  }

  return lessonMasters.map(lm => {
    const count = completedById[lm.id] || 0;

    if (count >= lm.required_count || completedCodes.has(lm.code)) {
      return { lesson: lm, status: 'completed', completedCount: count, blockedBy: [] };
    }

    const rules = rulesMap[lm.id] || [];
    if (rules.length === 0) {
      return { lesson: lm, status: 'available', completedCount: count, blockedBy: [] };
    }

    // 全ルールを AND で評価（rule_group_id は将来の OR 拡張用）
    const blockedBy: string[] = [];
    for (const rule of rules) {
      let ok = false;
      if (rule.condition_type === 'lesson_completed') {
        ok = completedCodes.has(rule.condition_value);
        if (!ok) blockedBy.push(rule.note || `「${rule.condition_value}」の受講が必要`);
      } else if (rule.condition_type === 'lesson_count_min') {
        const key = `${rule.condition_value}-${lm.stage}`;
        const cnt = countByTypeStage[key] || 0;
        ok = cnt >= (rule.condition_min || 0);
        if (!ok) blockedBy.push(`${rule.condition_value}教習を${rule.condition_min}時限以上完了が必要（現在${cnt}時限）`);
      } else if (rule.condition_type === 'exam_passed') {
        ok = completedCodes.has(rule.condition_value);
        if (!ok) blockedBy.push(rule.note || `「${rule.condition_value}」の合格が必要`);
      }
    }

    return {
      lesson: lm,
      status: blockedBy.length === 0 ? 'available' : 'locked',
      completedCount: count,
      blockedBy,
    };
  });
}

// ────────────────────────────────────────────────────────────
// 教習生 技能予約グリッド（/student/booking）
//   ・有効予約 = 予約INSERT − 取消イベント（reservation_cancellations）
//   ・読み取りは旧方式 status='キャンセル' も無効扱い（取りこぼし防止）
//   ・書き込み（取消）は reservation_cancellations への INSERT のみ（UPDATE回避）
// ────────────────────────────────────────────────────────────

/** 有効予約の条件（取消イベント無し かつ 旧status取消でない）*/
const ACTIVE_RESERVATION_JOIN = `
  LEFT JOIN reservation_cancellations c ON c.reservation_id = r.id
`;
const ACTIVE_RESERVATION_WHERE = `c.id IS NULL AND r.status <> 'キャンセル'`;

/** グリッド対象スロット（2週間・該当免許・受付中）＋有効予約数＋学科項目＋教室名 */
export const SQL_BOOKING_SLOTS = `
  SELECT sl.id, sl.slot_date, sl.start_time, sl.end_time, sl.lesson_type,
         sl.max_students, sl.lesson_master_id,
         lm.code as lesson_code, lm.name as lesson_name, lm.stage as lesson_stage,
         f.name as room_name,
         (SELECT COUNT(*) FROM reservations r ${ACTIVE_RESERVATION_JOIN}
          WHERE r.slot_id = sl.id AND ${ACTIVE_RESERVATION_WHERE}) as active_count
  FROM slots sl
  LEFT JOIN lesson_master lm ON sl.lesson_master_id = lm.id
  LEFT JOIN facilities f ON sl.facility_id = f.id
  WHERE sl.slot_date >= ? AND sl.slot_date < date(?, '+14 days')
    AND sl.license_type = ? AND sl.status = '受付中'
  ORDER BY sl.slot_date, sl.start_time
`;

/** 自分の有効予約（期間内）*/
export const SQL_BOOKING_MY_ACTIVE = `
  SELECT r.id as reservation_id, r.slot_id, sl.slot_date, sl.start_time,
         sl.lesson_master_id, lm.code as lesson_code, lm.name as lesson_name
  FROM reservations r
  JOIN slots sl ON r.slot_id = sl.id
  LEFT JOIN lesson_master lm ON sl.lesson_master_id = lm.id
  ${ACTIVE_RESERVATION_JOIN}
  WHERE r.student_id = ? AND ${ACTIVE_RESERVATION_WHERE}
    AND sl.slot_date >= ? AND sl.slot_date < date(?, '+14 days')
`;

/** 予約実行時：枠1件＋有効予約数（capacity判定用）*/
export const SQL_BOOKING_SLOT_ONE = `
  SELECT sl.id, sl.slot_date, sl.start_time, sl.lesson_type, sl.status,
         sl.max_students, sl.lesson_master_id,
         (SELECT COUNT(*) FROM reservations r ${ACTIVE_RESERVATION_JOIN}
          WHERE r.slot_id = sl.id AND ${ACTIVE_RESERVATION_WHERE}) as active_count
  FROM slots sl WHERE sl.id = ?
`;

/** 同時刻重複チェック（同じ生徒が同日・同開始時刻に有効予約を持つか）*/
export const SQL_BOOKING_DUP_CHECK = `
  SELECT r.id FROM reservations r
  JOIN slots sl ON r.slot_id = sl.id
  ${ACTIVE_RESERVATION_JOIN}
  WHERE r.student_id = ? AND ${ACTIVE_RESERVATION_WHERE}
    AND sl.slot_date = ? AND sl.start_time = ?
`;

/** 予約INSERT */
export const SQL_BOOKING_RESERVE_INSERT = `
  INSERT INTO reservations (slot_id, student_id, stage, status) VALUES (?, ?, ?, '予約済')
`;

/** 取消対象の予約が自分の有効予約か検証 */
export const SQL_BOOKING_RESERVATION_VALID = `
  SELECT r.id FROM reservations r
  ${ACTIVE_RESERVATION_JOIN}
  WHERE r.id = ? AND r.student_id = ? AND ${ACTIVE_RESERVATION_WHERE}
`;

/** 取消イベントINSERT（DELETE/UPDATEしない）*/
export const SQL_BOOKING_CANCEL_INSERT = `
  INSERT INTO reservation_cancellations (reservation_id, student_id) VALUES (?, ?)
`;

/**
 * 入校時にコースを判定し、t_student_lesson_plan へスナップショット展開する。
 *  - 判定は整数FKのJOINのみ（日本語・if・固定マップを使わない）
 *  - 現行版は valid_from 最新で導出（m_course はUPDATEしない）
 *  - 既にplanがあればスキップ（二重展開防止）
 *  - 判定不能なら何もしない（従来フォールバックを維持）
 * @returns 展開した明細件数（0 = 展開せず）
 */
export function expandStudentLessonPlan(
  db: ReturnType<typeof getDb>,
  studentId: number | string,
  targetLicenseId: number | null | undefined,
  heldLicenseIds: number[],
  enrollmentDate: string
): number {
  if (!targetLicenseId) return 0;

  // 既に展開済みなら何もしない
  const existing = db.prepare('SELECT 1 FROM t_student_lesson_plan WHERE student_id = ? LIMIT 1').get(studentId);
  if (existing) return 0;

  // 所持免許が無ければ NONE で評価
  const heldIds = heldLicenseIds.length > 0 ? heldLicenseIds : [];
  if (heldIds.length === 0) {
    const none = db.prepare("SELECT id FROM m_license_type WHERE license_code = 'NONE'").get() as { id: number } | undefined;
    if (none) heldIds.push(none.id);
  }
  if (heldIds.length === 0) return 0;

  // 適格コースを整数FKのJOINで導出（所持複数は priority 最大を採用）。matched held も拾う
  const placeholders = heldIds.map(() => '?').join(',');
  const elig = db.prepare(`
    SELECT course_family, held_license_id FROM m_course_eligibility
    WHERE target_license_id = ? AND held_license_id IN (${placeholders})
    ORDER BY priority DESC, valid_from DESC LIMIT 1
  `).get(targetLicenseId, ...heldIds) as { course_family: string; held_license_id: number } | undefined;
  if (!elig) return 0;

  // 現行版（valid_from <= 入校日 の最新）を導出
  const course = db.prepare(`
    SELECT id FROM m_course
    WHERE course_family = ? AND valid_from <= ?
    ORDER BY valid_from DESC, version DESC LIMIT 1
  `).get(elig.course_family, enrollmentDate) as { id: number } | undefined;
  if (!course) return 0;

  // 明細をスナップショット展開（required_count は明細優先、無ければ lesson_master 既定）
  const lessons = db.prepare(`
    SELECT cl.lesson_master_id, cl.seq, cl.is_mikiwame,
           COALESCE(cl.required_count, lm.required_count) AS required_count
    FROM m_course_lesson cl
    JOIN lesson_master lm ON lm.id = cl.lesson_master_id
    WHERE cl.course_id = ?
    ORDER BY cl.seq
  `).all(course.id) as { lesson_master_id: number; seq: number; is_mikiwame: number; required_count: number }[];

  const ins = db.prepare(`
    INSERT INTO t_student_lesson_plan
      (student_id, lesson_master_id, seq, is_mikiwame, required_count, source_course_id)
    VALUES (?,?,?,?,?,?)
  `);
  for (const l of lessons) {
    ins.run(studentId, l.lesson_master_id, l.seq, l.is_mikiwame, l.required_count, course.id);
  }

  // 免除を「標準コース（所持なし）− 選択コース」の差分として事実INSERT（受講実績とは別ソース）
  expandStudentExemption(db, studentId, targetLicenseId, elig.held_license_id, course.id,
    new Set(lessons.map(l => l.lesson_master_id)), enrollmentDate);

  return lessons.length;
}

/**
 * 免除事実の生成。標準コース（同 target × 所持なし）に在って選択コースに無い科目を
 * 「免除済」として t_student_exemption へINSERTする。
 *  - reason_code は held の license_code から機械生成（'HELD_'+code）。日本語を介さない
 *  - source_course_id は選択コース版（証跡・不変）
 *  - 所持なし（標準コース＝選択コース）や差分ゼロのときは何もしない
 *  - 既に免除行があればスキップ（二重INSERT防止）
 */
function expandStudentExemption(
  db: ReturnType<typeof getDb>,
  studentId: number | string,
  targetLicenseId: number,
  heldLicenseId: number,
  selectedCourseId: number,
  selectedLessonIds: Set<number>,
  enrollmentDate: string
): void {
  // 所持なし本人は免除なし
  const none = db.prepare("SELECT id FROM m_license_type WHERE license_code = 'NONE'").get() as { id: number } | undefined;
  if (none && heldLicenseId === none.id) return;

  // 既に免除済みなら何もしない
  const existing = db.prepare('SELECT 1 FROM t_student_exemption WHERE student_id = ? LIMIT 1').get(studentId);
  if (existing) return;

  // reason_code は held の不変コードから機械生成
  const held = db.prepare('SELECT license_code FROM m_license_type WHERE id = ?').get(heldLicenseId) as { license_code: string } | undefined;
  if (!held) return;
  const reasonCode = `HELD_${held.license_code}`;

  // 標準コース（同 target × 所持なし）の現行版を導出
  if (!none) return;
  const stdElig = db.prepare(`
    SELECT course_family FROM m_course_eligibility
    WHERE target_license_id = ? AND held_license_id = ?
    ORDER BY priority DESC, valid_from DESC LIMIT 1
  `).get(targetLicenseId, none.id) as { course_family: string } | undefined;
  if (!stdElig) return;

  const stdCourse = db.prepare(`
    SELECT id FROM m_course
    WHERE course_family = ? AND valid_from <= ?
    ORDER BY valid_from DESC, version DESC LIMIT 1
  `).get(stdElig.course_family, enrollmentDate) as { id: number } | undefined;
  if (!stdCourse) return;

  // 差分（標準に在って選択に無い科目）＝免除科目
  const stdLessons = db.prepare(
    'SELECT lesson_master_id FROM m_course_lesson WHERE course_id = ?'
  ).all(stdCourse.id) as { lesson_master_id: number }[];

  const ins = db.prepare(`
    INSERT INTO t_student_exemption (student_id, lesson_master_id, reason_code, source_course_id)
    VALUES (?,?,?,?)
  `);
  for (const s of stdLessons) {
    if (!selectedLessonIds.has(s.lesson_master_id)) {
      ins.run(studentId, s.lesson_master_id, reasonCode, selectedCourseId);
    }
  }
}

/** buildCurriculumProgress から「今受講可能な lesson_master.id 集合」を作る */
export function availableLessonIdSet(
  db: ReturnType<typeof getDb>,
  studentId: string | number,
  licenseType: string
): Set<number> {
  const progress = buildCurriculumProgress(db, studentId, licenseType);
  const set = new Set<number>();
  for (const p of progress) {
    if (p.status === 'available') set.add(p.lesson.id);
  }
  return set;
}

// ────────────────────────────────────────────────────────────
// 変更履歴ヘルパー
// ────────────────────────────────────────────────────────────

/** マスターデータ編集ログ（UPDATEの補完設計）*/
export function logEdit(tableName: string, recordId: number | string, changes: Record<string, { from: unknown; to: unknown }>): void {
  const db = getDb();
  try {
    db.prepare(`INSERT INTO edit_logs (table_name, record_id, changes) VALUES (?,?,?)`)
      .run(tableName, recordId, JSON.stringify(changes));
  } finally {
    db.close();
  }
}

/** 生徒の業務イベント記録 */
export function logStudentEvent(studentId: number | string, eventType: string, description: string): void {
  const db = getDb();
  try {
    db.prepare(`INSERT INTO student_events (student_id, event_type, description) VALUES (?,?,?)`)
      .run(studentId, eventType, description);
  } finally {
    db.close();
  }
}

/** 変更差分を検出して edit_logs + student_events に記録 */
export function recordStudentChanges(
  id: number | string,
  before: Record<string, unknown>,
  after: Record<string, unknown>
): void {
  const changed: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of Object.keys(after)) {
    if (String(before[key] ?? '') !== String(after[key] ?? '')) {
      changed[key] = { from: before[key], to: after[key] };
    }
  }
  if (Object.keys(changed).length === 0) return;

  // edit_logs に全変更を記録
  const db = getDb();
  try {
    db.prepare(`INSERT INTO edit_logs (table_name, record_id, changes) VALUES (?,?,?)`)
      .run('students', id, JSON.stringify(changed));
  } finally {
    db.close();
  }

  // 重要な業務イベントは student_events にも記録
  if (changed['status']) {
    logStudentEvent(id, 'status_change', `ステータス変更: ${changed['status'].from} → ${changed['status'].to}`);
  }
  if (changed['room_id']) {
    logStudentEvent(id, 'room_change', `部屋変更: room_id ${changed['room_id'].from ?? 'なし'} → ${changed['room_id'].to ?? 'なし'}`);
  }
}
