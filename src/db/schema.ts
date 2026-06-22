import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(__dirname, '../../../driving_school.db');

export function getDb(): Database.Database {
  return new Database(DB_PATH);
}

export function initDb(): void {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      kana TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      license_type TEXT NOT NULL DEFAULT '普通車',  -- 普通車/二輪/大型
      student_type TEXT NOT NULL DEFAULT '合宿',    -- 合宿/通学
      enrollment_date TEXT NOT NULL,
      expected_graduation TEXT,                      -- 合宿のみ実質使用
      lesson_start_date TEXT,                        -- 最初の教習受講日（教習期限の起算日）
      provisional_license_date TEXT,                 -- 仮免取得日
      stage2_complete_date TEXT,                     -- 第二段階修了日（卒検期限の起算日）
      status TEXT NOT NULL DEFAULT '在校',           -- 在校/卒業/退校
      accommodation_id INTEGER,
      room_number TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS instructors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      kana TEXT NOT NULL,
      qualifications TEXT NOT NULL DEFAULT '普通車', -- カンマ区切り: 普通車,二輪,大型
      is_examiner INTEGER NOT NULL DEFAULT 0,        -- 検定員フラグ
      examiner_qualifications TEXT DEFAULT '',       -- カンマ区切り
      status TEXT NOT NULL DEFAULT '在籍',           -- 在籍/休職/退職
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS vehicles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vehicle_no TEXT NOT NULL,
      license_type TEXT NOT NULL,   -- 普通車/二輪/大型
      status TEXT NOT NULL DEFAULT '稼働中',  -- 稼働中/点検中/廃車
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS classrooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      capacity INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT '使用可'  -- 使用可/使用不可
    );

    CREATE TABLE IF NOT EXISTS accommodations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      total_rooms INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT '使用可'
    );

    CREATE TABLE IF NOT EXISTS lessons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      instructor_id INTEGER NOT NULL,
      vehicle_id INTEGER,
      lesson_date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      lesson_type TEXT NOT NULL,   -- 技能/学科
      stage TEXT NOT NULL DEFAULT '第一段階',  -- 第一段階/第二段階
      status TEXT NOT NULL DEFAULT '予定',     -- 予定/完了/欠席/キャンセル
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (student_id) REFERENCES students(id),
      FOREIGN KEY (instructor_id) REFERENCES instructors(id),
      FOREIGN KEY (vehicle_id) REFERENCES vehicles(id)
    );

    CREATE TABLE IF NOT EXISTS slots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slot_date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      instructor_id INTEGER NOT NULL,
      vehicle_id INTEGER,
      lesson_type TEXT NOT NULL DEFAULT '技能',   -- 技能/学科
      license_type TEXT NOT NULL DEFAULT '普通車',
      max_students INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT '受付中',      -- 受付中/締切/キャンセル
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (instructor_id) REFERENCES instructors(id),
      FOREIGN KEY (vehicle_id) REFERENCES vehicles(id)
    );

    CREATE TABLE IF NOT EXISTS reservations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slot_id INTEGER NOT NULL,
      student_id INTEGER NOT NULL,
      stage TEXT NOT NULL DEFAULT '第一段階',
      status TEXT NOT NULL DEFAULT '予約済',  -- 予約済/キャンセル/完了
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (slot_id) REFERENCES slots(id),
      FOREIGN KEY (student_id) REFERENCES students(id)
    );

    CREATE TABLE IF NOT EXISTS exams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      examiner_id INTEGER NOT NULL,
      exam_date TEXT NOT NULL,
      exam_type TEXT NOT NULL,    -- 仮免/卒業検定
      license_type TEXT NOT NULL,
      result TEXT,                -- 合格/不合格/未実施
      score INTEGER,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (student_id) REFERENCES students(id),
      FOREIGN KEY (examiner_id) REFERENCES instructors(id)
    );
  `);

  db.close();
}
