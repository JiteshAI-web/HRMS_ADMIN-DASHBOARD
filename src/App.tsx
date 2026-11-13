import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth';
import { onValue, ref } from 'firebase/database';
import { Activity, AlertCircle, ArrowUpRight, BriefcaseBusiness, CalendarDays, Check, ChevronDown, Clock3, FileSpreadsheet, FileText, LayoutDashboard, LoaderCircle, LogOut, Menu, Search, ShieldCheck, Users, X } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';
import { auth, database, firebaseConfigured } from './firebase';
import { asMap, buildAttendance, dateKey, formatDate, formatDuration, monthKey, parseEmployees } from './data';
import type { AttendanceDay, Employee } from './types';

type Section = 'overview' | 'employees' | 'activity' | 'reports';
type LoadState = 'loading' | 'ready' | 'error';
const currentMonth = () => monthKey(new Date());
const monthLabel = (month: string) => new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(new Date(`${month}-01T12:00:00Z`));
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join('').toUpperCase() || '??';

const MONTH_NAMES = [
  { value: '01', label: 'January' },
  { value: '02', label: 'February' },
  { value: '03', label: 'March' },
  { value: '04', label: 'April' },
  { value: '05', label: 'May' },
  { value: '06', label: 'June' },
  { value: '07', label: 'July' },
  { value: '08', label: 'August' },
  { value: '09', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' },
];

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [rawAttendance, setRawAttendance] = useState<unknown>(null);
  const [locations, setLocations] = useState<Record<string, unknown>>({});
  const [dataState, setDataState] = useState<LoadState>('loading');
  const [dataError, setDataError] = useState('');
  const [section, setSection] = useState<Section>('overview');
  const [month, setMonth] = useState(currentMonth);
  const [query, setQuery] = useState('');
  const [employeeFilter, setEmployeeFilter] = useState('all');
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const [, setClockTick] = useState(0);

  useEffect(() => {
    if (!showUserMenu) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowUserMenu(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showUserMenu]);

  useEffect(() => {
    if (!auth) { setAuthLoading(false); return; }
    return onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      setAuthorized(false);
      if (nextUser) {
        const allowedEmails = (import.meta.env.VITE_HR_ADMIN_EMAILS || 'bariflolabs.deploy@gmail.com')
          .split(',')
          .map((email: string) => email.trim().toLowerCase())
          .filter(Boolean);
        setAuthorized(Boolean(nextUser.email && allowedEmails.includes(nextUser.email.toLowerCase())));
      }
      setAuthLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!database || !user || !authorized) return;
    const loaded = new Set<string>();
    const ready = (key: string) => { loaded.add(key); if (loaded.size === 3) setDataState('ready'); };
    const fail = (error: Error) => { setDataError(error.message); setDataState('error'); };
    setDataState('loading');
    const unsubscribers = [
      onValue(ref(database, 'users'), (snapshot) => { setEmployees(parseEmployees(snapshot.val())); ready('users'); }, fail),
      onValue(ref(database, 'Attendance'), (snapshot) => { setRawAttendance(snapshot.val()); ready('Attendance'); }, fail),
      onValue(ref(database, 'location'), (snapshot) => { setLocations(asMap(snapshot.val())); ready('location'); }, fail),
    ];
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [user, authorized]);

  // Attendance is always joined from the latest snapshots, regardless of listener arrival order.
  const attendance = useMemo(
    () => buildAttendance(rawAttendance, employees, locations),
    [rawAttendance, employees, locations],
  );

  useEffect(() => {
    if (!user || !authorized) return;
    const timer = window.setInterval(() => {
      setClockTick((tick) => tick + 1);
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [user, authorized]);

  const availableYears = useMemo(() => {
    const startYear = 2020;
    const endYear = 2050;
    const years = new Set<number>();
    for (let y = startYear; y <= endYear; y++) {
      years.add(y);
    }
    for (const row of attendance) {
      const y = row.date.getFullYear();
      if (!isNaN(y)) years.add(y);
    }
    const valYear = Number(month.split('-')[0]);
    if (valYear && !isNaN(valYear)) years.add(valYear);
    return Array.from(years).sort((a, b) => a - b);
  }, [attendance, month]);

  const todayKey = dateKey(new Date());
  const todayRows = attendance.filter((row) => row.dateKey === todayKey);
  const todayPresent = new Set(todayRows.filter((row) => row.present).map((row) => row.uid));
  const currentlyIn = todayRows.filter((row) => row.checkedIn && row.present).length;
  const monthRows = attendance.filter((row) => monthKey(row.date) === month);
  const monthPresentRows = monthRows.filter((row) => row.present);
  const attendanceDays = monthPresentRows.length;
  const absentToday = Math.max(0, employees.length - todayPresent.size);
  const presentByEmployee = useMemo(() => {
    const result = new Map<string, number>();
    for (const row of monthPresentRows) result.set(row.uid, (result.get(row.uid) ?? 0) + 1);
    return result;
  }, [monthPresentRows]);

  const filteredEmployees = employees.filter((employee) => `${employee.name} ${employee.id} ${employee.email} ${employee.designation}`.toLowerCase().includes(query.toLowerCase()));
  const filteredRows = monthRows.filter((row) => {
    const textMatch = `${row.employee.name} ${row.employee.id} ${row.office}`.toLowerCase().includes(query.toLowerCase());
    return textMatch && (employeeFilter === 'all' || row.uid === employeeFilter);
  });

  const selectedFilteredEmployee = employees.find((e) => e.uid === employeeFilter) || null;

  const dailyChart = useMemo(() => {
    const [year, monthNum] = month.split('-').map(Number);
    const days = new Date(year, monthNum, 0).getDate();
    const byDay = new Map<number, Set<string>>();
    for (const row of monthPresentRows) {
      const set = byDay.get(Number(row.dateKey.slice(0, 2))) ?? new Set<string>();
      set.add(row.uid);
      byDay.set(Number(row.dateKey.slice(0, 2)), set);
    }
    return Array.from({ length: days }, (_, i) => ({ day: i + 1, present: byDay.get(i + 1)?.size ?? 0 }));
  }, [month, monthPresentRows]);

  const handleLogin = async (email: string, password: string, onError: (message: string) => void, setBusy: (busy: boolean) => void) => {
    if (!auth) return;
    setBusy(true);
    onError('');
    try { await signInWithEmailAndPassword(auth, email.trim(), password); }
    catch (error) { onError(error instanceof Error ? error.message.replace('Firebase: ', '') : 'Sign in failed. Try again.'); }
    finally { setBusy(false); }
  };

  const logout = async () => { if (auth) await signOut(auth); setSection('overview'); };

  const exportExcel = (rows: AttendanceDay[], filename: string, targetEmployee?: Employee | null) => {
    const data = rows.length
      ? rows.map(exportRow)
      : [{
          'Employee Name': targetEmployee ? targetEmployee.name : '—',
          'Employee ID': targetEmployee ? targetEmployee.id : '—',
          Date: '—',
          'IN Time': '—',
          'OUT Time': '—',
          'Office Location': '—',
          Worked: '0h 00m',
          'Attendance Status': 'No attendance recorded for this month',
        }];
    const sheet = XLSX.utils.json_to_sheet(data);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, 'Attendance');
    XLSX.writeFile(book, filename);
  };

  const exportPdf = (rows: AttendanceDay[], title: string, filename: string, targetEmployee?: Employee | null) => {
    const pdf = new jsPDF({ orientation: 'landscape' });
    pdf.setFontSize(18);
    pdf.text(title, 14, 17);
    pdf.setFontSize(9);
    pdf.text(`Generated ${new Date().toLocaleString()} · ${rows.length} attendance record${rows.length === 1 ? '' : 's'}`, 14, 24);
    const headers = ['Employee Name', 'Employee ID', 'Date', 'IN Time', 'OUT Time', 'Office Location', 'Worked', 'Attendance Status'];
    const data = rows.length
      ? rows.map((row) => [
          row.employee.name,
          row.employee.id,
          formatDate(row.date),
          row.inTime,
          row.outTime,
          row.office,
          formatDuration(row.workedMinutes),
          row.checkedIn ? 'Checked IN' : row.present ? 'Present' : 'Absent',
        ])
      : [[
          targetEmployee ? targetEmployee.name : '—',
          targetEmployee ? targetEmployee.id : '—',
          '—',
          '—',
          '—',
          '—',
          '0h 00m',
          'No attendance recorded for this month',
        ]];
    let y = 34;
    const widths = [44, 26, 26, 22, 22, 60, 24, 32];
    const drawRow = (cells: string[], fill: boolean) => {
      let x = 14;
      cells.forEach((cell, index) => {
        if (fill) {
          pdf.setFillColor(237, 241, 250);
          pdf.rect(x, y - 5, widths[index], 8, 'F');
        }
        pdf.setTextColor(35, 45, 68);
        pdf.text(String(cell).slice(0, 42), x + 1.5, y);
        x += widths[index];
      });
      y += 9;
    };
    drawRow(headers, true);
    data.forEach((row) => {
      if (y > 190) {
        pdf.addPage();
        y = 18;
        drawRow(headers, true);
      }
      drawRow(row, false);
    });
    pdf.save(filename);
  };

  const getExportData = () => {
    if (employeeFilter !== 'all' && selectedFilteredEmployee) {
      const rows = monthRows.filter((r) => r.uid === employeeFilter);
      const cleanName = selectedFilteredEmployee.name.replace(/[^a-zA-Z0-9_-]/g, '_');
      const filenameBase = `Bariflo_${cleanName}_${selectedFilteredEmployee.id}_${month}`;
      const title = `${selectedFilteredEmployee.name} (${selectedFilteredEmployee.id}) · Attendance Report · ${monthLabel(month)}`;
      return { rows, filenameBase, title, employee: selectedFilteredEmployee };
    }
    return {
      rows: monthRows,
      filenameBase: `Bariflo_Attendance_${month}`,
      title: `Monthly Attendance Report · ${monthLabel(month)}`,
      employee: null,
    };
  };

  const handleExportExcel = () => {
    const { rows, filenameBase, employee } = getExportData();
    exportExcel(rows, `${filenameBase}.xlsx`, employee);
  };

  const handleExportPdf = () => {
    const { rows, filenameBase, title, employee } = getExportData();
    exportPdf(rows, title, `${filenameBase}.pdf`, employee);
  };

  if (!firebaseConfigured) return <Setup />;
  if (authLoading) return <div className="screen-center"><LoaderCircle className="spin" size={32} /><span>Checking secure session…</span></div>;
  if (!user) return <Login onSubmit={handleLogin} />;
  if (!authorized) return <AccessDenied email={user.email ?? ''} onLogout={logout} />;

  const nav: { key: Section; label: string; icon: typeof LayoutDashboard }[] = [
    { key: 'overview', label: 'Overview', icon: LayoutDashboard },
    { key: 'employees', label: 'Employees', icon: Users },
    { key: 'activity', label: 'Attendance activity', icon: Activity },
    { key: 'reports', label: 'Reports', icon: FileText },
  ];
  const sectionTitle: Record<Section, string> = {
    overview: 'Workforce overview',
    employees: 'Employee directory',
    activity: 'Attendance activity',
    reports: 'Attendance reports',
  };

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
        <div className="brand">
          <img src="/bariflo-logo.png" alt="Bariflo Cybernetics" />
          <span>PEOPLE<span className="brand-muted"> / HRMS</span></span>
          <button className="icon-button mobile-close" onClick={() => setMobileNav(false)} aria-label="Close navigation">
            <X size={18} />
          </button>
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {nav.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              className={`nav-item ${section === key ? 'active' : ''}`}
              onClick={() => { setSection(key); setMobileNav(false); }}
            >
              <Icon size={18} />
              <span>{label}</span>
              {key === 'activity' && <span className="nav-badge">LIVE</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="secure-note">
            <ShieldCheck size={17} />
            <span>Secure HR workspace</span>
          </div>
        </div>
      </aside>

      {mobileNav && <button className="scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}

      <main className="main-area">
        <header className="topbar">
          <button className="icon-button mobile-menu" onClick={() => setMobileNav(true)} aria-label="Open navigation">
            <Menu size={20} />
          </button>
          <div className="crumb">
            Workspace <span>/</span> <strong>{sectionTitle[section]}</strong>
          </div>
          <div className="topbar-right">
            <span className="live-status"><i /> Live sync</span>
            <span className="date-pill">
              <CalendarDays size={15} />
              {new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }).format(new Date())}
            </span>
            <div className="user-menu-wrap" ref={userMenuRef}>
              <button
                type="button"
                className="avatar small-avatar user-menu-trigger"
                onClick={() => setShowUserMenu((prev) => !prev)}
                aria-label="Account menu"
                aria-expanded={showUserMenu}
                title="Account & Sign out"
              >
                {initials(user.displayName || user.email || 'HR')}
              </button>

              {showUserMenu && (
                <div className="user-menu-dropdown">
                  <div className="user-menu-header">
                    <div className="avatar small-avatar">{initials(user.displayName || user.email || 'HR')}</div>
                    <div className="user-menu-info">
                      <strong>{user.displayName || user.email?.split('@')[0] || 'HR Administrator'}</strong>
                      <span>{user.email || 'Authorized HR'}</span>
                    </div>
                  </div>
                  <div className="user-menu-badge">
                    <ShieldCheck size={13} />
                    <span>Authorized HR Admin</span>
                  </div>
                  <div className="user-menu-divider" />
                  <button
                    type="button"
                    className="user-menu-item logout"
                    onClick={() => {
                      setShowUserMenu(false);
                      void logout();
                    }}
                  >
                    <LogOut size={16} />
                    <span>Sign out</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="content-wrap">
          {dataError && (
            <div className="alert error-alert">
              <AlertCircle size={17} />
              <span>Could not load Firebase data. Check your database rules and connection. {dataError}</span>
              <button onClick={() => setDataError('')} aria-label="Dismiss"><X size={16} /></button>
            </div>
          )}

          {dataState === 'loading' ? (
            <div className="loading-panel"><LoaderCircle className="spin" size={26} /><span>Loading live workforce data…</span></div>
          ) : dataState === 'error' ? (
            <div className="loading-panel error-text">The dashboard could not read Firebase data. Confirm HR users have Realtime Database read access.</div>
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">BARIFLO CYBERNETICS <span>•</span> PEOPLE OPERATIONS</div>
                  <h1>{sectionTitle[section]}</h1>
                  <p>Here’s what’s happening across your workforce.</p>
                </div>
              </div>

              {section === 'overview' && (
                <Overview
                  employees={employees}
                  presentCount={todayPresent.size}
                  absentCount={absentToday}
                  currentlyIn={currentlyIn}
                  attendanceDays={attendanceDays}
                  month={month}
                  setMonth={setMonth}
                  years={availableYears}
                  chart={dailyChart}
                  rows={monthRows}
                  monthLabel={monthLabel(month)}
                  onEmployee={setSelectedEmployee}
                  presentByEmployee={presentByEmployee}
                />
              )}

              {section === 'employees' && (
                <Employees
                  employees={filteredEmployees}
                  query={query}
                  setQuery={setQuery}
                  presentByEmployee={presentByEmployee}
                  onSelect={setSelectedEmployee}
                />
              )}

              {section === 'activity' && (
                <ActivityTable
                  rows={filteredRows}
                  query={query}
                  setQuery={setQuery}
                  employees={employees}
                  employeeFilter={employeeFilter}
                  setEmployeeFilter={setEmployeeFilter}
                  selectedEmployee={selectedFilteredEmployee}
                  month={month}
                  setMonth={setMonth}
                  years={availableYears}
                  onExportExcel={handleExportExcel}
                  onExportPdf={handleExportPdf}
                />
              )}

              {section === 'reports' && (
                <Reports
                  employees={employees}
                  rows={monthRows}
                  month={month}
                  setMonth={setMonth}
                  years={availableYears}
                  presentByEmployee={presentByEmployee}
                  onPdf={exportPdf}
                  onExcel={exportExcel}
                  onEmployee={setSelectedEmployee}
                />
              )}
            </>
          )}

          <footer className="footer">
            <span>Bariflo HRMS <span>·</span> Realtime workforce intelligence</span>
            <span>Data syncs directly with your mobile apps</span>
          </footer>
        </div>
      </main>

      {selectedEmployee && (
        <EmployeeModal
          employee={selectedEmployee}
          rows={attendance.filter((row) => row.uid === selectedEmployee.uid)}
          month={month}
          years={availableYears}
          onClose={() => setSelectedEmployee(null)}
          onPdf={(rows) => exportPdf(rows, `${selectedEmployee.name} · ${monthLabel(month)}`, `Bariflo_${selectedEmployee.id}_${month}.pdf`, selectedEmployee)}
          onExcel={(rows) => exportExcel(rows, `Bariflo_${selectedEmployee.id}_${month}.xlsx`, selectedEmployee)}
        />
      )}
    </div>
  );
}

function YearMonthPicker({
  value,
  onChange,
  years,
  compact = false,
}: {
  value: string;
  onChange: (val: string) => void;
  years: number[];
  compact?: boolean;
}) {
  const [currentYear, currentMonthNum] = value.split('-');

  return (
    <div className={`year-month-picker ${compact ? 'compact' : ''}`}>
      <label className={`month-picker year-select ${compact ? 'compact' : ''}`} title="Select Year">
        <CalendarDays size={compact ? 14 : 15} />
        <select
          value={currentYear}
          onChange={(e) => onChange(`${e.target.value}-${currentMonthNum || '01'}`)}
        >
          {years.map((y) => (
            <option key={y} value={String(y)}>{y}</option>
          ))}
        </select>
        <ChevronDown size={compact ? 12 : 13} />
      </label>

      <label className={`month-picker month-select ${compact ? 'compact' : ''}`} title="Select Month">
        <select
          value={currentMonthNum}
          onChange={(e) => onChange(`${currentYear}-${e.target.value}`)}
        >
          {MONTH_NAMES.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
        <ChevronDown size={compact ? 12 : 13} />
      </label>
    </div>
  );
}

function exportRow(row: AttendanceDay) {
  return {
    'Employee Name': row.employee.name,
    'Employee ID': row.employee.id,
    Date: formatDate(row.date),
    'IN Time': row.inTime,
    'OUT Time': row.outTime,
    'Office Location': row.office,
    Worked: formatDuration(row.workedMinutes),
    'Attendance Status': row.checkedIn ? 'Checked IN' : row.present ? 'Present' : 'Absent',
  };
}

function Login({ onSubmit }: { onSubmit: (email: string, password: string, error: (message: string) => void, busy: (value: boolean) => void) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void onSubmit(email, password, setError, setBusy);
  };

  return (
    <div className="login-page">
      <div className="login-art">
        <div className="art-orb orb-one" />
        <div className="art-orb orb-two" />
        <div className="art-grid" />
        <div className="art-content">
          <img src="/bariflo-logo.png" alt="Bariflo Cybernetics" />
          <span className="art-kicker">PEOPLE, CONNECTED.</span>
          <h1>Workforce clarity<br />starts here.</h1>
          <p>One trusted view of your people, attendance, and day-to-day activity.</p>
          <div className="art-metric">
            <div className="metric-icon"><Activity size={19} /></div>
            <div>
              <strong>Live attendance intelligence</strong>
              <span>In sync with your Bariflo HRMS apps</span>
            </div>
            <i className="metric-pulse" />
          </div>
        </div>
        <div className="art-footer">BARIFLO CYBERNETICS <span>·</span> HRMS</div>
      </div>
      <div className="login-side">
        <div className="login-card">
          <div className="login-mobile-logo"><img src="/bariflo-logo.png" alt="Bariflo Cybernetics" /></div>
          <div className="login-icon"><ShieldCheck size={23} /></div>
          <div className="eyebrow">HR ADMIN PORTAL</div>
          <h2>Welcome back</h2>
          <p className="login-subtitle">Sign in to continue to your workforce dashboard.</p>
          <form onSubmit={submit}>
            <label>Email address</label>
            <input
              type="email"
              autoComplete="username"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <label>Password</label>
            <div className="password-box">
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button type="button" onClick={() => setShowPassword((value) => !value)}>
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            {error && <div className="form-error"><AlertCircle size={16} />{error}</div>}
            <button className="button-primary login-submit" disabled={busy}>
              {busy ? <><LoaderCircle className="spin" size={17} />Signing in…</> : <>Sign in securely <ArrowUpRight size={17} /></>}
            </button>
          </form>
          <div className="login-security">
            <ShieldCheck size={15} />
            <span>Protected with Firebase Authentication</span>
          </div>
        </div>
        <div className="login-copyright">© {new Date().getFullYear()} Bariflo Cybernetics. Authorized HR access only.</div>
      </div>
    </div>
  );
}

function Setup() {
  return (
    <div className="screen-center setup-message">
      <img src="/bariflo-logo.png" alt="Bariflo" />
      <h2>Connect your Firebase web app</h2>
      <p>Copy the Web SDK settings from your registered Firebase Web app into <code>.env.local</code>, then restart the development server.</p>
    </div>
  );
}

function AccessDenied({ email, onLogout }: { email: string; onLogout: () => void }) {
  return (
    <div className="screen-center">
      <div className="denied-card">
        <div className="denied-icon"><ShieldCheck size={28} /></div>
        <h2>HR access required</h2>
        <p><strong>{email}</strong> is signed in, but is not on the dashboard’s allowed HR email list.</p>
        <p>Add the authorized email to <code>VITE_HR_ADMIN_EMAILS</code> in <code>.env.local</code>, then restart the dashboard.</p>
        <button className="button-primary" onClick={onLogout}>
          <LogOut size={16} />Sign out
        </button>
      </div>
    </div>
  );
}

function StatCard({ title, value, detail, icon: Icon, tone, tag }: { title: string; value: string | number; detail: string; icon: typeof Users; tone: string; tag?: string }) {
  return (
    <div className={`stat-card ${tone}`}>
      <div className="stat-top">
        <div className="stat-icon"><Icon size={19} /></div>
        {tag && <span className="stat-tag">{tag}</span>}
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-title">{title}</div>
      <div className="stat-detail">{detail}</div>
    </div>
  );
}

function Overview({
  employees,
  presentCount,
  absentCount,
  currentlyIn,
  attendanceDays,
  month,
  setMonth,
  years,
  chart,
  rows,
  monthLabel: selectedLabel,
  onEmployee,
  presentByEmployee,
}: {
  employees: Employee[];
  presentCount: number;
  absentCount: number;
  currentlyIn: number;
  attendanceDays: number;
  month: string;
  setMonth: (m: string) => void;
  years: number[];
  chart: { day: number; present: number }[];
  rows: AttendanceDay[];
  monthLabel: string;
  onEmployee: (employee: Employee) => void;
  presentByEmployee: Map<string, number>;
}) {
  const top = [...employees].sort((a, b) => (presentByEmployee.get(b.uid) ?? 0) - (presentByEmployee.get(a.uid) ?? 0));
  const recent = rows.filter((row) => row.dateKey === dateKey(new Date())).slice(0, 6);

  return (
    <>
      <div className="stats-grid">
        <StatCard title="Registered employees" value={employees.length} detail="Active in employee directory" icon={Users} tone="blue" />
        <StatCard title="Present today" value={presentCount} detail={`${employees.length ? Math.round(presentCount / employees.length * 100) : 0}% of total workforce`} icon={Check} tone="green" tag="TODAY" />
        <StatCard title="Absent today" value={absentCount} detail="No check-in recorded today" icon={CalendarDays} tone="orange" tag="TODAY" />
        <StatCard title="Currently checked in" value={currentlyIn} detail="Active attendance sessions" icon={Clock3} tone="purple" tag="LIVE" />
      </div>

      <div className="overview-grid">
        <section className="panel chart-panel">
          <div className="panel-head">
            <div>
              <h3>Attendance trend</h3>
              <p>Employees present each day · {selectedLabel}</p>
            </div>
            <div className="chart-head-right">
              <YearMonthPicker value={month} onChange={setMonth} years={years} compact />
              <div className="legend"><i />Present</div>
            </div>
          </div>
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chart} margin={{ top: 12, right: 12, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="presentFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#5b72ef" stopOpacity={0.24} />
                    <stop offset="95%" stopColor="#5b72ef" stopOpacity={0.01} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#edf0f6" strokeDasharray="4 5" vertical={false} />
                <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fill: '#8992a8', fontSize: 11 }} tickFormatter={(d) => d % 5 === 0 || d === 1 ? `${d}` : ''} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: '#8992a8', fontSize: 11 }} />
                <Tooltip contentStyle={{ border: '1px solid #edf0f6', borderRadius: 12, boxShadow: '0 8px 25px #1b2b4d12' }} labelFormatter={(d) => `${selectedLabel.split(' ')[0]} ${d}`} />
                <Area type="monotone" dataKey="present" name="Present" stroke="#586eea" strokeWidth={2.5} fill="url(#presentFill)" activeDot={{ r: 5, strokeWidth: 0 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="chart-foot">
            <span><b>{attendanceDays}</b> employee-days</span>
            <span>Selected month: {month}</span>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <h3>Monthly leaders</h3>
              <p>Most present days in {selectedLabel}</p>
            </div>
            <span className="mini-icon"><BriefcaseBusiness size={16} /></span>
          </div>
          <div className="leader-list">
            {top.length ? (
              top.map((employee, index) => (
                <button className="leader-row" key={employee.uid} onClick={() => onEmployee(employee)}>
                  <span className={`rank rank-${index + 1}`}>{String(index + 1).padStart(2, '0')}</span>
                  <span className="avatar">{initials(employee.name)}</span>
                  <span className="leader-name">
                    <b>{employee.name}</b>
                    <small>{employee.designation || employee.id}</small>
                  </span>
                  <span className="leader-days">
                    <b>{presentByEmployee.get(employee.uid) ?? 0}</b>
                    <small>days</small>
                  </span>
                </button>
              ))
            ) : (
              <Empty text="No employee attendance for this month yet." />
            )}
          </div>
        </section>
      </div>

      <section className="panel recent-panel">
        <div className="panel-head">
          <div>
            <h3>Today’s activity</h3>
            <p>Latest employee attendance records</p>
          </div>
          <span className="live-status"><i />Live</span>
        </div>
        <SimpleTable rows={recent} onEmployee={onEmployee} empty="No attendance activity recorded today." />
      </section>
    </>
  );
}

function Employees({
  employees,
  query,
  setQuery,
  presentByEmployee,
  onSelect,
}: {
  employees: Employee[];
  query: string;
  setQuery: (value: string) => void;
  presentByEmployee: Map<string, number>;
  onSelect: (employee: Employee) => void;
}) {
  return (
    <section className="panel directory-panel">
      <div className="panel-head">
        <div>
          <h3>All employees <span className="count-pill">{employees.length}</span></h3>
          <p>Employee profiles and department directory</p>
        </div>
        <SearchBox query={query} setQuery={setQuery} placeholder="Search employees…" />
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>EMPLOYEE</th>
              <th>EMPLOYEE ID</th>
              <th>DESIGNATION</th>
              <th>OFFICE</th>
              <th>PHONE</th>
              <th>PRESENT DAYS</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {employees.map((employee) => (
              <tr key={employee.uid} onClick={() => onSelect(employee)} className="click-row">
                <td>
                  <div className="employee-cell">
                    <span className="avatar">{initials(employee.name)}</span>
                    <span>
                      <b>{employee.name}</b>
                      <small>{employee.email || '—'}</small>
                    </span>
                  </div>
                </td>
                <td>{employee.id}</td>
                <td>{employee.designation || '—'}</td>
                <td>{employee.officeKey || '—'}</td>
                <td>{employee.phone || '—'}</td>
                <td><span className="days-pill">{presentByEmployee.get(employee.uid) ?? 0} days</span></td>
                <td><ArrowUpRight size={16} className="muted-icon" /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!employees.length && <Empty text="No employees match your search." />}
      </div>
      <div className="table-caption">
        Showing {employees.length} employee{employees.length === 1 ? '' : 's'} in directory
      </div>
    </section>
  );
}

function SearchBox({ query, setQuery, placeholder }: { query: string; setQuery: (value: string) => void; placeholder: string }) {
  return (
    <label className="searchbox">
      <Search size={16} />
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={placeholder} />
      {query && <button onClick={() => setQuery('')} aria-label="Clear search"><X size={14} /></button>}
    </label>
  );
}

function ActivityTable({
  rows,
  query,
  setQuery,
  employees,
  employeeFilter,
  setEmployeeFilter,
  selectedEmployee,
  month,
  setMonth,
  years,
  onExportExcel,
  onExportPdf,
}: {
  rows: AttendanceDay[];
  query: string;
  setQuery: (value: string) => void;
  employees: Employee[];
  employeeFilter: string;
  setEmployeeFilter: (value: string) => void;
  selectedEmployee?: Employee | null;
  month: string;
  setMonth: (value: string) => void;
  years: number[];
  onExportExcel: () => void;
  onExportPdf: () => void;
}) {
  return (
    <section className="panel directory-panel">
      <div className="panel-head">
        <div>
          <h3>Employee activity</h3>
          <p>Daily check-in and check-out details for {monthLabel(month)}</p>
        </div>
      </div>
      <div className="table-tools">
        <div className="table-tools-left">
          <SearchBox query={query} setQuery={setQuery} placeholder="Search name, ID, or office…" />
          <label className="filter-select">
            <Users size={15} />
            <select value={employeeFilter} onChange={(e) => setEmployeeFilter(e.target.value)}>
              <option value="all">All employees</option>
              {employees.map((employee) => (
                <option key={employee.uid} value={employee.uid}>
                  {employee.name} ({employee.id})
                </option>
              ))}
            </select>
            <ChevronDown size={14} />
          </label>
        </div>
        <div className="table-tools-right">
          <YearMonthPicker value={month} onChange={setMonth} years={years} />
          <button
            type="button"
            className="button-outline table-action-btn"
            onClick={onExportExcel}
            title={selectedEmployee ? `Download ${selectedEmployee.name}'s ${monthLabel(month)} Excel data` : `Download all employees' ${monthLabel(month)} Excel data`}
          >
            <FileSpreadsheet size={15} />
            <span>{selectedEmployee ? `Download Excel (${selectedEmployee.name.split(' ')[0]})` : 'Download Excel'}</span>
          </button>
          <button
            type="button"
            className="button-primary table-action-btn"
            onClick={onExportPdf}
            title={selectedEmployee ? `Download ${selectedEmployee.name}'s ${monthLabel(month)} PDF report` : `Download all employees' ${monthLabel(month)} PDF report`}
          >
            <FileText size={15} />
            <span>{selectedEmployee ? `Download PDF (${selectedEmployee.name.split(' ')[0]})` : 'Download PDF'}</span>
          </button>
        </div>
      </div>
      <SimpleTable
        rows={rows}
        empty={selectedEmployee ? `No attendance records for ${selectedEmployee.name} in ${monthLabel(month)}.` : 'No attendance records match the selected filters.'}
      />
      <div className="table-caption">
        {selectedEmployee
          ? `Showing ${rows.length} attendance record${rows.length === 1 ? '' : 's'} for ${selectedEmployee.name} (${selectedEmployee.id}) · ${monthLabel(month)}`
          : `${rows.length} attendance day${rows.length === 1 ? '' : 's'} · ${monthLabel(month)}`}
      </div>
    </section>
  );
}

function SimpleTable({ rows, onEmployee, empty }: { rows: AttendanceDay[]; onEmployee?: (employee: Employee) => void; empty: string }) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>EMPLOYEE</th>
            <th>DATE</th>
            <th>CHECK-IN</th>
            <th>CHECK-OUT</th>
            <th>OFFICE LOCATION</th>
            <th>WORKED</th>
            <th>STATUS</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.uid}-${row.dateKey}-${index}`} className={onEmployee ? 'click-row' : ''} onClick={() => onEmployee?.(row.employee)}>
              <td>
                <div className="employee-cell">
                  <span className="avatar">{initials(row.employee.name)}</span>
                  <span>
                    <b>{row.employee.name}</b>
                    <small>ID {row.employee.id}</small>
                  </span>
                </div>
              </td>
              <td>{formatDate(row.date)}</td>
              <td><span className="time-cell">{row.inTime}</span></td>
              <td>{row.outTime === 'In progress' ? <span className="in-progress">In progress</span> : <span className="time-cell">{row.outTime}</span>}</td>
              <td>{row.office}</td>
              <td>{formatDuration(row.workedMinutes)}</td>
              <td>
                <span className={`status ${row.checkedIn ? 'status-live' : row.present ? 'status-present' : 'status-absent'}`}>
                  <i />{row.checkedIn ? 'Checked IN' : row.present ? 'Present' : 'Absent'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <Empty text={empty} />}
    </div>
  );
}

function Reports({
  employees,
  rows,
  month,
  setMonth,
  years,
  presentByEmployee,
  onPdf,
  onExcel,
  onEmployee,
}: {
  employees: Employee[];
  rows: AttendanceDay[];
  month: string;
  setMonth: (month: string) => void;
  years: number[];
  presentByEmployee: Map<string, number>;
  onPdf: (rows: AttendanceDay[], title: string, filename: string) => void;
  onExcel: (rows: AttendanceDay[], filename: string) => void;
  onEmployee: (employee: Employee) => void;
}) {
  return (
    <>
      <div className="report-cards">
        <div className="report-banner">
          <div className="report-symbol"><FileText size={21} /></div>
          <div>
            <span>CONSOLIDATED MONTHLY REPORT</span>
            <h3>{monthLabel(month)}</h3>
            <p>{rows.length} attendance records · {employees.length} employees in the directory</p>
          </div>
          <div className="report-actions">
            <button className="button-light" onClick={() => onPdf(rows, `Monthly attendance report · ${monthLabel(month)}`, `Bariflo_Attendance_${month}.pdf`)}>
              <FileText size={16} />Download PDF
            </button>
            <button className="button-white-outline" onClick={() => onExcel(rows, `Bariflo_Attendance_${month}.xlsx`)}>
              <FileSpreadsheet size={16} />Download Excel
            </button>
          </div>
        </div>
        <div className="report-stat">
          <span>Attendance days</span>
          <b>{rows.filter((row) => row.present).length}</b>
          <small>employee-days this month</small>
        </div>
        <div className="report-stat">
          <span>Employees present</span>
          <b>{new Set(rows.filter((row) => row.present).map((row) => row.uid)).size}</b>
          <small>with at least one check-in</small>
        </div>
        <div className="report-stat">
          <span>Average present days</span>
          <b>{employees.length ? (rows.filter((row) => row.present).length / employees.length).toFixed(1) : '0'}</b>
          <small>per registered employee</small>
        </div>
      </div>

      <div className="panel directory-panel">
        <div className="panel-head">
          <div>
            <h3>Monthly employee summary</h3>
            <p>Attendance totals for every employee, including employees with no punches</p>
          </div>
          <YearMonthPicker value={month} onChange={setMonth} years={years} compact />
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>EMPLOYEE</th>
                <th>EMPLOYEE ID</th>
                <th>PRESENT DAYS</th>
                <th>ATTENDANCE RECORDS</th>
                <th>TOTAL WORK TIME</th>
                <th>REPORT</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((employee) => {
                const ownRows = rows.filter((row) => row.uid === employee.uid && row.present);
                const minutes = ownRows.reduce((sum, row) => sum + row.workedMinutes, 0);
                return (
                  <tr key={employee.uid}>
                    <td>
                      <div className="employee-cell">
                        <span className="avatar">{initials(employee.name)}</span>
                        <span>
                          <b>{employee.name}</b>
                          <small>{employee.designation || employee.email}</small>
                        </span>
                      </div>
                    </td>
                    <td>{employee.id}</td>
                    <td><span className="days-pill">{presentByEmployee.get(employee.uid) ?? 0} days</span></td>
                    <td>{ownRows.length}</td>
                    <td>{formatDuration(minutes)}</td>
                    <td>
                      <div className="row-actions">
                        <button title="View employee history" onClick={() => onEmployee(employee)}>
                          <Users size={15} />
                        </button>
                        <button title="Download employee Excel report" onClick={() => onExcel(ownRows, `Bariflo_${employee.id}_${month}.xlsx`)}>
                          <FileSpreadsheet size={15} />
                        </button>
                        <button title="Download employee PDF report" onClick={() => onPdf(ownRows, `${employee.name} · ${monthLabel(month)}`, `Bariflo_${employee.id}_${month}.pdf`)}>
                          <FileText size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!employees.length && <Empty text="No employees are registered yet." />}
        </div>
      </div>
    </>
  );
}

function EmployeeModal({
  employee,
  rows,
  month,
  years,
  onClose,
  onPdf,
  onExcel,
}: {
  employee: Employee;
  rows: AttendanceDay[];
  month: string;
  years: number[];
  onClose: () => void;
  onPdf: (rows: AttendanceDay[]) => void;
  onExcel: (rows: AttendanceDay[]) => void;
}) {
  const [selectedMonth, setSelectedMonth] = useState(month);
  const ownRows = rows.filter((row) => monthKey(row.date) === selectedMonth);
  const presentDays = ownRows.filter((row) => row.present).length;

  return (
    <div className="modal-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="employee-modal">
        <div className="modal-head">
          <div className="employee-cell">
            <span className="avatar large-avatar">{initials(employee.name)}</span>
            <span>
              <h2>{employee.name}</h2>
              <small>{employee.designation || 'Employee'} · ID {employee.id}</small>
            </span>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close employee details">
            <X size={19} />
          </button>
        </div>

        <div className="modal-info">
          <div><small>Email</small><b>{employee.email || '—'}</b></div>
          <div><small>Phone</small><b>{employee.phone || '—'}</b></div>
          <div><small>Assigned office</small><b>{employee.officeKey || '—'}</b></div>
          <div><small>Address</small><b>{employee.address || '—'}</b></div>
        </div>

        <div className="modal-summary">
          <div><small>Present days · {monthLabel(selectedMonth)}</small><b>{presentDays}</b></div>
          <div><small>Attendance records</small><b>{ownRows.length}</b></div>
          <div><small>Total work time</small><b>{formatDuration(ownRows.reduce((sum, row) => sum + row.workedMinutes, 0))}</b></div>
        </div>

        <div className="modal-toolbar">
          <h3>Attendance history</h3>
          <YearMonthPicker value={selectedMonth} onChange={setSelectedMonth} years={years} compact />
        </div>

        <SimpleTable rows={ownRows} empty="No attendance records for this month." />

        <div className="modal-footer">
          <button className="button-secondary" onClick={() => onExcel(ownRows)}>
            <FileSpreadsheet size={16} />Export Excel
          </button>
          <button className="button-primary" onClick={() => onPdf(ownRows)}>
            <FileText size={16} />Export PDF
          </button>
        </div>
      </section>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="empty-state">
      <div><Activity size={19} /></div>
      <span>{text}</span>
    </div>
  );
}
