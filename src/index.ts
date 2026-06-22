import express from 'express';
import path from 'path';
import { initDb } from './db/schema';
import { seedDb } from './db/seed';
import dashboardRouter from './routes/dashboard';
import studentsRouter from './routes/students';
import instructorsRouter from './routes/instructors';
import scheduleRouter from './routes/schedule';
import examsRouter from './routes/exams';
import accommodationRouter from './routes/accommodation';
import reservationsRouter from './routes/reservations';
import helpRouter from './routes/help';

const app = express();
const PORT = Number(process.env.PORT) || 3002;

// dist/index.js からは __dirname = dist/  → views は src/views、public は public/
const ROOT = path.join(__dirname, '..');
app.set('view engine', 'ejs');
app.set('views', path.join(ROOT, 'src/views'));
app.use(express.static(path.join(ROOT, 'public')));
app.use(express.urlencoded({ extended: true }));

initDb();
seedDb();

app.use('/', dashboardRouter);
app.use('/students', studentsRouter);
app.use('/instructors', instructorsRouter);
app.use('/schedule', scheduleRouter);
app.use('/exams', examsRouter);
app.use('/accommodation', accommodationRouter);
app.use('/reservations', reservationsRouter);
app.use('/help', helpRouter);

app.listen(PORT, () => {
  console.log(`教習所管理システム起動: http://localhost:${PORT}`);
});
