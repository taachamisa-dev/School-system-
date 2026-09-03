-- =========================================================
-- SCHOOL MANAGER - CORE SCHEMA
-- Multi-tenant: every table (except lookups) has a school_id
-- =========================================================

-- ---------- TENANCY / SUBSCRIPTION ----------
CREATE TABLE IF NOT EXISTS schools (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  email TEXT,
  is_private INTEGER DEFAULT 1,           -- 1 = private (pays staff via system), 0 = public/govt
  plan TEXT DEFAULT 'trial',              -- trial | active | expired
  trial_start TEXT DEFAULT (datetime('now')),
  trial_end TEXT,                         -- trial_start + TRIAL_DAYS
  subscription_paid_until TEXT,           -- date subscription is valid until
  annual_fee_usd REAL DEFAULT 50,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ---------- USERS / ROLES ----------
-- role: admin | teacher | ancillary | parent | public
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  school_id TEXT REFERENCES schools(id),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin','teacher','ancillary','parent','public')),
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Ancillary staff duties (assigned by admin)
CREATE TABLE IF NOT EXISTS staff_duties (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  duty TEXT NOT NULL,
  assigned_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now'))
);

-- Employee payroll (teachers + ancillary, for private schools)
CREATE TABLE IF NOT EXISTS employee_payments (
  id TEXT PRIMARY KEY,
  school_id TEXT REFERENCES schools(id),
  employee_id TEXT REFERENCES users(id),
  amount REAL NOT NULL,
  period TEXT,                 -- e.g. '2026-08'
  paid_on TEXT DEFAULT (datetime('now')),
  recorded_by TEXT REFERENCES users(id)
);

-- ---------- CLASSES ----------
-- grade_level fixed vocabulary; class "name" allows multiple streams e.g. "Grade 3 Red"
CREATE TABLE IF NOT EXISTS classes (
  id TEXT PRIMARY KEY,
  school_id TEXT REFERENCES schools(id),
  grade_level TEXT NOT NULL CHECK(grade_level IN
    ('ECD A','ECD B','Grade 1','Grade 2','Grade 3','Grade 4','Grade 5','Grade 6','Grade 7')),
  stream_name TEXT NOT NULL,     -- e.g. "Red", "Blue", "Silver"
  teacher_id TEXT REFERENCES users(id),
  created_by TEXT REFERENCES users(id),  -- teacher or admin
  approved_by_admin INTEGER DEFAULT 0,    -- admin removes/approves classes teachers create
  created_at TEXT DEFAULT (datetime('now'))
);

-- ---------- GUARDIANS ----------
CREATE TABLE IF NOT EXISTS guardians (
  id TEXT PRIMARY KEY,
  school_id TEXT REFERENCES schools(id),
  user_id TEXT REFERENCES users(id),   -- if they have a login (role=parent)
  name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  occupation TEXT
);

-- ---------- LEARNERS ----------
CREATE TABLE IF NOT EXISTS learners (
  id TEXT PRIMARY KEY,
  school_id TEXT REFERENCES schools(id),
  class_id TEXT REFERENCES classes(id),
  surname TEXT NOT NULL,
  first_name TEXT NOT NULL,
  gender TEXT CHECK(gender IN ('M','F')),
  date_of_birth TEXT,              -- SI notation YYYY-MM-DD
  religion TEXT,
  boarder_or_day TEXT CHECK(boarder_or_day IN ('Boarder','Day')),
  games TEXT,
  address TEXT,
  phone_number TEXT,
  guardian1_id TEXT REFERENCES guardians(id),  -- up to 2 registered guardians
  guardian2_id TEXT REFERENCES guardians(id),
  enrollment_status TEXT DEFAULT 'active' CHECK(enrollment_status IN ('applied','active','withdrawn')),
  created_at TEXT DEFAULT (datetime('now'))
);

-- ---------- REGISTER (DAILY ATTENDANCE) ----------
-- one row per learner per day. status: P present, A absent, S sick
CREATE TABLE IF NOT EXISTS attendance (
  id TEXT PRIMARY KEY,
  school_id TEXT REFERENCES schools(id),
  class_id TEXT REFERENCES classes(id),
  learner_id TEXT REFERENCES learners(id),
  attendance_date TEXT NOT NULL,      -- YYYY-MM-DD
  status TEXT NOT NULL CHECK(status IN ('P','A','S')),
  term TEXT,                          -- 'Term 1 2026' etc
  marked_by TEXT REFERENCES users(id),
  UNIQUE(learner_id, attendance_date)
);

-- ---------- SOCIAL RECORD ----------
CREATE TABLE IF NOT EXISTS social_records (
  id TEXT PRIMARY KEY,
  learner_id TEXT UNIQUE REFERENCES learners(id),
  birth_entry_number TEXT,
  birth_rank_numerator INTEGER,        -- e.g. 2
  birth_rank_denominator INTEGER,      -- e.g. 5  -> "2 of 5"
  health_status TEXT,
  hobby TEXT,
  parent_guardian_occupation TEXT,
  distance_from_home TEXT,
  family_type TEXT,                    -- e.g. nuclear, extended, single-parent
  aspiration TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
  -- name, dob, religion, phone, address, parent/guardian name are pulled live from learners/guardians
);

-- ---------- REMEDIAL WORK (6 subjects) ----------
CREATE TABLE IF NOT EXISTS remedial_records (
  id TEXT PRIMARY KEY,
  class_id TEXT REFERENCES classes(id),
  learner_id TEXT REFERENCES learners(id),
  subject TEXT NOT NULL CHECK(subject IN
    ('ChiShona','English Language','Mathematics','Physical Education and Arts','Science and Technology','Social Science')),
  record_date TEXT NOT NULL,
  topic TEXT,
  area_of_difficulty TEXT,
  methods_and_activities TEXT,
  evaluation TEXT,
  recorded_by TEXT REFERENCES users(id)
);

-- ---------- EXTENSION WORK (6 subjects) ----------
CREATE TABLE IF NOT EXISTS extension_records (
  id TEXT PRIMARY KEY,
  class_id TEXT REFERENCES classes(id),
  learner_id TEXT REFERENCES learners(id),
  subject TEXT NOT NULL CHECK(subject IN
    ('ChiShona','English Language','Mathematics','Physical Education and Arts','Science and Technology','Social Science')),
  record_date TEXT NOT NULL,
  topic TEXT,
  mastered_concept TEXT,
  objectives TEXT,
  extension_work TEXT,
  evaluation TEXT,
  recorded_by TEXT REFERENCES users(id)
);

-- ---------- CLASS / SCHOOL INVENTORY ----------
CREATE TABLE IF NOT EXISTS inventory_items (
  id TEXT PRIMARY KEY,
  school_id TEXT REFERENCES schools(id),
  class_id TEXT REFERENCES classes(id),      -- NULL = school-level inventory
  category TEXT NOT NULL CHECK(category IN ('Furniture','Textbooks','Other Tools')),
  item_name TEXT NOT NULL,
  description TEXT,
  condition TEXT CHECK(condition IN ('New','Good','Fair','Poor','Damaged')),
  quantity INTEGER DEFAULT 0,
  updated_by TEXT REFERENCES users(id),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- ---------- READING RECORD (English & ChiShona) ----------
-- Skills defined by the teacher up-front per subject/class
CREATE TABLE IF NOT EXISTS reading_skills (
  id TEXT PRIMARY KEY,
  class_id TEXT REFERENCES classes(id),
  subject TEXT NOT NULL CHECK(subject IN ('English','ChiShona')),
  skill_name TEXT NOT NULL,
  sequence_no INTEGER
);

CREATE TABLE IF NOT EXISTS reading_records (
  id TEXT PRIMARY KEY,
  class_id TEXT REFERENCES classes(id),
  learner_id TEXT REFERENCES learners(id),
  subject TEXT NOT NULL CHECK(subject IN ('English','ChiShona')),
  record_date TEXT NOT NULL,
  source_of_matter TEXT,
  skill_id TEXT REFERENCES reading_skills(id),
  mastery TEXT CHECK(mastery IN ('M','X')),   -- M mastered, X not mastered
  recorded_by TEXT REFERENCES users(id)
);

-- ---------- ANECDOTAL RECORD ----------
CREATE TABLE IF NOT EXISTS anecdotal_records (
  id TEXT PRIMARY KEY,
  class_id TEXT REFERENCES classes(id),
  learner_id TEXT REFERENCES learners(id),
  record_date TEXT NOT NULL,
  behaviour_observed TEXT,
  evaluation TEXT,
  recorded_by TEXT REFERENCES users(id)
);

-- ---------- HEALTH CHECKLIST (ECD A - Grade 2 only) ----------
CREATE TABLE IF NOT EXISTS health_immunisation (
  learner_id TEXT PRIMARY KEY REFERENCES learners(id),
  bcg INTEGER DEFAULT 0,        -- 0/1 (checked/unchecked)
  rotavirus INTEGER DEFAULT 0,
  polio INTEGER DEFAULT 0,
  dpt INTEGER DEFAULT 0,
  rubella INTEGER DEFAULT 0,
  updated_by TEXT REFERENCES users(id),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS health_daily (
  id TEXT PRIMARY KEY,
  learner_id TEXT REFERENCES learners(id),
  record_date TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('W','S','A')),  -- Well, Sick, Absent
  marked_by TEXT REFERENCES users(id),
  UNIQUE(learner_id, record_date)
);

-- ---------- PROGRESS RECORD (6 subjects, ongoing/continuous marks) ----------
CREATE TABLE IF NOT EXISTS progress_records (
  id TEXT PRIMARY KEY,
  class_id TEXT REFERENCES classes(id),
  learner_id TEXT REFERENCES learners(id),
  subject TEXT NOT NULL CHECK(subject IN
    ('ChiShona','English Language','Mathematics','Physical Education and Arts','Science and Technology','Social Science')),
  record_date TEXT NOT NULL,
  concept_tested TEXT,
  mark REAL,
  possible_mark REAL,
  recorded_by TEXT REFERENCES users(id)
  -- app flags mark/possible_mark < 50% for red-highlight client-side
);

-- ---------- END OF TERM EXAMS ----------
CREATE TABLE IF NOT EXISTS exam_terms (
  id TEXT PRIMARY KEY,
  school_id TEXT REFERENCES schools(id),
  term_name TEXT NOT NULL,     -- 'Term 1', 'Term 2', 'Term 3'
  year INTEGER NOT NULL,
  UNIQUE(school_id, term_name, year)
);

-- possible mark set ONCE per subject per term (applies to all learners in the class)
CREATE TABLE IF NOT EXISTS exam_possible_marks (
  id TEXT PRIMARY KEY,
  exam_term_id TEXT REFERENCES exam_terms(id),
  class_id TEXT REFERENCES classes(id),
  subject TEXT NOT NULL,
  possible_mark REAL NOT NULL,
  UNIQUE(exam_term_id, class_id, subject)
);

CREATE TABLE IF NOT EXISTS exam_results (
  id TEXT PRIMARY KEY,
  exam_term_id TEXT REFERENCES exam_terms(id),
  class_id TEXT REFERENCES classes(id),
  learner_id TEXT REFERENCES learners(id),
  subject TEXT NOT NULL,
  mark REAL NOT NULL,
  -- percentage, units computed in application layer and cached here for fast ranking
  percentage REAL,
  units INTEGER,
  recorded_by TEXT REFERENCES users(id),
  UNIQUE(exam_term_id, learner_id, subject)
);

-- Guardian visibility approval per learner per term (admin controls this)
CREATE TABLE IF NOT EXISTS exam_result_release (
  id TEXT PRIMARY KEY,
  exam_term_id TEXT REFERENCES exam_terms(id),
  learner_id TEXT REFERENCES learners(id),
  released_to_guardians INTEGER DEFAULT 0,
  released_by TEXT REFERENCES users(id),
  released_at TEXT
);

-- ---------- FINANCES / FEES ----------
CREATE TABLE IF NOT EXISTS fee_invoices (
  id TEXT PRIMARY KEY,
  school_id TEXT REFERENCES schools(id),
  learner_id TEXT REFERENCES learners(id),
  term TEXT NOT NULL,
  year INTEGER NOT NULL,
  amount_due REAL NOT NULL,
  amount_paid REAL DEFAULT 0,
  balance REAL,                          -- amount_due - amount_paid, kept in sync by app
  show_teacher_balance INTEGER DEFAULT 1,  -- admin toggle: can teacher see if this learner has balance
  release_results_if_balance INTEGER DEFAULT 0, -- admin toggle
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS fee_payments (
  id TEXT PRIMARY KEY,
  invoice_id TEXT REFERENCES fee_invoices(id),
  amount REAL NOT NULL,
  method TEXT,                 -- online | cash | bank transfer
  paid_by TEXT,                -- guardian name / reference
  paid_at TEXT DEFAULT (datetime('now')),
  recorded_by TEXT REFERENCES users(id)
);

-- ---------- SCHOOL / CLASS PROJECTS ----------
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  school_id TEXT REFERENCES schools(id),
  name TEXT NOT NULL,             -- e.g. Poultry, Goat Farming
  description TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS project_teachers (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id),
  teacher_id TEXT REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS project_finances (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id),
  record_date TEXT NOT NULL,
  description TEXT,
  type TEXT CHECK(type IN ('income','expense')),
  amount REAL NOT NULL,
  recorded_by TEXT REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS project_stock (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id),
  item_name TEXT NOT NULL,
  quantity REAL,
  unit TEXT,
  notes TEXT,
  updated_by TEXT REFERENCES users(id),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS project_assets (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id),
  asset_name TEXT NOT NULL,
  description TEXT,
  condition TEXT,
  quantity INTEGER DEFAULT 1,
  updated_by TEXT REFERENCES users(id),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- ---------- PUBLIC ONLINE ENROLMENT ----------
CREATE TABLE IF NOT EXISTS enrolment_applications (
  id TEXT PRIMARY KEY,
  school_id TEXT REFERENCES schools(id),
  applicant_surname TEXT NOT NULL,
  applicant_first_name TEXT NOT NULL,
  date_of_birth TEXT,
  grade_applied_for TEXT NOT NULL,
  guardian_name TEXT,
  guardian_phone TEXT,
  guardian_email TEXT,
  guardian_address TEXT,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','waitlisted')),
  application_fee_paid INTEGER DEFAULT 0,
  submitted_at TEXT DEFAULT (datetime('now')),
  reviewed_by TEXT REFERENCES users(id)
);

-- ---------- OFFLINE SYNC QUEUE ----------
-- Client apps (APK, offline mode) write local changes here and push in a batch when online.
CREATE TABLE IF NOT EXISTS sync_log (
  id TEXT PRIMARY KEY,
  school_id TEXT REFERENCES schools(id),
  device_id TEXT,
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  operation TEXT CHECK(operation IN ('insert','update','delete')),
  payload TEXT,                 -- JSON blob of the record
  created_locally_at TEXT,
  synced_at TEXT DEFAULT (datetime('now')),
  synced_by TEXT REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_learners_class ON learners(class_id);
CREATE INDEX IF NOT EXISTS idx_attendance_class_date ON attendance(class_id, attendance_date);
CREATE INDEX IF NOT EXISTS idx_exam_results_term ON exam_results(exam_term_id, class_id);
CREATE INDEX IF NOT EXISTS idx_fee_invoices_learner ON fee_invoices(learner_id);
