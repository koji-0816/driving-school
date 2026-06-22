import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(__dirname, '../../../driving_school.db');

export function getDb(): Database.Database {
  return new Database(DB_PATH);
}

export function initDb(): void {
  const db = new Database(DB_PATH);
  try {
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
        room_id INTEGER,
        note TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
        FOREIGN KEY (room_id) REFERENCES rooms(id)
      );

      CREATE TABLE IF NOT EXISTS instructors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        kana TEXT NOT NULL,
        qualifications TEXT NOT NULL DEFAULT '普通車',
        is_examiner INTEGER NOT NULL DEFAULT 0,
        examiner_qualifications TEXT DEFAULT '',
        status TEXT NOT NULL DEFAULT '在籍',
        created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
      );

      -- 車両・教室・シミュレーター等を統合管理
      CREATE TABLE IF NOT EXISTS facilities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT '車両',
        license_type TEXT,
        capacity INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT '使用可',
        note TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
      );

      CREATE TABLE IF NOT EXISTS accommodations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        note TEXT,
        status TEXT NOT NULL DEFAULT '使用可',
        created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
      );

      CREATE TABLE IF NOT EXISTS rooms (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        accommodation_id INTEGER NOT NULL,
        room_name TEXT NOT NULL,
        capacity INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT '使用可',
        note TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
        FOREIGN KEY (accommodation_id) REFERENCES accommodations(id)
      );

      -- 生徒の業務イベント履歴（ステータス変更・部屋異動など）
      CREATE TABLE IF NOT EXISTS student_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        event_type TEXT NOT NULL,
        description TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
        FOREIGN KEY (student_id) REFERENCES students(id)
      );

      -- マスターデータの編集ログ
      -- UPDATE使用の妥協点として、変更前後の値を記録する補完設計
      CREATE TABLE IF NOT EXISTS edit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        table_name TEXT NOT NULL,
        record_id INTEGER NOT NULL,
        changes TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
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
  } finally {
    db.close();
  }
}
