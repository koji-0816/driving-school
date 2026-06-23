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
  const insAccom = db.prepare(`INSERT INTO accommodations (name,status) VALUES (?,?)`);
  insAccom.run('第1寮', '使用可');
  insAccom.run('第2寮', '使用可');

  // 部屋（施設ID 1=第1寮, 2=第2寮）
  const insRoom = db.prepare(`INSERT INTO rooms (accommodation_id,room_name,capacity,status) VALUES (?,?,?,?)`);
  // 第1寮
  insRoom.run(1,'101号室',2,'使用可');  // id=1
  insRoom.run(1,'102号室',2,'使用可');  // id=2
  insRoom.run(1,'103号室',1,'使用可');  // id=3
  insRoom.run(1,'201号室',3,'使用可');  // id=4
  insRoom.run(1,'202号室',2,'使用可');  // id=5
  // 第2寮
  insRoom.run(2,'101号室',2,'使用可');  // id=6
  insRoom.run(2,'102号室',2,'使用可');  // id=7
  insRoom.run(2,'201号室',2,'使用可');  // id=8

  // 生徒（合宿）
  const insStd = db.prepare(`
    INSERT INTO students (name,kana,phone,email,license_type,student_type,enrollment_date,expected_graduation,lesson_start_date,provisional_license_date,stage2_complete_date,status,room_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);
  insStd.run('山田 太郎','ヤマダ タロウ','090-1111-0001','taro@example.com','普通車','合宿','2026-06-01','2026-07-15','2026-06-02',null,null,'在校',1);
  insStd.run('中村 明美','ナカムラ アケミ','090-1111-0002','akemi@example.com','普通車','合宿','2026-06-01','2026-07-15','2026-06-02',null,null,'在校',2);
  insStd.run('小林 健太','コバヤシ ケンタ','090-1111-0003','kenta@example.com','二輪','合宿','2026-06-05','2026-07-10','2026-06-06',null,null,'在校',4);
  insStd.run('加藤 さくら','カトウ サクラ','090-1111-0004','sakura@example.com','普通車','合宿','2026-06-10','2026-07-25','2026-06-11',null,null,'在校',6);
  insStd.run('吉田 大輔','ヨシダ ダイスケ','090-1111-0005','daisuke@example.com','大型','合宿','2026-06-10','2026-07-30','2026-06-11',null,null,'在校',7);
  insStd.run('渡辺 愛','ワタナベ アイ','090-1111-0006','ai@example.com','普通車','合宿','2026-05-01','2026-06-15','2026-05-02','2026-05-20','2026-06-10','卒業',null);
  insStd.run('松本 隆','マツモト タカシ','090-1111-0007','takashi@example.com','普通車','合宿','2026-06-15','2026-07-31','2026-06-16',null,null,'在校',3);
  insStd.run('井上 美咲','イノウエ ミサキ','090-1111-0008','misaki@example.com','普通車','合宿','2026-06-15','2026-07-31','2026-06-16',null,null,'在校',8);
  // 通学生
  insStd.run('田村 誠','タムラ マコト','090-2222-0001','makoto@example.com','普通車','通学','2025-10-01',null,'2025-10-15','2025-12-01',null,'在校',null);
  insStd.run('西村 彩香','ニシムラ アヤカ','090-2222-0002','ayaka@example.com','普通車','通学','2026-04-01',null,'2026-04-10',null,null,'在校',null);
  insStd.run('森田 拓海','モリタ タクミ','090-2222-0003','takumi@example.com','普通車','通学','2026-01-10',null,'2026-01-20','2026-03-15','2026-05-30','在校',null);

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

export function seedCurriculum(): void {
  const db = getDb();
  try {
    const count = (db.prepare('SELECT COUNT(*) as c FROM lesson_master').get() as { c: number }).c;
    if (count > 0) return;

    // ── 科目マスター（普通MT）──────────────────────────────────────
    const insLM = db.prepare(`
      INSERT INTO lesson_master (license_type,stage,lesson_type,code,name,required_count,sort_order)
      VALUES (?,?,?,?,?,?,?)
    `);

    // 学科 第一段階
    insLM.run('普通車',1,'学科','学科-①','先行学科①（オリエンテーション）',1,10);
    insLM.run('普通車',1,'学科','学科-②','危険予測・緊急回避',1,20);
    insLM.run('普通車',1,'学科','学科-③','走行と停止',1,30);
    insLM.run('普通車',1,'学科','学科-④','自動車の操作',1,40);
    insLM.run('普通車',1,'学科','学科-⑤','ヘッドライトと警音器',1,50);
    insLM.run('普通車',1,'学科','学科-⑥','交差点の通行',1,60);
    insLM.run('普通車',1,'学科','学科-⑦','道路の通行（1）',1,70);
    insLM.run('普通車',1,'学科','学科-⑧','道路の通行（2）',1,80);
    insLM.run('普通車',1,'学科','学科-⑨','歩行者の保護',1,90);
    insLM.run('普通車',1,'学科','学科-⑩','安全確認と合図',1,100);

    // 技能 第一段階
    insLM.run('普通車',1,'技能','技能-1','準備運動・車の操作',1,110);
    insLM.run('普通車',1,'技能','技能-2','発進と停止',1,120);
    insLM.run('普通車',1,'技能','技能-3','直線・カーブ走行',1,130);
    insLM.run('普通車',1,'技能','技能-4','時機を選んだ発進・停止',1,140);
    insLM.run('普通車',1,'技能','技能-5','交差点の通行・歩行者等の保護',1,150);
    insLM.run('普通車',1,'技能','技能-6','坂道・カーブ・S字・クランク',1,160);
    insLM.run('普通車',1,'技能','技能-7','後退・方向変換・縦列駐車',1,170);
    insLM.run('普通車',1,'技能','技能-8','狭路の通行',1,180);
    insLM.run('普通車',1,'技能','技能-9','通行区分・交差点',1,190);
    insLM.run('普通車',1,'技能','技能-10','踏切・坂道発進',1,200);
    insLM.run('普通車',1,'技能','技能-11','駐停車・緊急回避',1,210);
    insLM.run('普通車',1,'技能','技能-12','夜間の運転（シミュレーター）',1,220);
    insLM.run('普通車',1,'技能','技能-13','悪条件下の運転（シミュレーター）',1,230);
    insLM.run('普通車',1,'技能','技能-14','危険予測ディスカッション',1,240);
    insLM.run('普通車',1,'技能','技能-15','みきわめ（第一段階）',1,250);

    // 学科 第二段階
    insLM.run('普通車',2,'学科','学科-⑪','急ブレーキの回避',1,310);
    insLM.run('普通車',2,'学科','学科-⑫','交通事故と救命措置',1,320);
    insLM.run('普通車',2,'学科','学科-⑬','環境に配慮した運転',1,330);
    insLM.run('普通車',2,'学科','学科-⑭','悪条件下の運転',1,340);
    insLM.run('普通車',2,'学科','学科-⑮','高速道路での運転（学科）',1,350);
    insLM.run('普通車',2,'学科','学科-⑯','経路の設計',1,360);
    insLM.run('普通車',2,'学科','学科-⑰','高速道路での運転（事前学科）',1,370);
    insLM.run('普通車',2,'学科','学科-⑱','危険予測演習（学科）',1,380);
    insLM.run('普通車',2,'学科','学科-⑲','応急救護処置',3,390);  // 3時限必要
    insLM.run('普通車',2,'学科','学科-⑳','自動車の保守管理',1,400);

    // 技能 第二段階
    insLM.run('普通車',2,'技能','技能-16','路上運転の準備・確認',1,410);
    insLM.run('普通車',2,'技能','技能-17','交通の流れに合わせた走行',1,420);
    insLM.run('普通車',2,'技能','技能-18','適切な速度での走行',1,430);
    insLM.run('普通車',2,'技能','技能-19','危険予測・回避',1,440);
    insLM.run('普通車',2,'技能','技能-20','自主経路設定',1,450);
    insLM.run('普通車',2,'技能','技能-21','高速道路での運転',1,460);
    insLM.run('普通車',2,'技能','技能-22','夜間の路上運転',1,470);
    insLM.run('普通車',2,'技能','技能-23','特定課題（急制動等）',1,480);
    insLM.run('普通車',2,'技能','技能-24','みきわめ（第二段階）',1,490);

    // 仮免・卒検（試験科目として管理）
    insLM.run('普通車',1,'検定','検定-仮免','修了検定（仮免試験）',1,260);
    insLM.run('普通車',2,'検定','検定-卒業','卒業検定',1,500);

    // ── 法定ルール（curriculum_rules）────────────────────────────
    // lesson_master の id を code で引く
    const getId = (code: string): number => {
      const row = db.prepare('SELECT id FROM lesson_master WHERE code = ?').get(code) as { id: number } | undefined;
      if (!row) throw new Error(`lesson_master not found: ${code}`);
      return row.id;
    };

    const insRule = db.prepare(`
      INSERT INTO curriculum_rules
        (lesson_master_id, rule_type, rule_group_id, condition_type, condition_value, condition_min, note)
      VALUES (?,?,?,?,?,?,?)
    `);

    let rg = 1; // rule_group_id は発行順に採番

    // 先行学科①以外の全科目：先行学科①を完了していること
    const allCodes = [
      '学科-②','学科-③','学科-④','学科-⑤','学科-⑥','学科-⑦','学科-⑧','学科-⑨','学科-⑩',
      '技能-1','技能-2','技能-3','技能-4','技能-5','技能-6','技能-7','技能-8',
      '技能-9','技能-10','技能-11','技能-12','技能-13','技能-14','技能-15',
    ];
    for (const code of allCodes) {
      insRule.run(getId(code),'legal',rg,'lesson_completed','学科-①',null,'先行学科①受講が全教習の前提（道路交通法施行規則）');
      rg++;
    }

    // 第二段階の全科目：仮免合格が前提
    const stage2Codes = [
      '学科-⑪','学科-⑫','学科-⑬','学科-⑭','学科-⑮','学科-⑯','学科-⑰','学科-⑱','学科-⑲','学科-⑳',
      '技能-16','技能-17','技能-18','技能-19','技能-20','技能-21','技能-22','技能-23','技能-24',
    ];
    for (const code of stage2Codes) {
      insRule.run(getId(code),'legal',rg,'exam_passed','検定-仮免',null,'仮免合格後でないと第二段階受講不可');
      rg++;
    }

    // 技能-20（自主経路設定）：学科-⑯を完了していること
    insRule.run(getId('技能-20'),'legal',rg,'lesson_completed','学科-⑯',null,'学科⑯「経路の設計」受講後でないと自主経路設定技能不可');
    rg++;

    // 技能-21（高速道路）：学科-⑰を完了していること
    insRule.run(getId('技能-21'),'legal',rg,'lesson_completed','学科-⑰',null,'学科⑰「高速道路での運転（事前学科）」受講後でないと高速技能不可');
    rg++;

    // みきわめ（第一段階）：技能-1〜14 を14時限以上完了していること（法定最低15時限-みきわめ1）
    insRule.run(getId('技能-15'),'legal',rg,'lesson_count_min','技能',14,'第一段階技能を最低14時限完了していること（1日2時限上限）');
    rg++;

    // 修了検定：みきわめ（第一段階）を完了していること
    insRule.run(getId('検定-仮免'),'legal',rg,'lesson_completed','技能-15',null,'みきわめ（第一段階）合格が仮免受験条件');
    rg++;

    // 卒業検定：みきわめ（第二段階）を完了していること
    insRule.run(getId('検定-卒業'),'legal',rg,'lesson_completed','技能-24',null,'みきわめ（第二段階）合格が卒検受験条件');
    rg++;

    console.log('カリキュラムマスター投入完了');
  } finally {
    db.close();
  }
}

export function seedFeeAndQuiz(): void {
  const db = getDb();
  try {
    const feeCount = (db.prepare('SELECT COUNT(*) as c FROM fee_master').get() as { c: number }).c;
    if (feeCount === 0) {
      const insFee = db.prepare(`INSERT INTO fee_master (license_type,item_name,lesson_type,stage,unit_price,note) VALUES (?,?,?,?,?,?)`);
      insFee.run('普通車','技能教習（第一段階）','技能',1,5500,'1時限あたり');
      insFee.run('普通車','技能教習（第二段階）','技能',2,5500,'1時限あたり');
      insFee.run('普通車','学科教習','学科',null,1700,'1時限あたり');
      insFee.run('普通車','修了検定（仮免）','検定',1,6600,'1回あたり・再試験同額');
      insFee.run('普通車','仮免許証交付手数料','検定',1,1150,'実費');
      insFee.run('普通車','卒業検定','検定',2,7700,'1回あたり・再試験同額');
      insFee.run('普通車','効果測定','検定',null,1100,'1回あたり');
      console.log('料金マスター投入完了');
    }

    const quizCount = (db.prepare('SELECT COUNT(*) as c FROM quiz_questions').get() as { c: number }).c;
    if (quizCount === 0) {
      const insQ = db.prepare(`
        INSERT INTO quiz_questions (license_type,category,question,choice_a,choice_b,choice_c,choice_d,answer,explanation,sort_order)
        VALUES (?,?,?,?,?,?,?,?,?,?)
      `);
      // 法規
      insQ.run('普通車','法規','車両は道路の左側を通行しなければならない。これは正しいか？','正しい','誤り',null,null,'a','道路交通法第17条により、車両は道路の左側部分を通行しなければならない。',10);
      insQ.run('普通車','法規','一般道路での最高速度は法定速度として何km/hか？','50km/h','60km/h','40km/h','80km/h','b','道路交通法施行令第11条により、一般道路の法定最高速度は60km/h。',20);
      insQ.run('普通車','法規','信号が黄色の場合、車両は必ず停止しなければならない。これは正しいか？','正しい','誤り',null,null,'b','黄色信号は原則停止だが、安全に停止できない場合は進行できる。',30);
      insQ.run('普通車','法規','横断歩道に歩行者がいる場合、車両は一時停止しなければならない。これは正しいか？','正しい','誤り',null,null,'a','道路交通法第38条により、横断歩道等に歩行者等がいる場合は一時停止義務がある。',40);
      insQ.run('普通車','法規','追い越しと追い抜きの違いとして正しいのはどれか？','追い越しは進路変更を伴い、追い抜きは伴わない','追い越しは速度を上げ、追い抜きは車間距離を縮める','違いはない','追い越しは禁止、追い抜きは許可されている','a','追い越しは進路を変更して前車の前方に出ること。追い抜きは進路変更なしで前車の前方に出ること。',50);
      // 標識
      insQ.run('普通車','標識','青地に白い矢印（←）の標識は何を意味するか？','一方通行','左折禁止','進行方向指定','車線変更禁止','a','青地に白矢印の標識は一方通行を示す。矢印の方向にしか通行できない。',60);
      insQ.run('普通車','標識','赤い丸に斜線の標識（禁止標識）が示すものは何か？','通行禁止','一時停止','徐行','速度制限','a','赤丸に斜線は通行禁止を示す規制標識。',70);
      insQ.run('普通車','標識','「止まれ」の標識の形は何か？','逆三角形','円形','四角形','八角形','a','「止まれ」（一時停止）標識は逆三角形で赤地に白文字。',80);
      insQ.run('普通車','標識','最高速度30km/hの標識がある道路で50km/hで走行した。違反か？','違反である','違反でない','状況による','標識が優先されない','a','規制標識は法定速度より優先される。標識で指定された速度を超えると速度違反。',90);
      insQ.run('普通車','標識','青い丸の中に白い矢印（↑）の標識の意味は？','一方通行','直進指定','直進可能','前方優先','b','青丸に上向き矢印は直進専用（直進指定）の標識。',100);
      // 安全
      insQ.run('普通車','安全','雨天時に速度を落とすべき理由として最も適切なものは？','視界が悪くなる','燃費が落ちる','制動距離が延びる','A とC の両方','d','雨天時は視界低下に加え、路面が滑りやすく制動距離も延びるため、速度を落とす必要がある。',110);
      insQ.run('普通車','安全','高速道路での車間距離の目安として正しいのはどれか？','走行速度（km/h）と同じメートル数','走行速度の半分のメートル数','一律100m以上','前車のブレーキランプが見える距離','a','高速道路では速度（km/h）と同数のメートル（例：100km/h→100m以上）が目安。',120);
      insQ.run('普通車','安全','急ブレーキが危険な理由として正しいのはどれか？','後続車との追突リスクがある','タイヤが摩耗する','燃費が悪化する','エンジンに負担がかかる','a','急ブレーキは後続車が対応できず追突事故の危険がある。また制動距離も増す。',130);
      insQ.run('普通車','安全','交差点で右折する際の確認順序として正しいのはどれか？','前方→左→右','左→前方→右','右→左→前方','前方→右→左','a','右折時は前方の対向車確認後、左右の歩行者・自転車を確認する。',140);
      insQ.run('普通車','安全','夜間走行でハイビームを使う場面として適切なのはどれか？','対向車がいない郊外','市街地','対向車接近時','信号待ち','a','対向車や先行車がいない郊外では、視認距離を延ばすためハイビームが望ましい。',150);
      // 技術
      insQ.run('普通車','技術','クラッチを踏まずにシフトチェンジすることを何というか？','ダブルクラッチ','シンクロメッシュ','ノークラッチシフト','エンジンブレーキ','c','クラッチを踏まずにギアを変えることをノークラッチシフトという。MT車では基本的に行わない。',160);
      insQ.run('普通車','技術','エンジンブレーキが最も効果的な場面はどれか？','長い下り坂','急停車時','市街地低速走行','バック走行','a','長い下り坂でフットブレーキだけを使うとフェード現象が起きる。エンジンブレーキを併用して速度を制御する。',170);
      insQ.run('普通車','技術','縦列駐車で最初に行うべき操作はどれか？','前の車の後部に自分の車の前部を合わせる','ハンドルを左いっぱいに切る','バックから始める','ハザードランプを点灯する','a','縦列駐車は前の車と並列に停車し、前部を合わせた位置からバックを開始するのが基本。',180);
      insQ.run('普通車','技術','S字カーブを通過する際の基本的なハンドル操作はどれか？','進行方向に合わせて連続的に切り返す','一方向に切ったままにする','ハンドルを速く大きく動かす','アクセルを踏みながら通過する','a','S字では進路に合わせてハンドルを滑らかに切り返す。速度はゆっくり一定に。',190);
      insQ.run('普通車','技術','坂道発進でサイドブレーキを使う目的はどれか？','後退を防ぐため','前進速度を上げるため','クラッチを保護するため','燃費を改善するため','a','坂道発進でサイドブレーキを引いておくことで、クラッチをつなぐまでの後退を防ぐ。',200);
      console.log('模擬試験問題投入完了');
    }
  } finally {
    db.close();
  }
}
