import { getDb } from './schema';

export function seedDb(): void {
  const db = getDb();
  const studentCount = (db.prepare('SELECT COUNT(*) as c FROM students').get() as { c: number }).c;
  if (studentCount > 0) { db.close(); return; }

  // 教官
  const insInst = db.prepare(`INSERT INTO instructors (name,kana,qualifications,is_examiner,examiner_qualifications,status) VALUES (?,?,?,?,?,?)`);
  insInst.run('田中 一郎','タナカ イチロウ','普通車,二輪,大型',1,'普通車,二輪,大型','在籍');
  insInst.run('佐藤 花子','サトウ ハナコ','普通車',1,'普通車','在籍');
  insInst.run('鈴木 次郎','スズキ ジロウ','普通車,二輪',0,'','在籍');
  insInst.run('高橋 三郎','タカハシ サブロウ','大型',0,'','在籍');
  insInst.run('伊藤 四郎','イトウ シロウ','普通車',0,'','休職');

  // 設備（車両・教室・シミュレーター統合）
  const insFac = db.prepare(`INSERT INTO facilities (name,category,license_type,capacity,status) VALUES (?,?,?,?,?)`);
  for (let i = 1; i <= 5; i++) insFac.run(`普通車-${String(i).padStart(3,'0')}`, '車両', '普通車', 1, '使用可');
  insFac.run('普通車-006', '車両', '普通車', 1, '点検中');
  for (let i = 1; i <= 3; i++) insFac.run(`二輪-${String(i).padStart(3,'0')}`, '車両', '二輪', 1, '使用可');
  insFac.run('大型-001', '車両', '大型', 1, '使用可');
  insFac.run('第1教室', '教室', null, 30, '使用可');
  insFac.run('第2教室', '教室', null, 20, '使用可');
  insFac.run('第3教室', '教室', null, 15, '使用不可');
  insFac.run('シミュレーターA', 'シミュレーター', '普通車', 1, '使用可');
  insFac.run('シミュレーターB', 'シミュレーター', '普通車', 1, '使用可');

  // 宿泊施設
  const insAccom = db.prepare(`INSERT INTO accommodations (name,total_rooms,status) VALUES (?,?,?)`);
  insAccom.run('第1寮', 40, '使用可');
  insAccom.run('第2寮', 20, '使用可');

  // 生徒（合宿）
  const insStd = db.prepare(`
    INSERT INTO students (name,kana,phone,email,license_type,student_type,enrollment_date,expected_graduation,lesson_start_date,provisional_license_date,stage2_complete_date,status,accommodation_id,room_number)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);
  insStd.run('山田 太郎','ヤマダ タロウ','090-1111-0001','taro@example.com','普通車','合宿','2026-06-01','2026-07-15','2026-06-02',null,null,'在校',1,'101');
  insStd.run('中村 明美','ナカムラ アケミ','090-1111-0002','akemi@example.com','普通車','合宿','2026-06-01','2026-07-15','2026-06-02',null,null,'在校',1,'102');
  insStd.run('小林 健太','コバヤシ ケンタ','090-1111-0003','kenta@example.com','二輪','合宿','2026-06-05','2026-07-10','2026-06-06',null,null,'在校',1,'201');
  insStd.run('加藤 さくら','カトウ サクラ','090-1111-0004','sakura@example.com','普通車','合宿','2026-06-10','2026-07-25','2026-06-11',null,null,'在校',2,'101');
  insStd.run('吉田 大輔','ヨシダ ダイスケ','090-1111-0005','daisuke@example.com','大型','合宿','2026-06-10','2026-07-30','2026-06-11',null,null,'在校',2,'102');
  insStd.run('渡辺 愛','ワタナベ アイ','090-1111-0006','ai@example.com','普通車','合宿','2026-05-01','2026-06-15','2026-05-02','2026-05-20','2026-06-10','卒業',null,null);
  insStd.run('松本 隆','マツモト タカシ','090-1111-0007','takashi@example.com','普通車','合宿','2026-06-15','2026-07-31','2026-06-16',null,null,'在校',1,'103');
  insStd.run('井上 美咲','イノウエ ミサキ','090-1111-0008','misaki@example.com','普通車','合宿','2026-06-15','2026-07-31','2026-06-16',null,null,'在校',2,'201');
  // 通学生
  insStd.run('田村 誠','タムラ マコト','090-2222-0001','makoto@example.com','普通車','通学','2025-10-01',null,'2025-10-15','2025-12-01',null,'在校',null,null);
  insStd.run('西村 彩香','ニシムラ アヤカ','090-2222-0002','ayaka@example.com','普通車','通学','2026-04-01',null,'2026-04-10',null,null,'在校',null,null);
  insStd.run('森田 拓海','モリタ タクミ','090-2222-0003','takumi@example.com','普通車','通学','2026-01-10',null,'2026-01-20','2026-03-15','2026-05-30','在校',null,null);

  // 教習（facility_id=1〜3が普通車）
  const insLesson = db.prepare(`INSERT INTO lessons (student_id,instructor_id,facility_id,lesson_date,start_time,end_time,lesson_type,stage,status) VALUES (?,?,?,?,?,?,?,?,?)`);
  insLesson.run(1,3,1,'2026-06-22','09:00','10:00','技能','第一段階','完了');
  insLesson.run(1,3,1,'2026-06-22','10:00','11:00','技能','第一段階','完了');
  insLesson.run(2,2,2,'2026-06-22','09:00','10:00','技能','第一段階','予定');
  insLesson.run(3,1,7,'2026-06-22','13:00','14:00','技能','第一段階','予定'); // 二輪-001=facility 7
  insLesson.run(4,3,3,'2026-06-23','09:00','10:00','技能','第二段階','予定');
  insLesson.run(1,2,null,'2026-06-23','14:00','15:00','学科','第一段階','予定');

  // スロット（設備IDで管理）
  const insSlot = db.prepare(`INSERT INTO slots (slot_date,start_time,end_time,instructor_id,facility_id,lesson_type,license_type,max_students,status) VALUES (?,?,?,?,?,?,?,?,?)`);
  const times = [['09:00','10:00'],['10:00','11:00'],['11:00','12:00'],['13:00','14:00'],['14:00','15:00'],['15:00','16:00']];
  const dates = ['2026-06-22','2026-06-23','2026-06-24','2026-06-25','2026-06-26','2026-06-27','2026-06-28'];
  for (const date of dates) {
    for (const [s,e] of times) {
      insSlot.run(date,s,e,3,1,'技能','普通車',1,'受付中');
      insSlot.run(date,s,e,1,7,'技能','二輪',1,'受付中');
    }
    insSlot.run(date,'10:00','11:00',2,10,'学科','普通車',20,'受付中'); // 第1教室
    insSlot.run(date,'14:00','15:00',2,10,'学科','普通車',20,'受付中');
  }

  // 予約サンプル
  const insRes = db.prepare(`INSERT INTO reservations (slot_id,student_id,stage,status) VALUES (?,?,?,?)`);
  insRes.run(1,1,'第一段階','予約済');
  insRes.run(3,2,'第一段階','予約済');

  // 検定
  const insExam = db.prepare(`INSERT INTO exams (student_id,examiner_id,exam_date,exam_type,license_type,result,score) VALUES (?,?,?,?,?,?,?)`);
  insExam.run(6,2,'2026-06-14','卒業検定','普通車','合格',92);
  insExam.run(1,1,'2026-06-25','仮免','普通車','未実施',null);

  db.close();
  console.log('シードデータ投入完了');
}
