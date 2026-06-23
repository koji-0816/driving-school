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
     lesson_start_date,provisional_license_date,stage2_complete_date,status,room_id,note,updated_at)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now','localtime'))
`;

export const SQL_STUDENT_UPDATE = `
  UPDATE students SET
    name=?,kana=?,phone=?,email=?,license_type=?,student_type=?,enrollment_date=?,
    expected_graduation=?,lesson_start_date=?,provisional_license_date=?,stage2_complete_date=?,
    status=?,room_id=?,note=?,
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
export function buildCurriculumProgress(
  db: ReturnType<typeof getDb>,
  studentId: string | number,
  licenseType: string
): LessonProgress[] {
  const lessonMasters = db.prepare(
    'SELECT * FROM lesson_master WHERE license_type = ? ORDER BY stage, sort_order'
  ).all(licenseType) as LessonMaster[];

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
