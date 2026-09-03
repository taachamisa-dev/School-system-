const API = ''; // same-origin
let state = { token: localStorage.getItem('sm_token') || null, user: null, school: null, view: 'login' };

const $ = (sel) => document.querySelector(sel);
const app = $('#app');

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (state.token) headers['Authorization'] = 'Bearer ' + state.token;
  const res = await fetch(API + path, { ...opts, headers: { ...headers, ...(opts.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function setState(patch) { state = { ...state, ...patch }; render(); }

// ---------------- LOGIN ----------------
function loginView() {
  app.innerHTML = `
    <div class="card" style="max-width:400px;margin:60px auto;">
      <h2>School Manager - Login</h2>
      <label>Email</label><input id="email" type="email" style="width:100%">
      <label>Password</label><input id="password" type="password" style="width:100%">
      <div class="error" id="err"></div>
      <button id="loginBtn" style="width:100%;margin-top:12px;">Login</button>
      <p style="font-size:13px;margin-top:10px;">Public applicant? <a href="#" id="toEnrol">Apply for enrolment</a></p>
    </div>`;
  $('#loginBtn').onclick = async () => {
    try {
      const data = await api('/auth/login', { method: 'POST', body: JSON.stringify({
        email: $('#email').value, password: $('#password').value }) });
      localStorage.setItem('sm_token', data.token);
      setState({ token: data.token, user: data.user, school: data.school, view: 'dashboard' });
    } catch (e) { $('#err').textContent = e.message; }
  };
  $('#toEnrol').onclick = (e) => { e.preventDefault(); setState({ view: 'enrol' }); };
}

// ---------------- PUBLIC ENROLMENT ----------------
function enrolView() {
  app.innerHTML = `
    <div class="card" style="max-width:480px;margin:40px auto;">
      <h2>Online Enrolment Application</h2>
      <label>School ID</label><input id="school_id" style="width:100%" placeholder="Ask the school for this">
      <label>Grade applying for</label>
      <select id="grade" style="width:100%">
        ${['ECD A','ECD B','Grade 1','Grade 2','Grade 3','Grade 4','Grade 5','Grade 6','Grade 7'].map(g=>`<option>${g}</option>`).join('')}
      </select>
      <label>Applicant surname</label><input id="surname" style="width:100%">
      <label>Applicant first name</label><input id="first_name" style="width:100%">
      <label>Date of birth</label><input id="dob" type="date" style="width:100%">
      <label>Guardian name</label><input id="gname" style="width:100%">
      <label>Guardian phone</label><input id="gphone" style="width:100%">
      <label>Guardian email</label><input id="gemail" style="width:100%">
      <div class="error" id="err"></div>
      <button id="applyBtn" style="margin-top:12px;">Submit Application</button>
      <button class="secondary" id="backBtn">Back to login</button>
    </div>`;
  $('#backBtn').onclick = () => setState({ view: 'login' });
  $('#applyBtn').onclick = async () => {
    try {
      const data = await api('/enrolment/apply', { method: 'POST', body: JSON.stringify({
        school_id: $('#school_id').value, grade_applied_for: $('#grade').value,
        applicant_surname: $('#surname').value, applicant_first_name: $('#first_name').value,
        date_of_birth: $('#dob').value, guardian_name: $('#gname').value,
        guardian_phone: $('#gphone').value, guardian_email: $('#gemail').value
      }) });
      alert(data.message || 'Application submitted!');
      setState({ view: 'login' });
    } catch (e) { $('#err').textContent = e.message; }
  };
}

// ---------------- DASHBOARD SHELL ----------------
const TABS_BY_ROLE = {
  admin: ['classes','learners','employees','inventory','finances','projects','exams','enrolment'],
  teacher: ['classes','register','social','remedial','extension','reading','anecdotal','health','progress','exams'],
  parent: ['myfinances','myexams'],
  ancillary: ['classes']
};

let activeTab = null;

function dashboardView() {
  const tabs = TABS_BY_ROLE[state.user.role] || [];
  if (!activeTab || !tabs.includes(activeTab)) activeTab = tabs[0];

  app.innerHTML = `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div><strong>${state.user.name}</strong> (${state.user.role}) — ${state.school?.name || ''}</div>
        <button class="secondary" id="logoutBtn">Logout</button>
      </div>
    </div>
    ${trialBanner()}
    <div class="nav" id="nav">
      ${tabs.map(t => `<button data-tab="${t}" class="${t===activeTab?'active':''}">${labelFor(t)}</button>`).join('')}
    </div>
    <div id="tabContent"></div>
  `;
  $('#logoutBtn').onclick = () => { localStorage.removeItem('sm_token'); setState({ token: null, user: null, view: 'login' }); };
  document.querySelectorAll('#nav button').forEach(b => b.onclick = () => { activeTab = b.dataset.tab; render(); });
  renderTab(activeTab);
}

function trialBanner() {
  if (!state.school) return '';
  if (state.school.plan === 'trial' && state.school.trial_end) {
    return `<div class="trial-banner">Free trial active — ends ${new Date(state.school.trial_end).toLocaleDateString()}. Renew for $${state.school.annual_fee_usd || 50}/year to keep access after that.</div>`;
  }
  return '';
}

function labelFor(t) {
  return {
    classes:'Classes', learners:'Learners', employees:'Employees', inventory:'Inventory',
    finances:'Finances', projects:'Projects', exams:'Exams', enrolment:'Enrolment',
    register:'Register', social:'Social Record', remedial:'Remedial', extension:'Extension',
    reading:'Reading Record', anecdotal:'Anecdotal', health:'Health Checklist', progress:'Progress Record',
    myfinances:'My Fees', myexams:'My Child\'s Results'
  }[t] || t;
}

function renderTab(tab) {
  const c = $('#tabContent');
  if (tab === 'classes') return classesTab(c);
  if (tab === 'learners') return learnersTab(c);
  if (tab === 'register') return registerTab(c);
  if (tab === 'employees') return employeesTab(c);
  if (tab === 'finances') return financesTab(c);
  if (tab === 'myfinances') return myFinancesTab(c);
  if (tab === 'exams') return examsTab(c);
  if (tab === 'enrolment') return enrolmentAdminTab(c);
  // generic class-record modules
  const genericMap = {
    social: null, // has its own tab below (per-learner lookup)
    remedial: { api: '/remedial', subjectField: true, fields: ['topic','area_of_difficulty','methods_and_activities','evaluation'] },
    extension: { api: '/extension', subjectField: true, fields: ['topic','mastered_concept','objectives','extension_work','evaluation'] },
    progress: { api: '/progress-record', subjectField: true, fields: ['concept_tested','mark','possible_mark'] },
    anecdotal: { api: '/anecdotal', fields: ['behaviour_observed','evaluation'] },
  };
  if (genericMap[tab]) return genericClassRecordTab(c, tab, genericMap[tab]);
  if (tab === 'reading') return readingTab(c);
  if (tab === 'health') return healthTab(c);
  if (tab === 'social') return socialTab(c);
  c.innerHTML = `<div class="card">Coming soon.</div>`;
}

// ---------------- CLASSES ----------------
async function classesTab(c) {
  c.innerHTML = `<div class="card"><h3>Loading classes...</h3></div>`;
  const classes = await api('/classes');
  const grades = ['ECD A','ECD B','Grade 1','Grade 2','Grade 3','Grade 4','Grade 5','Grade 6','Grade 7'];
  c.innerHTML = `
    <div class="card">
      <h3>Classes</h3>
      <table><tr><th>Grade</th><th>Stream</th><th>Approved</th><th>Teacher ID</th></tr>
        ${classes.map(cl => `<tr><td>${cl.grade_level}</td><td>${cl.stream_name}</td><td>${cl.approved_by_admin ? 'Yes':'No'}</td><td>${cl.teacher_id||''}</td></tr>`).join('')}
      </table>
    </div>
    <div class="card">
      <h3>Add class</h3>
      <select id="grade">${grades.map(g=>`<option>${g}</option>`).join('')}</select>
      <input id="stream" placeholder="Stream name e.g. Red">
      <input id="teacher_id" placeholder="Teacher user ID (optional)">
      <div><button id="addClass">Add class</button></div>
    </div>`;
  $('#addClass').onclick = async () => {
    await api('/classes', { method: 'POST', body: JSON.stringify({
      grade_level: $('#grade').value, stream_name: $('#stream').value, teacher_id: $('#teacher_id').value || undefined }) });
    classesTab(c);
  };
}

// ---------------- LEARNERS (admin) ----------------
async function learnersTab(c) {
  c.innerHTML = `<div class="card"><h3>Loading learners...</h3></div>`;
  const [learners, classes] = await Promise.all([api('/learners'), api('/classes')]);
  const classOptions = classes.map(cl => `<option value="${cl.id}">${cl.grade_level} ${cl.stream_name}</option>`).join('');
  c.innerHTML = `
    <div class="card">
      <h3>Learners</h3>
      <table><tr><th>Surname</th><th>First name</th><th>Gender</th><th>DOB</th><th>Class</th></tr>
        ${learners.map(l => `<tr><td>${l.surname}</td><td>${l.first_name}</td><td>${l.gender||''}</td><td>${l.date_of_birth||''}</td><td>${classNameFor(l.class_id, classes)}</td></tr>`).join('')}
      </table>
    </div>
    <div class="card">
      <h3>Add learner</h3>
      <input id="surname" placeholder="Surname">
      <input id="first_name" placeholder="First name">
      <select id="gender"><option value="M">M</option><option value="F">F</option></select>
      <input id="dob" type="date">
      <input id="religion" placeholder="Religion">
      <select id="boarder"><option>Day</option><option>Boarder</option></select>
      <input id="games" placeholder="Games">
      <input id="address" placeholder="Address">
      <input id="phone" placeholder="Phone number">
      <select id="class_id">${classOptions}</select>
      <div><button id="addLearner">Add learner</button></div>
    </div>`;
  $('#addLearner').onclick = async () => {
    await api('/learners', { method: 'POST', body: JSON.stringify({
      surname: $('#surname').value, first_name: $('#first_name').value, gender: $('#gender').value,
      date_of_birth: $('#dob').value, religion: $('#religion').value, boarder_or_day: $('#boarder').value,
      games: $('#games').value, address: $('#address').value, phone_number: $('#phone').value,
      class_id: $('#class_id').value }) });
    learnersTab(c);
  };
}
function classNameFor(id, classes) { const cl = classes.find(c => c.id === id); return cl ? `${cl.grade_level} ${cl.stream_name}` : ''; }

// ---------------- REGISTER (attendance marking with auto-advance) ----------------
async function registerTab(c) {
  const classes = await api('/classes');
  const myClasses = classes.filter(cl => cl.teacher_id === state.user.id);
  c.innerHTML = `
    <div class="card">
      <h3>Register</h3>
      <select id="class_id">${myClasses.map(cl=>`<option value="${cl.id}">${cl.grade_level} ${cl.stream_name}</option>`).join('')}</select>
      <input id="date" type="date" value="${new Date().toISOString().slice(0,10)}">
      <button id="loadRegister">Load</button>
    </div>
    <div id="registerRows"></div>
    <div class="card"><button id="submitRegister">Save register</button> <button id="viewAnalysis" class="secondary">View analysis</button></div>
    <div id="analysis"></div>
  `;
  $('#loadRegister').onclick = () => loadRegisterRows();
  $('#submitRegister').onclick = () => submitRegister();
  $('#viewAnalysis').onclick = () => loadAnalysis();

  let currentMarks = {};

  async function loadRegisterRows() {
    const classId = $('#class_id').value, date = $('#date').value;
    if (!classId) return;
    const rows = await api(`/attendance/day?class_id=${classId}&date=${date}`);
    currentMarks = Object.fromEntries(rows.map(r => [r.id, r.status]));
    $('#registerRows').innerHTML = `
      <div class="card"><table><tr><th>Name</th><th>Mark</th></tr>
      ${rows.map((r,i) => `
        <tr id="row-${r.id}">
          <td>${r.surname} ${r.first_name}</td>
          <td class="status-btns">
            <button data-id="${r.id}" data-status="P" class="markBtn">P</button>
            <button data-id="${r.id}" data-status="A" class="markBtn">A</button>
            <button data-id="${r.id}" data-status="S" class="markBtn">S</button>
            <span id="label-${r.id}" class="status-${r.status||''}">${r.status||''}</span>
          </td>
        </tr>`).join('')}
      </table></div>`;
    document.querySelectorAll('.markBtn').forEach((btn, idx, all) => {
      btn.onclick = () => {
        const id = btn.dataset.id, status = btn.dataset.status;
        currentMarks[id] = status;
        $(`#label-${id}`).textContent = status;
        $(`#label-${id}`).className = 'status-' + status;
        // auto-advance: scroll to next row
        const rowsArr = [...document.querySelectorAll('tr[id^="row-"]')];
        const rowIdx = rowsArr.findIndex(r => r.id === `row-${id}`);
        const next = rowsArr[rowIdx + 1];
        if (next) next.scrollIntoView({ behavior: 'smooth', block: 'center' });
      };
    });
  }

  async function submitRegister() {
    const classId = $('#class_id').value, date = $('#date').value;
    const marks = Object.entries(currentMarks).map(([learner_id, status]) => ({ learner_id, status }));
    await api('/attendance/mark', { method: 'POST', body: JSON.stringify({ class_id: classId, attendance_date: date, term: currentTermLabel(), marks }) });
    alert('Register saved.');
  }

  async function loadAnalysis() {
    const classId = $('#class_id').value;
    const today = new Date(); const from = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0,10);
    const to = today.toISOString().slice(0,10);
    const data = await api(`/attendance/analysis?class_id=${classId}&from=${from}&to=${to}`);
    $('#analysis').innerHTML = `
      <div class="card"><h3>Per-learner totals (${from} to ${to})</h3>
      <table><tr><th>Name</th><th>P</th><th>A</th><th>S</th></tr>
        ${data.per_learner.map(l => `<tr><td>${l.surname} ${l.first_name}</td><td>${l.present}</td><td>${l.absent}</td><td>${l.sick}</td></tr>`).join('')}
      </table>
      <h3>Gender totals</h3>
      <table><tr><th>Gender</th><th>P</th><th>A</th><th>S</th></tr>
        ${data.gender_totals.map(g => `<tr><td>${g.gender||'-'}</td><td>${g.present}</td><td>${g.absent}</td><td>${g.sick}</td></tr>`).join('')}
      </table></div>`;
  }
}
function currentTermLabel() { const d = new Date(); return `Term-${Math.ceil((d.getMonth()+1)/4)}-${d.getFullYear()}`; }

// ---------------- SOCIAL RECORD (per-learner lookup) ----------------
async function socialTab(c) {
  c.innerHTML = `
    <div class="card">
      <h3>Social Record</h3>
      <input id="learner_id" placeholder="Learner ID">
      <button id="loadSocial">Load</button>
    </div>
    <div id="socialForm"></div>`;
  $('#loadSocial').onclick = async () => {
    const data = await api(`/social-records/${$('#learner_id').value}`);
    $('#socialForm').innerHTML = `
      <div class="card">
        <p><strong>${data.name}</strong> — DOB: ${data.date_of_birth||''} — Religion: ${data.religion||''}</p>
        <label>Birth entry number</label><input id="ben" value="${data.birth_entry_number||''}">
        <label>Health status</label><input id="hs" value="${data.health_status||''}">
        <label>Hobby</label><input id="hobby" value="${data.hobby||''}">
        <label>Family type</label><input id="ft" value="${data.family_type||''}">
        <label>Aspiration</label><input id="asp" value="${data.aspiration||''}">
        <label>Distance from home</label><input id="dist" value="${data.distance_from_home||''}">
        <div><button id="saveSocial">Save</button></div>
      </div>`;
    $('#saveSocial').onclick = async () => {
      await api(`/social-records/${$('#learner_id').value}`, { method: 'PUT', body: JSON.stringify({
        birth_entry_number: $('#ben').value, health_status: $('#hs').value, hobby: $('#hobby').value,
        family_type: $('#ft').value, aspiration: $('#asp').value, distance_from_home: $('#dist').value
      }) });
      alert('Saved.');
    };
  };
}

// ---------------- GENERIC CLASS RECORD MODULES (remedial/extension/progress/anecdotal) ----------------
const SUBJECTS = ['ChiShona','English Language','Mathematics','Physical Education and Arts','Science and Technology','Social Science'];

async function genericClassRecordTab(c, tab, cfg) {
  const classes = await api('/classes');
  const myClasses = classes.filter(cl => cl.teacher_id === state.user.id);
  c.innerHTML = `
    <div class="card">
      <h3>${labelFor(tab)}</h3>
      <select id="class_id">${myClasses.map(cl=>`<option value="${cl.id}">${cl.grade_level} ${cl.stream_name}</option>`).join('')}</select>
      ${cfg.subjectField ? `<select id="subject">${SUBJECTS.map(s=>`<option>${s}</option>`).join('')}</select>` : ''}
      <input id="learner_id" placeholder="Learner ID">
      <input id="record_date" type="date" value="${new Date().toISOString().slice(0,10)}">
      ${cfg.fields.map(f => `<input id="f_${f}" placeholder="${f.replace(/_/g,' ')}">`).join('')}
      <div><button id="saveRecord">Add record</button></div>
    </div>
    <div id="recordList"></div>`;

  async function loadList() {
    const classId = $('#class_id').value;
    if (!classId) return;
    const subj = cfg.subjectField ? `&subject=${encodeURIComponent($('#subject').value)}` : '';
    const rows = await api(`${cfg.api}?class_id=${classId}${subj}`);
    $('#recordList').innerHTML = `<div class="card"><table><tr><th>Date</th><th>Learner</th>${cfg.fields.map(f=>`<th>${f}</th>`).join('')}</tr>
      ${rows.map(r => `<tr><td>${r.record_date}</td><td>${r.learner_id}</td>${cfg.fields.map(f=>`<td>${r[f]??''}</td>`).join('')}</tr>`).join('')}
    </table></div>`;
  }
  $('#class_id').onchange = loadList;
  if (cfg.subjectField) $('#subject').onchange = loadList;

  $('#saveRecord').onclick = async () => {
    const body = { class_id: $('#class_id').value, learner_id: $('#learner_id').value, record_date: $('#record_date').value };
    if (cfg.subjectField) body.subject = $('#subject').value;
    cfg.fields.forEach(f => body[f] = $('#f_' + f).value);
    await api(cfg.api, { method: 'POST', body: JSON.stringify(body) });
    loadList();
  };
  loadList();
}

// ---------------- READING RECORD ----------------
async function readingTab(c) {
  const classes = await api('/classes');
  const myClasses = classes.filter(cl => cl.teacher_id === state.user.id);
  c.innerHTML = `
    <div class="card">
      <h3>Reading Record</h3>
      <select id="class_id">${myClasses.map(cl=>`<option value="${cl.id}">${cl.grade_level} ${cl.stream_name}</option>`).join('')}</select>
      <select id="subject"><option>English</option><option>ChiShona</option></select>
      <div>
        <input id="skill_name" placeholder="New skill name (e.g. Blending sounds)">
        <button id="addSkill">Add skill</button>
      </div>
      <select id="skill_id"></select>
      <input id="learner_id" placeholder="Learner ID">
      <input id="source" placeholder="Source of matter">
      <input id="record_date" type="date" value="${new Date().toISOString().slice(0,10)}">
      <select id="mastery"><option value="M">M - mastered</option><option value="X">X - not mastered</option></select>
      <div><button id="saveReading">Save</button></div>
    </div>
    <div id="readingList"></div>`;

  async function loadSkills() {
    const skills = await api(`/reading-record/skills?class_id=${$('#class_id').value}&subject=${$('#subject').value}`);
    $('#skill_id').innerHTML = skills.map(s => `<option value="${s.id}">${s.skill_name}</option>`).join('');
  }
  async function loadList() {
    const rows = await api(`/reading-record?class_id=${$('#class_id').value}&subject=${$('#subject').value}`);
    $('#readingList').innerHTML = `<div class="card"><table><tr><th>Date</th><th>Learner</th><th>Source</th><th>Mastery</th></tr>
      ${rows.map(r=>`<tr><td>${r.record_date}</td><td>${r.learner_id}</td><td>${r.source_of_matter||''}</td><td>${r.mastery}</td></tr>`).join('')}
    </table></div>`;
  }
  $('#class_id').onchange = () => { loadSkills(); loadList(); };
  $('#subject').onchange = () => { loadSkills(); loadList(); };
  $('#addSkill').onclick = async () => {
    await api('/reading-record/skills', { method: 'POST', body: JSON.stringify({
      class_id: $('#class_id').value, subject: $('#subject').value, skill_name: $('#skill_name').value }) });
    loadSkills();
  };
  $('#saveReading').onclick = async () => {
    await api('/reading-record', { method: 'POST', body: JSON.stringify({
      class_id: $('#class_id').value, subject: $('#subject').value, learner_id: $('#learner_id').value,
      record_date: $('#record_date').value, source_of_matter: $('#source').value,
      skill_id: $('#skill_id').value, mastery: $('#mastery').value }) });
    loadList();
  };
  if (myClasses.length) { loadSkills(); loadList(); }
}

// ---------------- HEALTH CHECKLIST ----------------
async function healthTab(c) {
  const classes = await api('/classes');
  const myClasses = classes.filter(cl => cl.teacher_id === state.user.id);
  c.innerHTML = `
    <div class="card">
      <h3>Health Checklist (daily)</h3>
      <select id="class_id">${myClasses.map(cl=>`<option value="${cl.id}">${cl.grade_level} ${cl.stream_name}</option>`).join('')}</select>
      <input id="record_date" type="date" value="${new Date().toISOString().slice(0,10)}">
      <button id="loadHealth">Load</button>
    </div>
    <div id="healthRows"></div>
    <div class="card"><button id="saveHealth">Save</button></div>`;
  let marks = {};
  $('#loadHealth').onclick = async () => {
    const rows = await api(`/health-checklist/daily?class_id=${$('#class_id').value}&record_date=${$('#record_date').value}`);
    marks = Object.fromEntries(rows.map(r => [r.id, r.status]));
    $('#healthRows').innerHTML = `<div class="card"><table><tr><th>Name</th><th>Mark</th></tr>
      ${rows.map(r => `<tr><td>${r.surname} ${r.first_name}</td><td class="status-btns">
        <button data-id="${r.id}" data-s="W">W</button><button data-id="${r.id}" data-s="S">S</button><button data-id="${r.id}" data-s="A">A</button>
        <span id="hlabel-${r.id}">${r.status||''}</span></td></tr>`).join('')}
    </table></div>`;
    document.querySelectorAll('#healthRows button').forEach(b => b.onclick = () => {
      marks[b.dataset.id] = b.dataset.s; $(`#hlabel-${b.dataset.id}`).textContent = b.dataset.s;
    });
  };
  $('#saveHealth').onclick = async () => {
    const marksArr = Object.entries(marks).map(([learner_id, status]) => ({ learner_id, status }));
    await api('/health-checklist/daily', { method: 'POST', body: JSON.stringify({
      class_id: $('#class_id').value, record_date: $('#record_date').value, marks: marksArr }) });
    alert('Saved.');
  };
}

// ---------------- EMPLOYEES (admin) ----------------
async function employeesTab(c) {
  const emps = await api('/employees');
  c.innerHTML = `
    <div class="card"><h3>Employees</h3>
      <table><tr><th>Name</th><th>Email</th><th>Role</th></tr>
      ${emps.map(e=>`<tr><td>${e.name}</td><td>${e.email}</td><td>${e.role}</td></tr>`).join('')}</table>
    </div>
    <div class="card"><h3>Add employee</h3>
      <input id="name" placeholder="Name"><input id="email" placeholder="Email">
      <input id="phone" placeholder="Phone"><input id="password" placeholder="Temp password">
      <select id="role"><option value="teacher">Teacher</option><option value="ancillary">Ancillary staff</option></select>
      <input id="duty" placeholder="Duty (if ancillary)">
      <div><button id="addEmp">Add</button></div>
    </div>`;
  $('#addEmp').onclick = async () => {
    await api('/auth/users', { method: 'POST', body: JSON.stringify({
      name: $('#name').value, email: $('#email').value, phone: $('#phone').value,
      password: $('#password').value, role: $('#role').value, duty: $('#duty').value }) });
    employeesTab(c);
  };
}

// ---------------- FINANCES (admin) ----------------
async function financesTab(c) {
  const invoices = await api('/finances/invoices');
  c.innerHTML = `
    <div class="card"><h3>Fee Invoices</h3>
      <table><tr><th>Learner</th><th>Term</th><th>Due</th><th>Paid</th><th>Balance</th></tr>
      ${invoices.map(i=>`<tr><td>${i.learner_id}</td><td>${i.term} ${i.year}</td><td>${i.amount_due}</td><td>${i.amount_paid}</td><td>${i.balance}</td></tr>`).join('')}</table>
    </div>
    <div class="card"><h3>Create invoice</h3>
      <input id="learner_id" placeholder="Learner ID">
      <input id="term" placeholder="Term e.g. Term 1"><input id="year" placeholder="Year" type="number">
      <input id="amount" placeholder="Amount due" type="number">
      <div><button id="addInvoice">Create</button></div>
    </div>
    <div class="card"><h3>Record payment</h3>
      <input id="invoice_id" placeholder="Invoice ID"><input id="pamount" placeholder="Amount paid" type="number">
      <div><button id="recordPayment">Record</button></div>
    </div>`;
  $('#addInvoice').onclick = async () => {
    await api('/finances/invoices', { method: 'POST', body: JSON.stringify({
      learner_id: $('#learner_id').value, term: $('#term').value, year: +$('#year').value, amount_due: +$('#amount').value }) });
    financesTab(c);
  };
  $('#recordPayment').onclick = async () => {
    await api('/finances/payments', { method: 'POST', body: JSON.stringify({
      invoice_id: $('#invoice_id').value, amount: +$('#pamount').value, method: 'manual' }) });
    financesTab(c);
  };
}

async function myFinancesTab(c) {
  const invoices = await api('/finances/invoices');
  c.innerHTML = `<div class="card"><h3>My Fees</h3>
    <table><tr><th>Term</th><th>Due</th><th>Paid</th><th>Balance</th></tr>
    ${invoices.map(i=>`<tr><td>${i.term} ${i.year}</td><td>${i.amount_due}</td><td>${i.amount_paid}</td><td>${i.balance}</td></tr>`).join('')}</table></div>`;
}

// ---------------- EXAMS ----------------
async function examsTab(c) {
  c.innerHTML = `
    <div class="card"><h3>Exam Terms</h3>
      <input id="term_name" placeholder="Term name e.g. Term 1"><input id="year" placeholder="Year" type="number">
      <button id="addTerm">Create term</button>
    </div>
    <div class="card"><h3>Set possible mark (per subject/class)</h3>
      <input id="exam_term_id" placeholder="Exam term ID"><input id="class_id" placeholder="Class ID">
      <select id="subject">${SUBJECTS.map(s=>`<option>${s}</option>`).join('')}</select>
      <input id="possible" placeholder="Possible mark" type="number">
      <button id="setPossible">Set</button>
    </div>
    <div class="card"><h3>Class positions</h3>
      <input id="pt_exam_term_id" placeholder="Exam term ID"><input id="pt_class_id" placeholder="Class ID">
      <button id="loadPositions">Load</button>
      <div id="positions"></div>
    </div>`;
  $('#addTerm').onclick = async () => {
    const r = await api('/exams/terms', { method: 'POST', body: JSON.stringify({ term_name: $('#term_name').value, year: +$('#year').value }) });
    alert('Term ID: ' + r.id);
  };
  $('#setPossible').onclick = async () => {
    await api('/exams/possible-mark', { method: 'POST', body: JSON.stringify({
      exam_term_id: $('#exam_term_id').value, class_id: $('#class_id').value, subject: $('#subject').value, possible_mark: +$('#possible').value }) });
    alert('Set.');
  };
  $('#loadPositions').onclick = async () => {
    const rows = await api(`/exams/class-positions?exam_term_id=${$('#pt_exam_term_id').value}&class_id=${$('#pt_class_id').value}`);
    $('#positions').innerHTML = `<table><tr><th>Position</th><th>Name</th><th>Total units</th><th>Total %</th></tr>
      ${rows.map(r=>`<tr><td>${r.position}</td><td>${r.name}</td><td>${r.total_units}</td><td>${r.total_percentage.toFixed(1)}</td></tr>`).join('')}
    </table>`;
  };
}

// ---------------- ENROLMENT (admin review) ----------------
async function enrolmentAdminTab(c) {
  const apps = await api('/enrolment/applications');
  c.innerHTML = `<div class="card"><h3>Enrolment Applications</h3>
    <table><tr><th>Name</th><th>Grade</th><th>Status</th><th>Action</th></tr>
      ${apps.map(a=>`<tr><td>${a.applicant_first_name} ${a.applicant_surname}</td><td>${a.grade_applied_for}</td><td>${a.status}</td>
        <td>${a.status==='pending' ? `<input id="cid-${a.id}" placeholder="Class ID" style="width:100px"><button data-id="${a.id}" class="approveBtn">Approve</button>` : ''}</td></tr>`).join('')}
    </table></div>`;
  document.querySelectorAll('.approveBtn').forEach(b => b.onclick = async () => {
    const classId = $(`#cid-${b.dataset.id}`).value;
    await api(`/enrolment/${b.dataset.id}/decision`, { method: 'PATCH', body: JSON.stringify({ status: 'approved', class_id: classId }) });
    enrolmentAdminTab(c);
  });
}

// ---------------- INIT ----------------
async function render() {
  if (!state.token) {
    return state.view === 'enrol' ? enrolView() : loginView();
  }
  if (!state.user) {
    try {
      const me = await api('/auth/me');
      const sub = await api('/finances/subscription');
      setState({ user: me, school: sub, view: 'dashboard' });
    } catch (e) {
      localStorage.removeItem('sm_token');
      setState({ token: null, view: 'login' });
    }
    return;
  }
  dashboardView();
}

render();
