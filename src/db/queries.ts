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
