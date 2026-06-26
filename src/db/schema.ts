import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(__dirname, '../../../driving_school.db');

export function getDb(): Database.Database {
  return new Database(DB_PATH);
}

// 既存テーブルに不足列だけを追加する冪等マイグレーション
// （SQLiteは PRAGMA table_info で列存在を確認し、無ければ ALTER TABLE ADD COLUMN）
function migrateAddColumns(
  db: Database.Database,
  table: string,
  columns: { name: string; type: string }[]
): void {
  const existing = new Set(
    (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(c => c.name)
  );
  for (const col of columns) {
    if (!existing.has(col.name)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${col.name} ${col.type}`);
    }
  }
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
        lesson_master_id INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
        FOREIGN KEY (instructor_id) REFERENCES instructors(id),
        FOREIGN KEY (facility_id) REFERENCES facilities(id),
        FOREIGN KEY (lesson_master_id) REFERENCES lesson_master(id),
        UNIQUE(lesson_master_id, slot_date, start_time)
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

      -- 予約の取消イベント（INSERT専用・DELETE/UPDATEしない＝赤伝）
      -- 有効予約は reservations を本テーブルでLEFT JOINし、取消イベントが無いもので導出する
      CREATE TABLE IF NOT EXISTS reservation_cancellations (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        reservation_id INTEGER NOT NULL UNIQUE,
        student_id     INTEGER NOT NULL,
        created_at     TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
        FOREIGN KEY (reservation_id) REFERENCES reservations(id),
        FOREIGN KEY (student_id)     REFERENCES students(id)
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

      -- 免許種別マスター（取得・所持の共通語彙。判定は license_code で行う）
      CREATE TABLE IF NOT EXISTS m_license_type (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        license_code TEXT NOT NULL UNIQUE,
        license_name TEXT NOT NULL,
        category     TEXT NOT NULL,
        sort_order   INTEGER NOT NULL DEFAULT 0
      );

      -- 生徒の所持免許（INSERT中心・時系列。自由文字列で持たず m_license_type 参照）
      CREATE TABLE IF NOT EXISTS t_student_held_license (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id      INTEGER NOT NULL,
        license_type_id INTEGER NOT NULL,
        acquired_date   TEXT,
        expiry_date     TEXT,
        recorded_at     TEXT NOT NULL DEFAULT (datetime('now','localtime')),
        FOREIGN KEY (student_id)      REFERENCES students(id),
        FOREIGN KEY (license_type_id) REFERENCES m_license_type(id)
      );

      -- 予約経路マスター（自校集客・サクラス・その他エージェント等）
      CREATE TABLE IF NOT EXISTS m_booking_route (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        route_name  TEXT NOT NULL,
        is_active   INTEGER NOT NULL DEFAULT 1,
        sort_order  INTEGER NOT NULL DEFAULT 0
      );

      -- 教習コースヘッダ（取得免許×所持条件。INSERT only・現行版は valid_from 最新で導出）
      CREATE TABLE IF NOT EXISTS m_course (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        course_family     TEXT NOT NULL,            -- 論理コース（版をまたいで不変）
        version           INTEGER NOT NULL DEFAULT 1,
        target_license_id INTEGER NOT NULL,
        course_name       TEXT NOT NULL,
        valid_from        TEXT NOT NULL,
        note              TEXT,
        created_at        TEXT NOT NULL DEFAULT (datetime('now','localtime')),
        UNIQUE(course_family, version),
        FOREIGN KEY (target_license_id) REFERENCES m_license_type(id)
      );

      -- コース適格（取得×所持→コース。判定は整数FKのJOINのみ。priorityで複数所持を解決）
      CREATE TABLE IF NOT EXISTS m_course_eligibility (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        course_family     TEXT NOT NULL,
        target_license_id INTEGER NOT NULL,
        held_license_id   INTEGER NOT NULL,
        priority          INTEGER NOT NULL DEFAULT 0,
        valid_from        TEXT NOT NULL,
        FOREIGN KEY (target_license_id) REFERENCES m_license_type(id),
        FOREIGN KEY (held_license_id)   REFERENCES m_license_type(id)
      );

      -- コース明細（版に紐づく必要教習。免除は「明細に入れない」で表現）
      CREATE TABLE IF NOT EXISTS m_course_lesson (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        course_id        INTEGER NOT NULL,
        lesson_master_id INTEGER NOT NULL,
        seq              INTEGER NOT NULL,
        is_mikiwame      INTEGER NOT NULL DEFAULT 0,
        required_count   INTEGER,
        UNIQUE(course_id, lesson_master_id),
        FOREIGN KEY (course_id)        REFERENCES m_course(id),
        FOREIGN KEY (lesson_master_id) REFERENCES lesson_master(id)
      );

      -- 免除理由マスタ（reason_code→表示名。判定は不変コード、表示だけ日本語に変換）
      CREATE TABLE IF NOT EXISTS m_exemption_reason (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        reason_code  TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        sort_order   INTEGER NOT NULL DEFAULT 0
      );

      -- 生徒の免除事実（受講実績とは別ソース。評価時に completedCodes へ合流）
      --   reason_code は不変コード（日本語禁止）。表示名は m_exemption_reason で変換
      CREATE TABLE IF NOT EXISTS t_student_exemption (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id       INTEGER NOT NULL,
        lesson_master_id INTEGER NOT NULL,
        reason_code      TEXT NOT NULL,
        source_course_id INTEGER NOT NULL,   -- 免除判断の根拠コース版（証跡・不変）
        exempted_at      TEXT NOT NULL DEFAULT (datetime('now','localtime')),
        FOREIGN KEY (student_id)       REFERENCES students(id),
        FOREIGN KEY (lesson_master_id) REFERENCES lesson_master(id),
        FOREIGN KEY (source_course_id) REFERENCES m_course(id)
      );

      -- 生徒の教習計画（入校時スナップショット。展開後はマスター参照を切る）
      CREATE TABLE IF NOT EXISTS t_student_lesson_plan (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id       INTEGER NOT NULL,
        lesson_master_id INTEGER NOT NULL,
        seq              INTEGER NOT NULL,
        is_mikiwame      INTEGER NOT NULL DEFAULT 0,
        required_count   INTEGER NOT NULL,
        source_course_id INTEGER NOT NULL,         -- 展開元の版（不変・as-of再現可）
        planned_at       TEXT NOT NULL DEFAULT (datetime('now','localtime')),
        FOREIGN KEY (student_id)       REFERENCES students(id),
        FOREIGN KEY (lesson_master_id) REFERENCES lesson_master(id),
        FOREIGN KEY (source_course_id) REFERENCES m_course(id)
      );
    `);

    // students への列追加（冪等マイグレーション：無い列だけ ADD COLUMN）
    migrateAddColumns(db, 'students', [
      { name: 'student_no',                type: 'TEXT' },  // 教習生番号（PK/UNIQUEにしない・期首リセットで重複可）
      { name: 'birth_date',                type: 'TEXT' },  // 生年月日
      { name: 'provisional_acquired_date', type: 'TEXT' },  // 仮免取得日
      { name: 'booking_route_id',          type: 'INTEGER' }, // 予約経路 → m_booking_route
      { name: 'target_license_id',         type: 'INTEGER' }, // 取得希望免許 → m_license_type（コース判定起点）
    ]);
    // 部屋：超過利用時の追加可能人数
    migrateAddColumns(db, 'rooms', [
      { name: 'over_capacity', type: 'INTEGER' },  // 超過利用時に定員を超えて許容できる追加人数
    ]);
    // 所持免許：誤登録の取消（赤伝・自己参照）。cancels=取消対象の旧行id。UPDATE/DELETEしない
    migrateAddColumns(db, 't_student_held_license', [
      { name: 'cancels', type: 'INTEGER' },
    ]);
  } finally {
    db.close();
  }
}
