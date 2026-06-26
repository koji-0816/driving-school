import express from 'express';
import path from 'path';
import session from 'express-session';
import { initDb } from './db/schema';
import { seedDb, seedCurriculum, seedFeeAndQuiz, seedSlots, seedMasters, seedCourses, seedSampleStudent, seedRoomAssignments } from './db/seed';
import dashboardRouter from './routes/dashboard';
import studentsRouter from './routes/students';
import instructorsRouter from './routes/instructors';
import scheduleRouter from './routes/schedule';
import examsRouter from './routes/exams';
import accommodationRouter from './routes/accommodation';
import reservationsRouter from './routes/reservations';
import helpRouter from './routes/help';
import facilitiesRouter from './routes/facilities';
import selectRouter from './routes/select';
import waitlistRouter from './routes/waitlist';
import notificationsRouter, { generateDeadlineNotifications, getUnreadCount } from './routes/notifications';
import feedbackRouter from './routes/feedback';
import quizRouter from './routes/quiz';
import parentsRouter from './routes/parents';
import graduationRouter from './routes/graduation';
import appRouter from './routes/app';
import studentBookingRouter from './routes/studentBooking';
import bookingRoutesRouter from './routes/bookingRoutes';
import coursesRouter from './routes/courses';
import licenseTypesRouter from './routes/licenseTypes';

const app = express();
const PORT = Number(process.env.PORT) || 3002;

const ROOT = path.join(__dirname, '..');
app.set('view engine', 'ejs');
app.set('views', path.join(ROOT, 'src/views'));
app.use(express.static(path.join(ROOT, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'driving-school-proto',
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 8 * 60 * 60 * 1000 },
}));

// 全ビューにログイン中ユーザー情報と未読通知数を渡す
app.use((req, res, next) => {
  const s = req.session as any;
  res.locals.currentRole   = s.role     || 'admin';
  res.locals.currentUserId = s.userId   || 0;
  res.locals.currentUserName = s.userName || '管理者';
  res.locals.unreadCount = (res.locals.currentRole === 'student' && res.locals.currentUserId)
    ? getUnreadCount(res.locals.currentUserId) : 0;
  next();
});

initDb();
seedDb();
seedCurriculum();
seedFeeAndQuiz();
seedMasters();
seedCourses();
seedSampleStudent();
seedRoomAssignments();
seedSlots();
generateDeadlineNotifications();

app.use('/', dashboardRouter);
app.use('/students', studentsRouter);
app.use('/instructors', instructorsRouter);
app.use('/schedule', scheduleRouter);
app.use('/exams', examsRouter);
app.use('/accommodation', accommodationRouter);
app.use('/reservations', reservationsRouter);
app.use('/facilities', facilitiesRouter);
app.use('/help', helpRouter);
app.use('/select', selectRouter);
app.use('/waitlist', waitlistRouter);
app.use('/notifications', notificationsRouter);
app.use('/feedback', feedbackRouter);
app.use('/quiz', quizRouter);
app.use('/parents', parentsRouter);
app.use('/graduation', graduationRouter);
app.use('/app', appRouter);
app.use('/student/booking', studentBookingRouter);
app.use('/booking-routes', bookingRoutesRouter);
app.use('/courses', coursesRouter);
app.use('/license-types', licenseTypesRouter);

app.listen(PORT, () => {
  console.log(`教習所管理システム起動: http://localhost:${PORT}`);
});
