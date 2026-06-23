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

      -- 教習科目マスター（法令で定められた科目定義）
      CREATE TABLE IF NOT EXISTS lesson_master (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        license_type TEXT NOT NULL DEFAULT '普通MT',
        stage       INTEGER NOT NULL,          -- 1=第一段階 / 2=第二段階
        lesson_type TEXT NOT NULL,             -- '技能' / '学科'
        code        TEXT NOT NULL,             -- '技能-1' / '学科-①' 等
        name        TEXT NOT NULL,
        required_count INTEGER NOT NULL DEFAULT 1,  -- 必要時限数
        note        TEXT,
        sort_order  INTEGER NOT NULL DEFAULT 0,
        UNIQUE(license_type, code)
      );

      -- 前後関係ルール（1科目に複数条件を縦持ち）
      -- 同じ rule_group_id の条件はすべてAND（全充足で受講可）
      CREATE TABLE IF NOT EXISTS curriculum_rules (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        lesson_master_id INTEGER NOT NULL,    -- この科目を受けるための条件
        rule_type    TEXT NOT NULL DEFAULT 'legal',  -- 'legal'=法定 / 'local'=教習所独自
        rule_group_id INTEGER NOT NULL,       -- 同グループの条件はAND
        condition_type  TEXT NOT NULL,
        -- 'lesson_completed'  : 特定科目を完了していること
        -- 'lesson_count_min'  : 特定科目をN時限以上完了していること
        -- 'exam_passed'       : 特定試験に合格していること
        -- 'stage_cleared'     : 前段階を修了していること
        condition_value TEXT NOT NULL,        -- lesson_master.code / 試験名 / ステージ番号
        condition_min   INTEGER,              -- lesson_count_min 用
        note         TEXT,
        is_active    INTEGER NOT NULL DEFAULT 1,
        created_at   TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
        FOREIGN KEY (lesson_master_id) REFERENCES lesson_master(id)
      );

      -- キャンセル待ち
      CREATE TABLE IF NOT EXISTS waitlist (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        slot_id    INTEGER NOT NULL,
        student_id INTEGER NOT NULL,
        status     TEXT NOT NULL DEFAULT '待機中',  -- '待機中' / '繰り上がり' / 'キャンセル'
        created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
        FOREIGN KEY (slot_id)    REFERENCES slots(id),
        FOREIGN KEY (student_id) REFERENCES students(id)
      );

      -- 画面内通知
      CREATE TABLE IF NOT EXISTS notifications (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        type       TEXT NOT NULL,    -- 'deadline_warn' / 'waitlist_promoted' / 'system'
        title      TEXT NOT NULL,
        message    TEXT NOT NULL,
        is_read    INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
        FOREIGN KEY (student_id) REFERENCES students(id)
      );

      -- 料金マスター
      CREATE TABLE IF NOT EXISTS fee_master (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        license_type TEXT NOT NULL DEFAULT '普通車',
        item_name    TEXT NOT NULL,
        lesson_type  TEXT,           -- '技能' / '学科' / '検定' / null=その他
        stage        INTEGER,        -- 1 / 2 / null=共通
        unit_price   INTEGER NOT NULL,
        note         TEXT
      );

      -- 教習後フィードバック（INSERT中心）
      CREATE TABLE IF NOT EXISTS lesson_feedback (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id  INTEGER NOT NULL,
        lesson_date TEXT NOT NULL,
        instructor_id INTEGER,
        rating      INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
        comment     TEXT,
        created_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
        FOREIGN KEY (student_id)    REFERENCES students(id),
        FOREIGN KEY (instructor_id) REFERENCES instructors(id)
      );

      -- 学科試験問題マスター
      CREATE TABLE IF NOT EXISTS quiz_questions (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        license_type TEXT NOT NULL DEFAULT '普通車',
        category     TEXT NOT NULL,  -- '標識' / '法規' / '安全' / '技術'
        question     TEXT NOT NULL,
        choice_a     TEXT NOT NULL,
        choice_b     TEXT NOT NULL,
        choice_c     TEXT,
        choice_d     TEXT,
        answer       TEXT NOT NULL,  -- 'a' / 'b' / 'c' / 'd'
        explanation  TEXT,
        sort_order   INTEGER NOT NULL DEFAULT 0
      );

      -- 生徒の模擬試験履歴（INSERT中心）
      CREATE TABLE IF NOT EXISTS student_quiz_records (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id  INTEGER NOT NULL,
        question_id INTEGER NOT NULL,
        selected    TEXT NOT NULL,
        is_correct  INTEGER NOT NULL,
        created_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
        FOREIGN KEY (student_id)  REFERENCES students(id),
        FOREIGN KEY (question_id) REFERENCES quiz_questions(id)
      );

      -- 生徒の受講履歴（INSERT中心・UPDATE禁止）
      CREATE TABLE IF NOT EXISTS student_lesson_records (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id      INTEGER NOT NULL,
        lesson_master_id INTEGER NOT NULL,
        lesson_date     TEXT NOT NULL,
        instructor_id   INTEGER,
        status          TEXT NOT NULL DEFAULT '完了',  -- '完了' / 'キャンセル'
        note            TEXT,
        created_at      TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
        FOREIGN KEY (student_id)       REFERENCES students(id),
        FOREIGN KEY (lesson_master_id) REFERENCES lesson_master(id),
        FOREIGN KEY (instructor_id)    REFERENCES instructors(id)
      );
    `);
  } finally {
    db.close();
  }
}
