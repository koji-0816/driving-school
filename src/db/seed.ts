import { getDb } from './schema';

export function seedDb(): void {
  const db = getDb();

  const studentCount = (db.prepare('SELECT COUNT(*) as c FROM students').get() as { c: number }).c;
  if (studentCount > 0) {
    db.close();
    return;
  }

  // 教官
  const insertInstructor = db.prepare(`
    INSERT INTO instructors (name, kana, qualifications, is_examiner, examiner_qualifications, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  insertInstructor.run('田中 一郎', 'タナカ イチロウ', '普通車,二輪,大型', 1, '普通車,二輪,大型', '在籍');
  insertInstructor.run('佐藤 花子', 'サトウ ハナコ', '普通車', 1, '普通車', '在籍');
  insertInstructor.run('鈴木 次郎', 'スズキ ジロウ', '普通車,二輪', 0, '', '在籍');
  insertInstructor.run('高橋 三郎', 'タカハシ サブロウ', '大型', 0, '', '在籍');
  insertInstructor.run('伊藤 四郎', 'イトウ シロウ', '普通車', 0, '', '休職');

  // 車両
  const insertVehicle = db.prepare(`
    INSERT INTO vehicles (vehicle_no, license_type, status) VALUES (?, ?, ?)
  `);
  for (let i = 1; i <= 5; i++) {
    insertVehicle.run(`普通-${String(i).padStart(3, '0')}`, '普通車', '稼働中');
  }
  for (let i = 1; i <= 3; i++) {
    insertVehicle.run(`二輪-${String(i).padStart(3, '0')}`, '二輪', '稼働中');
  }
  insertVehicle.run('大型-001', '大型', '稼働中');
  insertVehicle.run('普通-006', '普通車', '点検中');

  // 教室
  const insertClassroom = db.prepare(`
    INSERT INTO classrooms (name, capacity, status) VALUES (?, ?, ?)
  `);
  insertClassroom.run('第1教室', 30, '使用可');
  insertClassroom.run('第2教室', 20, '使用可');
  insertClassroom.run('第3教室', 15, '使用不可');

  // 宿泊施設
  const insertAccommodation = db.prepare(`
    INSERT INTO accommodations (name, total_rooms, status) VALUES (?, ?, ?)
  `);
  insertAccommodation.run('第1寮', 40, '使用可');
  insertAccommodation.run('第2寮', 20, '使用可');

  // 生徒
  const insertStudent = db.prepare(`
    INSERT INTO students (name, kana, phone, email, license_type, student_type, enrollment_date, expected_graduation, lesson_start_date, provisional_license_date, stage2_complete_date, status, accommodation_id, room_number)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  //                    name               kana                  phone               email                  license  type    enroll        grad           lesson_start  prov_lic   stage2     status  accom  room
  insertStudent.run('山田 太郎', 'ヤマダ タロウ',   '090-1111-0001', 'taro@example.com',    '普通車', '合宿', '2026-06-01', '2026-07-15', '2026-06-02', null,         null,        '在校', 1,    '101');
  insertStudent.run('中村 明美', 'ナカムラ アケミ', '090-1111-0002', 'akemi@example.com',   '普通車', '合宿', '2026-06-01', '2026-07-15', '2026-06-02', null,         null,        '在校', 1,    '102');
  insertStudent.run('小林 健太', 'コバヤシ ケンタ', '090-1111-0003', 'kenta@example.com',   '二輪',   '合宿', '2026-06-05', '2026-07-10', '2026-06-06', null,         null,        '在校', 1,    '201');
  insertStudent.run('加藤 さくら','カトウ サクラ',  '090-1111-0004', 'sakura@example.com',  '普通車', '合宿', '2026-06-10', '2026-07-25', '2026-06-11', null,         null,        '在校', 2,    '101');
  insertStudent.run('吉田 大輔', 'ヨシダ ダイスケ', '090-1111-0005', 'daisuke@example.com', '大型',   '合宿', '2026-06-10', '2026-07-30', '2026-06-11', null,         null,        '在校', 2,    '102');
  insertStudent.run('渡辺 愛',   'ワタナベ アイ',   '090-1111-0006', 'ai@example.com',      '普通車', '合宿', '2026-05-01', '2026-06-15', '2026-05-02', '2026-05-20', '2026-06-10','卒業', null, null);
  insertStudent.run('松本 隆',   'マツモト タカシ', '090-1111-0007', 'takashi@example.com', '普通車', '合宿', '2026-06-15', '2026-07-31', '2026-06-16', null,         null,        '在校', 1,    '103');
  insertStudent.run('井上 美咲', 'イノウエ ミサキ', '090-1111-0008', 'misaki@example.com',  '普通車', '合宿', '2026-06-15', '2026-07-31', '2026-06-16', null,         null,        '在校', 2,    '201');
  // 通学生（宿泊なし・期限あり）
  insertStudent.run('田村 誠',   'タムラ マコト',   '090-2222-0001', 'makoto@example.com',  '普通車', '通学', '2025-10-01', null,         '2025-10-15', '2025-12-01', null,        '在校', null, null);
  insertStudent.run('西村 彩香', 'ニシムラ アヤカ', '090-2222-0002', 'ayaka@example.com',   '普通車', '通学', '2026-04-01', null,         '2026-04-10', null,         null,        '在校', null, null);
  insertStudent.run('森田 拓海', 'モリタ タクミ',   '090-2222-0003', 'takumi@example.com',  '普通車', '通学', '2026-01-10', null,         '2026-01-20', '2026-03-15', '2026-05-30','在校', null, null);

  // 教習（サンプル）
  const insertLesson = db.prepare(`
    INSERT INTO lessons (student_id, instructor_id, vehicle_id, lesson_date, start_time, end_time, lesson_type, stage, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertLesson.run(1, 3, 1, '2026-06-22', '09:00', '10:00', '技能', '第一段階', '完了');
  insertLesson.run(1, 3, 1, '2026-06-22', '10:00', '11:00', '技能', '第一段階', '完了');
  insertLesson.run(2, 2, 2, '2026-06-22', '09:00', '10:00', '技能', '第一段階', '予定');
  insertLesson.run(3, 1, 6, '2026-06-22', '13:00', '14:00', '技能', '第一段階', '予定');
  insertLesson.run(4, 3, 3, '2026-06-23', '09:00', '10:00', '技能', '第二段階', '予定');
  insertLesson.run(1, 2, null, '2026-06-23', '14:00', '15:00', '学科', '第一段階', '予定');

  // 教習スロット（事務が作る枠）
  const insertSlot = db.prepare(`
    INSERT INTO slots (slot_date, start_time, end_time, instructor_id, vehicle_id, lesson_type, license_type, max_students, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const times = [['09:00','10:00'],['10:00','11:00'],['11:00','12:00'],['13:00','14:00'],['14:00','15:00'],['15:00','16:00']];
  const dates = ['2026-06-22','2026-06-23','2026-06-24','2026-06-25','2026-06-26','2026-06-27','2026-06-28'];
  for (const date of dates) {
    for (const [s, e] of times) {
      insertSlot.run(date, s, e, 3, 1, '技能', '普通車', 1, '受付中');
      insertSlot.run(date, s, e, 1, 6, '技能', '二輪', 1, '受付中');
    }
    insertSlot.run(date, '10:00', '11:00', 2, null, '学科', '普通車', 20, '受付中');
    insertSlot.run(date, '14:00', '15:00', 2, null, '学科', '普通車', 20, '受付中');
  }

  // 予約サンプル（生徒1が2枠予約済み）
  const insertReservation = db.prepare(`
    INSERT INTO reservations (slot_id, student_id, stage, status) VALUES (?, ?, ?, ?)
  `);
  insertReservation.run(1, 1, '第一段階', '予約済');
  insertReservation.run(3, 2, '第一段階', '予約済');

  // 検定（サンプル）
  const insertExam = db.prepare(`
    INSERT INTO exams (student_id, examiner_id, exam_date, exam_type, license_type, result, score)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  insertExam.run(6, 2, '2026-06-14', '卒業検定', '普通車', '合格', 92);
  insertExam.run(1, 1, '2026-06-25', '仮免', '普通車', '未実施', null);

  db.close();
  console.log('シードデータ投入完了');
}
