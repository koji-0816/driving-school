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
      license_type TEXT NOT NULL DEFAULT '普通車',
      student_type TEXT NOT NULL DEFAULT '合宿',
      enrollment_date TEXT NOT NULL,
      expected_graduation TEXT,
      lesson_start_date TEXT,
      provisional_license_date TEXT,
      stage2_complete_date TEXT,
      status TEXT NOT NULL DEFAULT '在校',
      accommodation_id INTEGER,
      room_number TEXT,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS instructors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      kana TEXT NOT NULL,
      qualifications TEXT NOT NULL DEFAULT '普通車',
      is_examiner INTEGER NOT NULL DEFAULT 0,
      examiner_qualifications TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT '在籍',
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    -- 車両・教室・シミュレーター等を統合管理
    CREATE TABLE IF NOT EXISTS facilities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT '車両',  -- 車両/教室/シミュレーター/その他
      license_type TEXT,                       -- 車両の場合: 普通車/二輪/大型
      capacity INTEGER NOT NULL DEFAULT 1,     -- 同時利用可能人数
      status TEXT NOT NULL DEFAULT '使用可',   -- 使用可/点検中/使用不可/廃止
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS accommodations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      total_rooms INTEGER NOT NULL,
      note TEXT,
      status TEXT NOT NULL DEFAULT '使用可'
    );

    CREATE TABLE IF NOT EXISTS lessons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      instructor_id INTEGER NOT NULL,
      facility_id INTEGER,
      lesson_date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      lesson_type TEXT NOT NULL,
      stage TEXT NOT NULL DEFAULT '第一段階',
      status TEXT NOT NULL DEFAULT '予定',
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (student_id) REFERENCES students(id),
      FOREIGN KEY (instructor_id) REFERENCES instructors(id),
      FOREIGN KEY (facility_id) REFERENCES facilities(id)
    );

    CREATE TABLE IF NOT EXISTS slots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slot_date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      instructor_id INTEGER NOT NULL,
      facility_id INTEGER,
      lesson_type TEXT NOT NULL DEFAULT '技能',
      license_type TEXT NOT NULL DEFAULT '普通車',
      max_students INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT '受付中',
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (instructor_id) REFERENCES instructors(id),
      FOREIGN KEY (facility_id) REFERENCES facilities(id)
    );

    CREATE TABLE IF NOT EXISTS reservations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slot_id INTEGER NOT NULL,
      student_id INTEGER NOT NULL,
      stage TEXT NOT NULL DEFAULT '第一段階',
      status TEXT NOT NULL DEFAULT '予約済',
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (slot_id) REFERENCES slots(id),
      FOREIGN KEY (student_id) REFERENCES students(id)
    );

    CREATE TABLE IF NOT EXISTS exams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      examiner_id INTEGER NOT NULL,
      exam_date TEXT NOT NULL,
      exam_type TEXT NOT NULL,
      license_type TEXT NOT NULL,
      result TEXT DEFAULT '未実施',
      score INTEGER,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (student_id) REFERENCES students(id),
      FOREIGN KEY (examiner_id) REFERENCES instructors(id)
    );
  `);

  db.close();
}
