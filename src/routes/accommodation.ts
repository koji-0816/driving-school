import { Router, Request, Response } from 'express';
import { getDb } from '../db/schema';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  const db = getDb();

  const accommodations = db.prepare('SELECT * FROM accommodations').all() as {
    id: number; name: string; total_rooms: number; status: string;
  }[];

  const residents = db.prepare(`
    SELECT s.*, a.name as accommodation_name
    FROM students s
    JOIN accommodations a ON s.accommodation_id = a.id
    WHERE s.status = '在校'
    ORDER BY a.id, s.room_number
  `).all();

  const occupancyByAccom = db.prepare(`
    SELECT accommodation_id, COUNT(*) as c
    FROM students WHERE status = '在校' AND accommodation_id IS NOT NULL
    GROUP BY accommodation_id
  `).all() as { accommodation_id: number; c: number }[];

  db.close();

  const occupancyMap: Record<number, number> = {};
  for (const r of occupancyByAccom) occupancyMap[r.accommodation_id] = r.c;

  res.render('accommodation', { accommodations, residents, occupancyMap });
});

export default router;
