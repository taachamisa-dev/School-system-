# School Manager

A multi-tenant school management system: attendance/register, social records,
remedial & extension work, class inventory, reading records, anecdotal
records, health checklists, progress records, end-of-term exams with unit
grading & class positions, school finances (fees + payroll), school/class
projects, employee/HR management, and public online enrolment. Includes a
14-day free trial and a $50/year subscription gate, built in as the app's
own billing logic (separate from school fees).

This is a working foundation you can run today and extend. It is **not** a
finished, pixel-polished product — treat it as the engine + wiring that
would otherwise take weeks to build from scratch.

## 1. What's included

```
school-manager/
  server.js              <- Express app entry point
  db/schema.sql           <- full database schema (every module you described)
  db/connection.js         <- opens the SQLite database, applies schema on boot
  db/init.js               <- one-time seed: creates a school + admin login
  middleware/auth.js       <- JWT auth, role checks, subscription gate
  middleware/classAccess.js<- makes sure teachers only touch their own class
  utils/grading.js         <- % -> units conversion + class position ranking
  routes/*.js              <- one file per module (see table below)
  public/                  <- basic web frontend (login, register marking, etc.)
```

| Route file            | Covers |
|------------------------|--------|
| auth.js                | login, admin creates staff/parent logins |
| classes.js             | create/approve/delete classes & streams, assign teachers |
| learners.js            | learner records, role-scoped visibility |
| attendance.js          | daily register, per-day/per-learner/gender analysis |
| socialRecords.js       | social record (auto-pulls name/DOB/religion/guardian) |
| remedial.js            | remedial work, 6 subjects |
| extension.js           | extension work, 6 subjects |
| inventory.js           | furniture / textbooks / other tools |
| readingRecord.js       | teacher-defined skills + M/X marking, English & ChiShona |
| anecdotal.js           | ECD A–Grade 2 only |
| healthChecklist.js     | immunisation + daily well/sick/absent, ECD A–Grade 2 only |
| progressRecord.js      | continuous assessment, 6 subjects |
| exams.js               | possible marks, results, unit grading, class positions, guardian release |
| finances.js            | fee invoices/payments, payroll, app subscription status |
| employees.js           | staff list, duties |
| projects.js            | school/class projects: finances, stock, assets |
| enrolment.js           | public vacancy check + application, admin approval |
| sync.js                | offline queue endpoint for the future APK client |

## 2. Run it locally

You'll need Node.js 18+ installed on your machine (download from nodejs.org).

```bash
cd school-manager
npm install
cp .env.example .env        # edit JWT_SECRET to something random
npm run seed                # creates your first school + admin login
npm start
```

Open `http://localhost:3000` in a browser. Log in with the email/password
the seed script printed to your terminal.

To create more schools (each is fully separate/multi-tenant), run:
```bash
node db/init.js "Another School Name" admin2@school.test SomePassword123!
```

## 3. How the business rules are wired in

- **14-day free trial, then $50/year**: `schools.trial_end` is set on seed.
  `middleware/auth.js` (`subscriptionActive`) blocks every module route with
  HTTP 402 once both the trial and any paid period have lapsed. Record a
  payment by calling `POST /finances/subscription/renew` with a new
  `paid_until` date — wire this to a real payment gateway webhook.
- **Role permissions**: admin sees everything but cannot edit class-level
  records (register, social record, remedial, extension, reading record,
  inventory line items scoped to a class, health checklist, anecdotal) —
  enforced by `classAccessRequired` restricting those write routes to the
  teacher who owns the class. Admin retains full edit rights on classes,
  learners, employees, finances, and inventory categories, exactly as you
  described.
- **Guardians**: two guardian slots per learner (`guardian1_id`,
  `guardian2_id`). A parent's login only ever returns their own children's
  data. Exam results stay hidden from guardians until `PATCH /exams/release`
  is called by admin, and can additionally be withheld while a fee balance
  is outstanding (`fee_invoices.release_results_if_balance`).
- **Teacher balance visibility**: `fee_invoices.show_teacher_balance` is an
  admin-controlled per-invoice toggle, exactly matching "admin chooses
  whether to show teachers if their learners have paid up."
  automatically compute units and rank the class ("least units first,
  ties broken by higher total %"), per your grading table.
- **Teacher-created classes**: a class created by a teacher is stored with
  `approved_by_admin = 0`; admin approves or deletes it.
- **Public enrolment**: `GET /enrolment/vacancies/:schoolId` only shows
  grades with open seats; `POST /enrolment/apply` re-checks that before
  accepting an application.

## 4. Hosting on a free/cheap host

This is a standard Node.js + SQLite app, so it runs on almost any Node
host. Good low-cost options:

- **Render.com** (free web service tier, sleeps when idle) or **Railway.app**
  (small monthly usage-based cost) — both auto-deploy from a GitHub repo,
  detect `npm start`, and let you set environment variables in their
  dashboard.
- **Fly.io** — has a persistent-disk option, useful since SQLite needs a
  real file, not ephemeral storage.
- **A cheap VPS** (e.g. $4–6/month) if you want the SQLite file to persist
  reliably long-term — free tiers often reset the filesystem on redeploy,
  which would wipe your database.

Steps (Render, as an example):
1. Push this project to a GitHub repo.
2. Render → New → Web Service → connect the repo.
3. Build command: `npm install`. Start command: `npm start`.
4. Add environment variables from `.env.example` in the dashboard.
5. Add a persistent disk mounted at the path you set for `DB_PATH` (so the
   SQLite file survives restarts/redeploys).

For anything beyond a handful of schools, consider switching
`better-sqlite3` for a hosted Postgres database (e.g. Supabase or Neon's
free tier) — the SQL is close enough that the migration is mostly renaming
`?` placeholders and a few syntax tweaks.

## 5. Turning this into an installable APK

I can't produce a compiled `.apk` binary myself — that needs the Android
SDK/Gradle toolchain, which isn't available in this environment. What I've
set the project up for is the standard path using **Capacitor**, which
wraps your hosted web app in a native Android shell:

```bash
npm install -g @capacitor/cli
cd school-manager
npx cap init "School Manager" "com.yourcompany.schoolmanager"
npx cap add android
```

Point Capacitor's `capacitor.config.json` `webDir`/`server.url` at your
**deployed** URL (e.g. `https://your-app.onrender.com`) rather than the
local `public/` folder, so the APK always talks to your live server. Then:

```bash
npx cap open android
```

This opens Android Studio, where you build → generate a signed APK
(Build > Generate Signed Bundle/APK). If you don't want to install Android
Studio, a free CI service like **Ionic Appflow** (free tier) or GitHub
Actions with an Android build image can produce the APK for you from the
same Capacitor project.

## 6. Offline mode

`routes/sync.js` gives you a `POST /sync/push` endpoint and a `sync_log`
table to receive batched local writes once the device reconnects. The
piece still to build on the client side (inside the Capacitor app) is:
mirror the SQLite schema locally (e.g. with `capacitor-sqlite` or plain
`localStorage`/IndexedDB for smaller data), write there first, and replay
the queue through `/sync/push` when a connectivity check succeeds. I left
a `TODO` in that file showing where each table's upsert logic (already
written for attendance and exams) should be duplicated for the rest.

## 7. Honest limitations / what to do next

- **Payment gateways** (fees + your own $50/year subscription) are stubbed
  as manual/record-a-payment endpoints. Wire a real gateway (Paynow,
  Flutterwave, PayPal, Stripe) and call the existing `/finances/payments`
  and `/finances/subscription/renew` endpoints from its webhook.
  Payment integration is more than a chat message can safely produce — it needs your registered
  merchant credentials.
- **The frontend is functional, not final.** It covers login, class/learner
  management, the daily register (with the row-marking + auto-advance
  behaviour you asked for), and a generic pattern for the other class-record
  types. It's plain HTML/JS on purpose so you can host it anywhere and wrap
  it in Capacitor without a build step. A polished, branded UI is a good
  next investment once the school side has validated the workflows.
- **No automated tests yet.** Every file passed a Node.js syntax check, but
  I have not been able to run the server against a live database in this
  environment (no outbound network here). Run it locally first (Section 2)
  before relying on it with real school data.
- I haven't built billing/payment collection myself, out of caution around
  handling real payment credentials — that integration should be done
  directly between you, your gateway provider, and this codebase.
