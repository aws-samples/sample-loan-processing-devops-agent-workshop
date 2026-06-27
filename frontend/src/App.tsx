import React, { useState, useEffect } from 'react';

// ============ TYPES ============
interface User { id: string; username: string; role: string; email?: string; }
interface LoanProduct { id: string; name: string; product_type?: string; interest_rate: number; min_amount: number; max_amount: number; max_tenure_months: number; }
interface Application { id: string; product_id: string; amount: number; tenure_months: number; purpose: string; status: string; monthly_income?: number; employment_type?: string; created_at?: string; customer_name?: string; customer_id?: string; credit_score?: number; }
interface DashboardSummary { total_applications: number; pending: number; approved: number; active_loans: number; disbursed_amount: number; overdue: number; }
interface EligibilityResult { is_eligible: boolean; reasons: string[]; score: number; credit_score?: number; }
interface EMIRow { emi_no: number; due_date: string; principal: number; interest: number; total: number; status: string; }
interface CollectionCase { id: string; loan_id?: string; customer_name: string; amount_overdue: number; days_overdue: number; stage: string; }
interface Toast { message: string; type: 'success' | 'error' | 'info'; }

// ============ API HELPER ============
const API_BASE = '/api/v1';
const TOKEN_STORAGE_KEY = 'lf_access_token';
const USER_STORAGE_KEY = 'lf_user';

const tokenStore = {
  get: (): string => {
    try { return sessionStorage.getItem(TOKEN_STORAGE_KEY) || ''; } catch { return ''; }
  },
  set: (token: string) => {
    try { sessionStorage.setItem(TOKEN_STORAGE_KEY, token); } catch { /* ignored */ }
  },
  clear: () => {
    try {
      sessionStorage.removeItem(TOKEN_STORAGE_KEY);
      sessionStorage.removeItem(USER_STORAGE_KEY);
    } catch { /* ignored */ }
  },
};

const userStore = {
  get: (): { id?: string; username: string; role: string } | null => {
    try {
      const raw = sessionStorage.getItem(USER_STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  },
  set: (user: { id?: string; username: string; role: string }) => {
    try { sessionStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user)); } catch { /* ignored */ }
  },
};

async function apiFetch(path: string, options: RequestInit = {}): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  const token = tokenStore.get();
  // Login is the one path where 401 means "wrong credentials", not
  // "session expired" — so we must NOT clear the token store nor mask
  // the server's detail.
  const isLogin = path.startsWith('/auth/login');
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...((options.headers as any) || {}) },
    });
    clearTimeout(timeout);

    // Read the body once. It may be JSON, plain text, empty, or HTML
    // (e.g. an ALB / nginx error page). Never assume application/json.
    const rawBody = await res.text();
    let parsed: any = null;
    if (rawBody) {
      try {
        parsed = JSON.parse(rawBody);
      } catch {
        parsed = null;
      }
    }

    if (res.status === 401 && !isLogin) {
      tokenStore.clear();
      throw new Error('Session expired. Please log in again.');
    }

    if (!res.ok) {
      // FastAPI errors carry a `detail` field; fall back to status text.
      const detail =
        (parsed && typeof parsed === 'object' && (parsed.detail || parsed.message)) ||
        (rawBody && rawBody.trim().slice(0, 200)) ||
        res.statusText ||
        'Request failed';
      throw new Error(`${res.status} ${detail}`);
    }

    return parsed; // null for 204 No Content / empty body
  } catch (err: any) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') throw new Error('Request timed out');
    throw err;
  }
}

const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

// Best-effort fire-and-forget audit emitter. The audit-service rejects
// posts without a valid bearer token, so we silently swallow failures
// during anonymous moments (e.g. the request that races a logout).
async function audit(entity_type: string, entity_id: string, action: string, details: Record<string, unknown> = {}): Promise<void> {
  const session = userStore.get();
  const payload = {
    entity_type,
    entity_id: String(entity_id),
    action,
    actor_id: session?.id || ZERO_UUID,
    actor_name: session?.username || 'unknown',
    service_name: 'frontend',
    details,
  };
  try {
    await apiFetch('/audit/log', { method: 'POST', body: JSON.stringify(payload) });
  } catch { /* silent */ }
}

// ============ STYLES ============
const colors = { primary: '#1e40af', green: '#059669', red: '#dc2626', amber: '#d97706', purple: '#7c3aed', navy: '#0f172a', lightBg: '#f8fafc', cardBg: '#ffffff', border: '#e2e8f0', textPrimary: '#1e293b', textSecondary: '#64748b' };

const styles: Record<string, React.CSSProperties> = {
  app: { display: 'flex', height: '100vh', fontFamily: 'system-ui, -apple-system, sans-serif', background: colors.lightBg, color: colors.textPrimary },
  sidebar: { width: 240, background: colors.navy, display: 'flex', flexDirection: 'column', padding: '20px 0', flexShrink: 0 },
  sidebarTitle: { color: '#fff', fontSize: 18, fontWeight: 700, padding: '0 20px 20px', borderBottom: '1px solid rgba(255,255,255,0.1)', marginBottom: 8 },
  navItem: { display: 'flex', alignItems: 'center', gap: 10, padding: '12px 20px', color: '#94a3b8', cursor: 'pointer', fontSize: 14, transition: 'all 0.2s', borderRadius: '0 8px 8px 0', marginRight: 12 },
  navItemActive: { background: 'rgba(30,64,175,0.3)', color: '#fff', fontWeight: 600 },
  main: { flex: 1, overflow: 'auto', padding: 32 },
  pageTitle: { fontSize: 24, fontWeight: 700, marginBottom: 24, color: colors.textPrimary },
  card: { background: colors.cardBg, borderRadius: 12, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: 16 },
  statCard: { background: colors.cardBg, borderRadius: 12, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.1)', borderLeft: '4px solid', flex: '1 1 180px' },
  statsGrid: { display: 'flex', flexWrap: 'wrap' as const, gap: 16, marginBottom: 24 },
  btn: { padding: '10px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14, transition: 'all 0.2s' },
  btnPrimary: { background: colors.primary, color: '#fff' },
  btnSuccess: { background: colors.green, color: '#fff' },
  btnDanger: { background: colors.red, color: '#fff' },
  btnAmber: { background: colors.amber, color: '#fff' },
  input: { width: '100%', padding: '10px 14px', borderRadius: 8, border: `1px solid ${colors.border}`, fontSize: 14, outline: 'none', boxSizing: 'border-box' as const },
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 14 },
  th: { textAlign: 'left' as const, padding: '12px 16px', background: '#f1f5f9', fontWeight: 600, borderBottom: `2px solid ${colors.border}` },
  td: { padding: '12px 16px', borderBottom: `1px solid ${colors.border}` },
  badge: { padding: '4px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600, display: 'inline-block' },
  toast: { position: 'fixed' as const, top: 20, right: 20, padding: '14px 24px', borderRadius: 10, color: '#fff', fontWeight: 600, zIndex: 9999, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', animation: 'fadeIn 0.3s' },
};

// ============ COMPONENTS ============
const StatCard: React.FC<{ title: string; value: string | number; color: string; icon: string; onClick?: () => void }> = ({ title, value, color, icon, onClick }) => (
  <div
    style={{ ...styles.statCard, borderLeftColor: color, cursor: onClick ? 'pointer' : 'default', transition: 'transform 0.15s' }}
    onClick={onClick}
    onMouseEnter={onClick ? (e) => (e.currentTarget.style.transform = 'translateY(-2px)') : undefined}
    onMouseLeave={onClick ? (e) => (e.currentTarget.style.transform = 'none') : undefined}
    role={onClick ? 'button' : undefined}
    tabIndex={onClick ? 0 : undefined}
    onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
  >
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div>
        <div style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>{title}</div>
        <div style={{ fontSize: 24, fontWeight: 700, color }}>{value}</div>
      </div>
      <div style={{ fontSize: 28 }}>{icon}</div>
    </div>
    {onClick && (
      <div style={{ marginTop: 8, fontSize: 11, color: colors.textSecondary }}>Click to view →</div>
    )}
  </div>
);

const DetailField: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div style={{ background: '#fff', borderRadius: 8, padding: '8px 12px', border: `1px solid ${colors.border}` }}>
    <div style={{ fontSize: 11, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 2 }}>{label}</div>
    <div style={{ fontSize: 13, color: colors.textPrimary, wordBreak: 'break-all', fontFamily: label.toLowerCase().endsWith('id') ? 'ui-monospace, SFMono-Regular, monospace' : 'inherit' }}>{value}</div>
  </div>
);

const KYC_FIELD_ORDER: Array<[string, string]> = [
  ['name', 'Name'],
  ['email', 'Email'],
  ['phone', 'Phone'],
  ['dob', 'DOB'],
  ['ssn_last4', 'SSN'],
  ['address', 'Address'],
];

const KycDetailsCell: React.FC<{ details?: Record<string, unknown> }> = ({ details }) => {
  if (!details || Object.keys(details).length === 0) {
    return <span style={{ color: colors.textSecondary }}>—</span>;
  }
  const knownRows = KYC_FIELD_ORDER
    .map(([key, label]) => [label, details[key]] as const)
    .filter(([, v]) => v !== undefined && v !== null && v !== '');
  const extraRows = Object.entries(details).filter(([k, v]) => !KYC_FIELD_ORDER.some(([kk]) => kk === k) && v !== '' && v !== null && v !== undefined);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 8, rowGap: 2 }}>
      {knownRows.map(([label, value]) => (
        <React.Fragment key={label}>
          <span style={{ color: colors.textSecondary }}>{label}:</span>
          <span style={{ color: colors.textPrimary }}>{String(value)}</span>
        </React.Fragment>
      ))}
      {extraRows.map(([k, v]) => (
        <React.Fragment key={k}>
          <span style={{ color: colors.textSecondary }}>{k}:</span>
          <span style={{ color: colors.textPrimary }}>{String(v)}</span>
        </React.Fragment>
      ))}
    </div>
  );
};

const ToastNotification: React.FC<{ toast: Toast | null; onClose: () => void }> = ({ toast, onClose }) => {
  useEffect(() => { if (toast) { const t = setTimeout(onClose, 3500); return () => clearTimeout(t); } }, [toast, onClose]);
  if (!toast) return null;
  const bg = toast.type === 'success' ? colors.green : toast.type === 'error' ? colors.red : colors.primary;
  return <div style={{ ...styles.toast, background: bg }}>{toast.message}</div>;
};

// ============ PAGES ============

// --- DASHBOARD ---
const DashboardPage: React.FC<{ summary: DashboardSummary; onNavigate: (p: string) => void; onTileClick: (target: string, opts?: { applicationsStatusFilter?: string }) => void }> = ({ summary, onNavigate, onTileClick }) => (
  <div>
    <div style={{ background: 'linear-gradient(135deg, #1e40af 0%, #7c3aed 100%)', borderRadius: 16, padding: '32px 40px', marginBottom: 24, color: '#fff' }}>
      <h2 style={{ margin: 0, fontSize: 22 }}>Welcome to LoanFlow Pro</h2>
      <p style={{ margin: '8px 0 0', opacity: 0.9, fontSize: 14 }}>Manage your entire loan lifecycle from a single dashboard</p>
    </div>
    <div style={styles.statsGrid}>
      <StatCard title="Applications" value={summary.total_applications} color={colors.primary} icon="📋" onClick={() => onTileClick('application', { applicationsStatusFilter: 'ALL' })} />
      <StatCard title="Pending" value={summary.pending} color={colors.amber} icon="⏳" onClick={() => onTileClick('application', { applicationsStatusFilter: 'SUBMITTED' })} />
      <StatCard title="Approved" value={summary.approved} color={colors.green} icon="✅" onClick={() => onTileClick('application', { applicationsStatusFilter: 'APPROVED_ALL' })} />
      <StatCard title="Active Loans" value={summary.active_loans} color={colors.purple} icon="💼" onClick={() => onTileClick('application', { applicationsStatusFilter: 'ACTIVE' })} />
      <StatCard title="Disbursed (₹)" value={summary.disbursed_amount.toLocaleString()} color={colors.primary} icon="💰" onClick={() => onTileClick('application', { applicationsStatusFilter: 'DISBURSED' })} />
      <StatCard title="Overdue" value={summary.overdue} color={colors.red} icon="⚠️" onClick={() => onTileClick('collections')} />
    </div>
    <div style={styles.card}>
      <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>Loan Pipeline</h3>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {['Draft', 'Submitted', 'Under Review', 'Approved', 'Disbursed', 'Active'].map((s, i, arr) => (
          <React.Fragment key={s}>
            <div style={{ padding: '8px 16px', background: i < 3 ? '#eff6ff' : i < 5 ? '#ecfdf5' : '#f5f3ff', borderRadius: 20, fontSize: 13, fontWeight: 600, color: i < 3 ? colors.primary : i < 5 ? colors.green : colors.purple }}>{s}</div>
            {i < arr.length - 1 && <span style={{ color: colors.textSecondary }}>→</span>}
          </React.Fragment>
        ))}
      </div>
    </div>
    <h3 style={{ fontSize: 16, marginBottom: 12 }}>Quick Actions</h3>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
      {[{ icon: '👤', label: 'KYC Verification', page: 'kyc' }, { icon: '📝', label: 'New Application', page: 'application' }, { icon: '✅', label: 'Underwriting', page: 'underwriting' }, { icon: '💰', label: 'Disbursement', page: 'disbursement' }, { icon: '⚠️', label: 'Collections', page: 'collections' }].map(a => (
        <div key={a.page} onClick={() => onNavigate(a.page)} style={{ ...styles.card, cursor: 'pointer', textAlign: 'center', transition: 'transform 0.2s', padding: 20 }} onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-2px)')} onMouseLeave={e => (e.currentTarget.style.transform = 'none')}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>{a.icon}</div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{a.label}</div>
        </div>
      ))}
    </div>
    {/* Architecture Diagram */}
    <div style={{ ...styles.card, marginTop: 24 }}>
      <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>System Architecture</h3>
      <pre style={{ fontFamily: 'monospace', fontSize: 12, lineHeight: 1.6, background: '#0f172a', color: '#e2e8f0', padding: 24, borderRadius: 10, overflow: 'auto' }}>{`
                    ┌──────────────────────────┐
                    │   CloudFront (CDN)       │
                    │   + React Frontend       │
                    └────────────┬─────────────┘
                                 │ /api/*
                                 ▼
                    ┌──────────────────────────┐
                    │   ALB (Load Balancer)    │
                    │   Path-based Routing     │
                    └──┬───┬───┬───┬───┬───┬──┘
                       │   │   │   │   │   │
         ┌─────────────┘   │   │   │   │   └─────────────┐
         ▼                 ▼   ▼   ▼   ▼                 ▼
  ┌────────────┐  ┌─────────────────────────┐   ┌────────────┐
  │    Auth    │  │  Loan │ Under │ Disburse│   │   Audit    │
  │  Service   │  │Service│writing│  ment   │   │  Service   │
  │  (JWT)     │  │       │       │         │   │(Append-only)│
  └────────────┘  └─────────────────────────┘   └────────────┘
         │              │       │       │                │
         │         ┌────┘       │       └────┐           │
         ▼         ▼            ▼            ▼           ▼
  ┌────────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐
  │  Customer  │  │Repayment │  │Collection│  │Notification│
  │  Service   │  │ Service  │  │ Service  │  │  Service   │
  │  (KYC)     │  │  (EMI)   │  │(Overdue) │  │  (Email)   │
  └────────────┘  └──────────┘  └──────────┘  └────────────┘
         │              │             │              │
         └──────────────┴──────┬──────┴──────────────┘
                               ▼
                ┌──────────────────────────────┐
                │    PostgreSQL    │   Redis    │
                │   (9 schemas)   │  (Pub/Sub) │
                └──────────────────────────────┘`}</pre>
    </div>
    {/* Tech Stack */}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 12, marginTop: 16 }}>
      {[
        { title: 'Backend', desc: 'Python 3.11 • FastAPI • SQLAlchemy • Pydantic', icon: '⚙️' },
        { title: 'Frontend', desc: 'React 18 • TypeScript • Vite • Inline CSS', icon: '🎨' },
        { title: 'Database', desc: 'PostgreSQL 15 • 9 schemas • Redis Pub/Sub', icon: '🗄️' },
        { title: 'Infrastructure', desc: 'AWS CDK • ECS Fargate • CloudFront • ALB', icon: '☁️' },
        { title: 'Security', desc: 'JWT Auth • RBAC • AES-256 • Audit Trail', icon: '🔒' },
        { title: 'Architecture', desc: '10 Microservices • Event-driven • REST API', icon: '🏗️' },
      ].map(t => (
        <div key={t.title} style={{ ...styles.card, padding: 16 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <span style={{ fontSize: 24 }}>{t.icon}</span>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{t.title}</div>
              <div style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>{t.desc}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  </div>
);

// --- KYC ---
interface KycActivityEntry { id: string; entity_id: string; action: string; actor_name?: string; details?: Record<string, unknown>; created_at: string; }

const KYCPage: React.FC<{ showToast: (m: string, t: Toast['type']) => void }> = ({ showToast }) => {
  const [form, setForm] = useState({ name: '', email: '', phone: '', dob: '', ssn: '', address: '' });
  const [status, setStatus] = useState<'idle' | 'submitted' | 'verified'>('idle');
  const [activity, setActivity] = useState<KycActivityEntry[]>([]);
  const [activityLoading, setActivityLoading] = useState(true);
  const docs = [{ name: 'ID Proof (Passport/DL)', uploaded: true }, { name: 'Address Proof', uploaded: true }, { name: 'Income Proof', uploaded: true }];

  const loadActivity = async () => {
    setActivityLoading(true);
    try {
      const data = await apiFetch('/audit/logs?entity_type=KYC&limit=25');
      if (Array.isArray(data)) setActivity(data);
    } catch { /* silent */ }
    setActivityLoading(false);
  };

  useEffect(() => {
    loadActivity();
    const id = window.setInterval(loadActivity, 30000);
    return () => window.clearInterval(id);
  }, []);

  const submitKYC = async () => {
    if (!form.name || !form.email || !form.phone) { showToast('Please fill required fields', 'error'); return; }
    setStatus('submitted');
    // SSN is masked to its last 4 digits in the audit trail. Real
    // banking systems should encrypt or tokenise PII end-to-end; the
    // workshop sample uses synthetic data, so masking is sufficient.
    const ssnMasked = form.ssn ? `***-**-${form.ssn.slice(-4)}` : '';
    // Both SUBMIT and VERIFY events carry the same KYC dossier so the
    // audit trail reads consistently.
    const dossier = {
      name: form.name,
      email: form.email,
      phone: form.phone,
      dob: form.dob,
      ssn_last4: ssnMasked,
      address: form.address,
    };
    await audit('KYC', form.email || form.name, 'SUBMIT', dossier);
    setTimeout(async () => {
      setStatus('verified');
      await audit('KYC', form.email || form.name, 'VERIFY', dossier);
      showToast('KYC Verified Successfully!', 'success');
      loadActivity();
    }, 1500);
    loadActivity();
  };

  return (
    <div>
      <h2 style={styles.pageTitle}>👤 KYC Verification</h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <div style={styles.card}>
          <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>Customer Details</h3>
          <div style={{ display: 'grid', gap: 12 }}>
            {[{ key: 'name', label: 'Full Name', type: 'text' }, { key: 'email', label: 'Email', type: 'email' }, { key: 'phone', label: 'Phone', type: 'tel' }, { key: 'dob', label: 'Date of Birth', type: 'date' }, { key: 'ssn', label: 'SSN (Last 4)', type: 'text' }, { key: 'address', label: 'Address', type: 'text' }].map(f => (
              <div key={f.key}>
                <label style={{ fontSize: 12, fontWeight: 600, color: colors.textSecondary, marginBottom: 4, display: 'block' }}>{f.label}</label>
                <input style={styles.input} type={f.type} value={(form as any)[f.key]} onChange={e => setForm({ ...form, [f.key]: e.target.value })} />
              </div>
            ))}
          </div>
        </div>
        <div>
          <div style={styles.card}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>Documents</h3>
            {docs.map(d => (
              <div key={d.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: `1px solid ${colors.border}` }}>
                <span style={{ fontSize: 14 }}>{d.name}</span>
                <span style={{ ...styles.badge, background: '#ecfdf5', color: colors.green }}>Uploaded ✓</span>
              </div>
            ))}
          </div>
          <div style={styles.card}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>Verification Status</h3>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {['Submitted', 'Under Review', 'Verified'].map((s, i) => (
                <React.Fragment key={s}>
                  <div style={{ padding: '6px 14px', borderRadius: 16, fontSize: 12, fontWeight: 600, background: (status === 'verified' || (status === 'submitted' && i < 2)) ? '#ecfdf5' : '#f1f5f9', color: (status === 'verified' || (status === 'submitted' && i < 2)) ? colors.green : colors.textSecondary }}>{s}</div>
                  {i < 2 && <span style={{ color: colors.textSecondary }}>→</span>}
                </React.Fragment>
              ))}
            </div>
          </div>
          <button style={{ ...styles.btn, ...styles.btnPrimary, width: '100%', marginTop: 8 }} onClick={submitKYC} disabled={status === 'verified'}>
            {status === 'verified' ? '✓ KYC Verified' : status === 'submitted' ? 'Processing...' : 'Submit KYC'}
          </button>
        </div>
      </div>

      <div style={{ ...styles.card, marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>Recent KYC Activity ({activity.length})</h3>
          <button style={{ ...styles.btn, ...styles.btnPrimary, padding: '6px 12px', fontSize: 12 }} onClick={loadActivity}>Refresh</button>
        </div>
        {activityLoading ? (
          <p style={{ color: colors.textSecondary, textAlign: 'center', padding: 20 }}>Loading…</p>
        ) : activity.length === 0 ? (
          <p style={{ color: colors.textSecondary, textAlign: 'center', padding: 20 }}>No KYC activity yet. Submit a form above to record one.</p>
        ) : (
          <table style={styles.table}>
            <thead><tr><th style={styles.th}>When</th><th style={styles.th}>Actor</th><th style={styles.th}>Action</th><th style={styles.th}>Reference</th><th style={styles.th}>Details</th></tr></thead>
            <tbody>
              {activity.map(a => (
                <tr key={a.id}>
                  <td style={styles.td}>{new Date(a.created_at).toLocaleString()}</td>
                  <td style={styles.td}>{a.actor_name || '—'}</td>
                  <td style={styles.td}><span style={{ ...styles.badge, background: a.action === 'VERIFY' ? '#ecfdf5' : '#fef3c7', color: a.action === 'VERIFY' ? colors.green : colors.amber }}>{a.action}</span></td>
                  <td style={{ ...styles.td, fontFamily: 'ui-monospace, SFMono-Regular, monospace', fontSize: 12 }}>{a.entity_id}</td>
                  <td style={{ ...styles.td, fontSize: 12 }}>
                    <KycDetailsCell details={a.details} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

// --- LOAN APPLICATION ---
const ApplicationPage: React.FC<{ products: LoanProduct[]; applications: Application[]; initialStatusFilter?: string; showToast: (m: string, t: Toast['type']) => void; refreshApps: () => void }> = ({ products, applications, initialStatusFilter, showToast, refreshApps }) => {
  const [step, setStep] = useState(1);
  const [selectedProduct, setSelectedProduct] = useState<LoanProduct | null>(null);
  const [form, setForm] = useState({ employment_type: 'SALARIED', employer: '', monthly_income: 50000, years: 2, amount: 500000, tenure_months: 24, purpose: 'Personal' });
  const [expandedAppId, setExpandedAppId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>(initialStatusFilter || 'ALL');
  const [decisionByApp, setDecisionByApp] = useState<Record<string, { action: string; reason: string; actor?: string; when?: string } | undefined>>({});

  // When the parent navigates to this page with a fresh status filter
  // (via a Dashboard tile click), apply it.
  useEffect(() => {
    if (initialStatusFilter) setStatusFilter(initialStatusFilter);
  }, [initialStatusFilter]);

  // Whenever a row is expanded, lazy-load the most recent APPROVE or
  // REJECT audit entry for that application so the panel can display
  // the underwriter's stated reason.
  useEffect(() => {
    if (!expandedAppId || decisionByApp[expandedAppId] !== undefined) return;
    let cancelled = false;
    (async () => {
      try {
        const logs: any[] = await apiFetch(`/audit/logs/LoanApplication/${expandedAppId}`);
        if (cancelled || !Array.isArray(logs)) return;
        const decision = logs.find(l => l.action === 'APPROVE' || l.action === 'REJECT');
        if (decision) {
          setDecisionByApp(prev => ({
            ...prev,
            [expandedAppId]: {
              action: decision.action,
              reason: (decision.details && (decision.details.reason as string)) || 'No reason recorded.',
              actor: decision.actor_name,
              when: decision.created_at,
            },
          }));
        } else {
          setDecisionByApp(prev => ({ ...prev, [expandedAppId]: undefined }));
        }
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, [expandedAppId, decisionByApp]);

  const productList: LoanProduct[] = products.length ? products : [];
  const productById = (id?: string) => productList.find(p => p.id === id);

  // Allowed purposes for each loan product. Choosing a product narrows
  // the purpose picker so an operator cannot, for example, select 'Home
  // Purchase' on a Personal Loan.
  const purposesByProduct: Record<string, string[]> = {
    PERSONAL: ['Personal', 'Education', 'Medical', 'Travel', 'Wedding', 'Debt Consolidation'],
    HOME: ['Home Purchase', 'Home Construction', 'Home Renovation', 'Plot Purchase', 'Home Loan Balance Transfer'],
    VEHICLE: ['Vehicle Purchase', 'Used Vehicle Purchase', 'Vehicle Refinance'],
  };
  const allowedPurposes = (selectedProduct?.product_type && purposesByProduct[selectedProduct.product_type]) || ['General'];
  // Reset purpose to a valid option whenever the product changes.
  useEffect(() => {
    if (!allowedPurposes.includes(form.purpose)) {
      setForm(prev => ({ ...prev, purpose: allowedPurposes[0] }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProduct?.id]);

  const calcEMI = () => {
    if (!selectedProduct) return 0;
    const r = selectedProduct.interest_rate / 12 / 100;
    const n = form.tenure_months;
    const p = form.amount;
    return Math.round(p * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1));
  };

  const submit = async () => {
    try {
      const res = await apiFetch('/applications', { method: 'POST', body: JSON.stringify({ product_id: selectedProduct?.id, amount: form.amount, tenure_months: form.tenure_months, purpose: form.purpose, monthly_income: form.monthly_income, employment_type: form.employment_type }) });
      const newId: string = res?.id || '';
      audit('LoanApplication', newId, 'CREATE', { amount: form.amount, tenure_months: form.tenure_months, product_id: selectedProduct?.id });
      showToast('Application submitted successfully!', 'success');
      refreshApps();
      setStep(1); setSelectedProduct(null);
    } catch (err: any) { showToast(err.message || 'Failed to submit', 'error'); }
  };

  const progressPct = (step / 4) * 100;

  return (
    <div>
      <h2 style={styles.pageTitle}>📝 Loan Application</h2>

      {applications.length > 0 && (() => {
        // Filter set up: ALL, plus an aggregate APPROVED bucket that
        // includes anything past underwriting. Backend lifecycle states
        // are exposed as individual options for power users.
        const filterApplies = (s: string): boolean => {
          if (statusFilter === 'ALL') return true;
          const upper = s.toUpperCase();
          if (statusFilter === 'APPROVED_ALL') {
            return ['APPROVED', 'DISBURSED', 'ACTIVE', 'CLOSED'].includes(upper);
          }
          return upper === statusFilter;
        };
        const filtered = applications.filter(a => filterApplies(a.status || ''));
        return (
        <div style={styles.card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
            <h3 style={{ margin: 0, fontSize: 16 }}>My Applications ({filtered.length}{filtered.length !== applications.length ? ` of ${applications.length}` : ''})</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{ fontSize: 12, color: colors.textSecondary }}>Filter</label>
              <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setExpandedAppId(null); }} style={{ ...styles.input, width: 200, padding: '6px 10px' }}>
                <option value="ALL">All statuses</option>
                <option value="SUBMITTED">Submitted</option>
                <option value="UNDER_REVIEW">Under Review</option>
                <option value="APPROVED_ALL">Approved (incl. disbursed)</option>
                <option value="APPROVED">Approved (only)</option>
                <option value="REJECTED">Rejected</option>
                <option value="DISBURSED">Disbursed</option>
                <option value="ACTIVE">Active</option>
                <option value="CLOSED">Closed</option>
              </select>
            </div>
          </div>
          <p style={{ fontSize: 12, color: colors.textSecondary, margin: '0 0 12px' }}>Click a row to see full details (full id, EMI, credit score, employment, decision reason).</p>
          {filtered.length === 0 ? (
            <p style={{ color: colors.textSecondary, textAlign: 'center', padding: 20 }}>No applications match this filter.</p>
          ) : (
          <table style={styles.table}>
            <thead><tr><th style={styles.th}>ID</th><th style={styles.th}>Product</th><th style={styles.th}>Amount</th><th style={styles.th}>Tenure</th><th style={styles.th}>Purpose</th><th style={styles.th}>Status</th><th style={styles.th}>Submitted</th></tr></thead>
            <tbody>
              {filtered.map(app => {
                const prod = productById(app.product_id);
                const upper = app.status?.toUpperCase() || '';
                const positive = ['APPROVED', 'DISBURSED', 'ACTIVE', 'CLOSED'].includes(upper);
                const negative = upper === 'REJECTED';
                const statusColor = positive ? colors.green : negative ? colors.red : colors.amber;
                const statusBg = positive ? '#ecfdf5' : negative ? '#fef2f2' : '#fef3c7';
                const isOpen = expandedAppId === app.id;
                const r = (prod?.interest_rate || 12) / 12 / 100;
                const n = app.tenure_months || 1;
                const estEmi = Math.round(app.amount * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1));
                return (
                  <React.Fragment key={app.id}>
                    <tr style={{ cursor: 'pointer' }} onClick={() => setExpandedAppId(isOpen ? null : app.id)}>
                      <td style={styles.td}>{isOpen ? '▼' : '▶'} {app.id.slice(0, 8)}…</td>
                      <td style={styles.td}>{prod?.name || app.product_id?.slice(0, 8) + '…'}</td>
                      <td style={styles.td}>₹{app.amount?.toLocaleString()}</td>
                      <td style={styles.td}>{app.tenure_months}mo</td>
                      <td style={styles.td}>{app.purpose}</td>
                      <td style={styles.td}><span style={{ ...styles.badge, background: statusBg, color: statusColor }}>{app.status}</span></td>
                      <td style={styles.td}>{app.created_at ? new Date(app.created_at).toLocaleDateString() : '—'}</td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={7} style={{ ...styles.td, background: '#f8fafc', padding: 16 }}>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
                            <DetailField label="Application ID" value={app.id} />
                            <DetailField label="Customer ID" value={app.customer_id || '—'} />
                            <DetailField label="Product" value={prod?.name || '—'} />
                            <DetailField label="Product Type" value={prod?.product_type || '—'} />
                            <DetailField label="Interest Rate" value={prod ? `${prod.interest_rate}% p.a.` : '—'} />
                            <DetailField label="Amount" value={`₹${app.amount?.toLocaleString()}`} />
                            <DetailField label="Tenure" value={`${app.tenure_months} months`} />
                            <DetailField label="Estimated EMI" value={`₹${estEmi.toLocaleString()}`} />
                            <DetailField label="Purpose" value={app.purpose || '—'} />
                            <DetailField label="Employment" value={app.employment_type || '—'} />
                            <DetailField label="Monthly Income" value={app.monthly_income ? `₹${app.monthly_income.toLocaleString()}` : '—'} />
                            <DetailField label="Credit Score" value={app.credit_score ? String(Math.round(app.credit_score)) : '—'} />
                            <DetailField label="Status" value={app.status} />
                            <DetailField label="Submitted" value={app.created_at ? new Date(app.created_at).toLocaleString() : '—'} />
                          </div>
                          {(() => {
                            const dec = decisionByApp[app.id];
                            if (!dec) return null;
                            const decisionPositive = dec.action === 'APPROVE';
                            return (
                              <div style={{ marginTop: 12, padding: 12, borderRadius: 8, background: decisionPositive ? '#ecfdf5' : '#fef2f2', border: `1px solid ${decisionPositive ? '#a7f3d0' : '#fecaca'}` }}>
                                <div style={{ fontSize: 11, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>
                                  {decisionPositive ? 'Approval Reason' : 'Rejection Reason'}
                                </div>
                                <div style={{ fontSize: 13, color: decisionPositive ? colors.green : colors.red, marginBottom: 4, fontWeight: 600 }}>{dec.reason}</div>
                                <div style={{ fontSize: 11, color: colors.textSecondary }}>
                                  by {dec.actor || 'unknown'}{dec.when ? ` on ${new Date(dec.when).toLocaleString()}` : ''}
                                </div>
                              </div>
                            );
                          })()}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
          )}
        </div>
        );
      })()}

      <div style={{ ...styles.card, marginTop: 16 }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>Apply for a New Loan</h3>
        <div style={{ background: colors.border, borderRadius: 8, height: 6, marginBottom: 24 }}>
          <div style={{ background: `linear-gradient(90deg, ${colors.primary}, ${colors.purple})`, height: '100%', borderRadius: 8, width: `${progressPct}%`, transition: 'width 0.3s' }} />
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
          {['Product', 'Employment', 'Loan Details', 'Review'].map((s, i) => (
            <div key={s} style={{ padding: '8px 16px', borderRadius: 20, fontSize: 13, fontWeight: 600, background: step === i + 1 ? colors.primary : '#f1f5f9', color: step === i + 1 ? '#fff' : colors.textSecondary }}>{i + 1}. {s}</div>
          ))}
        </div>

      {step === 1 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
          {productList.map(p => (
            <div key={p.id} onClick={() => { setSelectedProduct(p); setStep(2); }} style={{ ...styles.card, cursor: 'pointer', border: selectedProduct?.id === p.id ? `2px solid ${colors.primary}` : '2px solid transparent', transition: 'all 0.2s' }} onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-3px)')} onMouseLeave={e => (e.currentTarget.style.transform = 'none')}>
              <h4 style={{ margin: '0 0 8px', color: colors.primary }}>{p.name}</h4>
              <div style={{ fontSize: 28, fontWeight: 700, color: colors.textPrimary }}>{p.interest_rate}%</div>
              <div style={{ fontSize: 12, color: colors.textSecondary, marginTop: 4 }}>p.a.</div>
              <div style={{ marginTop: 12, fontSize: 13, color: colors.textSecondary }}>₹{p.min_amount.toLocaleString()} - ₹{p.max_amount.toLocaleString()}</div>
              <div style={{ fontSize: 12, color: colors.textSecondary }}>Up to {p.max_tenure_months} months</div>
            </div>
          ))}
        </div>
      )}

      {step === 2 && (
        <div style={styles.card}>
          <h3 style={{ margin: '0 0 16px' }}>Employment Details</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: colors.textSecondary, display: 'block', marginBottom: 4 }}>Employment Type</label>
              <select style={styles.input} value={form.employment_type} onChange={e => setForm({ ...form, employment_type: e.target.value })}>
                <option value="SALARIED">Salaried</option><option value="SELF_EMPLOYED">Self Employed</option><option value="BUSINESS">Business</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: colors.textSecondary, display: 'block', marginBottom: 4 }}>Employer</label>
              <input style={styles.input} value={form.employer} onChange={e => setForm({ ...form, employer: e.target.value })} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: colors.textSecondary, display: 'block', marginBottom: 4 }}>Monthly Income (₹)</label>
              <input style={styles.input} type="number" value={form.monthly_income} onChange={e => setForm({ ...form, monthly_income: +e.target.value })} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: colors.textSecondary, display: 'block', marginBottom: 4 }}>Years of Experience</label>
              <input style={styles.input} type="number" value={form.years} onChange={e => setForm({ ...form, years: +e.target.value })} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
            <button style={{ ...styles.btn, background: '#f1f5f9', color: colors.textPrimary }} onClick={() => setStep(1)}>← Back</button>
            <button style={{ ...styles.btn, ...styles.btnPrimary }} onClick={() => setStep(3)}>Next →</button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div style={styles.card}>
          <h3 style={{ margin: '0 0 16px' }}>Loan Details</h3>
          <div style={{ display: 'grid', gap: 20 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: colors.textSecondary, display: 'block', marginBottom: 4 }}>Loan Amount: ₹{form.amount.toLocaleString()}</label>
              <input type="range" min={selectedProduct?.min_amount || 50000} max={selectedProduct?.max_amount || 5000000} step={10000} value={form.amount} onChange={e => setForm({ ...form, amount: +e.target.value })} style={{ width: '100%' }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: colors.textSecondary, display: 'block', marginBottom: 4 }}>Tenure: {form.tenure_months} months</label>
              <input type="range" min={6} max={selectedProduct?.max_tenure_months || 60} step={6} value={form.tenure_months} onChange={e => setForm({ ...form, tenure_months: +e.target.value })} style={{ width: '100%' }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: colors.textSecondary, display: 'block', marginBottom: 4 }}>Purpose</label>
              <select style={styles.input} value={form.purpose} onChange={e => setForm({ ...form, purpose: e.target.value })}>
                {allowedPurposes.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
            <button style={{ ...styles.btn, background: '#f1f5f9', color: colors.textPrimary }} onClick={() => setStep(2)}>← Back</button>
            <button style={{ ...styles.btn, ...styles.btnPrimary }} onClick={() => setStep(4)}>Next →</button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div style={styles.card}>
          <h3 style={{ margin: '0 0 16px' }}>Review Application</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
            <div style={{ padding: 16, background: '#f8fafc', borderRadius: 8 }}>
              <div style={{ fontSize: 12, color: colors.textSecondary }}>Product</div>
              <div style={{ fontWeight: 600 }}>{selectedProduct?.name}</div>
            </div>
            <div style={{ padding: 16, background: '#f8fafc', borderRadius: 8 }}>
              <div style={{ fontSize: 12, color: colors.textSecondary }}>Amount</div>
              <div style={{ fontWeight: 600 }}>₹{form.amount.toLocaleString()}</div>
            </div>
            <div style={{ padding: 16, background: '#f8fafc', borderRadius: 8 }}>
              <div style={{ fontSize: 12, color: colors.textSecondary }}>Tenure</div>
              <div style={{ fontWeight: 600 }}>{form.tenure_months} months</div>
            </div>
            <div style={{ padding: 16, background: '#f8fafc', borderRadius: 8 }}>
              <div style={{ fontSize: 12, color: colors.textSecondary }}>Interest Rate</div>
              <div style={{ fontWeight: 600 }}>{selectedProduct?.interest_rate}% p.a.</div>
            </div>
            <div style={{ padding: 16, background: '#f8fafc', borderRadius: 8 }}>
              <div style={{ fontSize: 12, color: colors.textSecondary }}>Monthly Income</div>
              <div style={{ fontWeight: 600 }}>₹{form.monthly_income.toLocaleString()}</div>
            </div>
            <div style={{ padding: 16, background: '#f8fafc', borderRadius: 8 }}>
              <div style={{ fontSize: 12, color: colors.textSecondary }}>Purpose</div>
              <div style={{ fontWeight: 600 }}>{form.purpose}</div>
            </div>
          </div>
          <div style={{ background: 'linear-gradient(135deg, #eff6ff, #f5f3ff)', borderRadius: 12, padding: 20, textAlign: 'center', marginBottom: 20 }}>
            <div style={{ fontSize: 12, color: colors.textSecondary }}>Estimated EMI</div>
            <div style={{ fontSize: 32, fontWeight: 700, color: colors.primary }}>₹{calcEMI().toLocaleString()}</div>
            <div style={{ fontSize: 12, color: colors.textSecondary }}>per month</div>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button style={{ ...styles.btn, background: '#f1f5f9', color: colors.textPrimary }} onClick={() => setStep(3)}>← Back</button>
            <button style={{ ...styles.btn, ...styles.btnSuccess, flex: 1 }} onClick={submit}>Submit Application ✓</button>
          </div>
        </div>
      )}
      </div>
    </div>
  );
};

// --- UNDERWRITING ---
const UnderwritingPage: React.FC<{ applications: Application[]; showToast: (m: string, t: Toast['type']) => void; refreshApps: () => void }> = ({ applications, showToast, refreshApps }) => {
  const [eligibility, setEligibility] = useState<Record<string, EligibilityResult>>({});
  const [decisions, setDecisions] = useState<Record<string, { action: string; reason: string }>>({});
  const [reasonInput, setReasonInput] = useState('');

  const submitted = applications.filter(a => ['SUBMITTED', 'PENDING', 'UNDER_REVIEW'].includes(a.status?.toUpperCase() || ''));
  // 'Approved' counts anything that was approved at some point in its
  // lifecycle (a disbursed application was approved earlier; an active
  // loan was approved before disbursement). The status flag is the
  // current state, but the operator's question is 'how many got past
  // underwriting', which includes everything downstream of APPROVED.
  const approvedCount = applications.filter(a => ['APPROVED', 'DISBURSED', 'ACTIVE', 'CLOSED'].includes(a.status?.toUpperCase() || '')).length;
  const rejectedCount = applications.filter(a => a.status?.toUpperCase() === 'REJECTED').length;

  const runEligibility = async (id: string) => {
    try {
      const result = await apiFetch(`/applications/${id}/eligibility`, { method: 'POST' });
      setEligibility(prev => ({ ...prev, [id]: result }));
      audit('LoanApplication', id, 'ELIGIBILITY_CHECK', { score: result.score, is_eligible: result.is_eligible });
      showToast('Eligibility check completed', 'info');
    } catch (err: any) { showToast(err.message || 'Eligibility check failed', 'error'); }
  };

  const makeDecision = async (id: string, status: string) => {
    try {
      await apiFetch(`/applications/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) });
      setDecisions(prev => ({ ...prev, [id]: { action: status, reason: reasonInput || 'No reason provided' } }));
      audit('LoanApplication', id, status === 'APPROVED' ? 'APPROVE' : 'REJECT', { reason: reasonInput || 'No reason provided' });
      showToast(`Application ${status.toLowerCase()}`, status === 'APPROVED' ? 'success' : 'info');
      refreshApps();
    } catch (err: any) { showToast(err.message || 'Decision failed', 'error'); }
  };

  return (
    <div>
      <h2 style={styles.pageTitle}>✅ Eligibility & Underwriting</h2>
      <div style={styles.statsGrid}>
        <StatCard title="Pending Review" value={submitted.length} color={colors.amber} icon="📋" />
        <StatCard title="Approved" value={approvedCount} color={colors.green} icon="✅" />
        <StatCard title="Rejected" value={rejectedCount} color={colors.red} icon="❌" />
      </div>
      <div style={styles.card}>
        <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>Submitted Applications</h3>
        {submitted.length === 0 ? <p style={{ color: colors.textSecondary, textAlign: 'center', padding: 20 }}>No applications pending review</p> : (
          <table style={styles.table}>
            <thead><tr><th style={styles.th}>ID</th><th style={styles.th}>Amount</th><th style={styles.th}>Tenure</th><th style={styles.th}>Status</th><th style={styles.th}>Actions</th></tr></thead>
            <tbody>
              {submitted.map(app => (
                <tr key={app.id}>
                  <td style={styles.td}>{app.id.slice(0, 8)}...</td>
                  <td style={styles.td}>₹{app.amount?.toLocaleString()}</td>
                  <td style={styles.td}>{app.tenure_months}mo</td>
                  <td style={styles.td}><span style={{ ...styles.badge, background: '#fef3c7', color: colors.amber }}>{app.status}</span></td>
                  <td style={styles.td}>
                    <button style={{ ...styles.btn, ...styles.btnPrimary, padding: '6px 12px', fontSize: 12 }} onClick={() => runEligibility(app.id)}>Run Eligibility</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {Object.entries(eligibility).map(([id, result]) => (
        <div key={id} style={{ ...styles.card, borderLeft: `4px solid ${result.is_eligible ? colors.green : colors.red}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h4 style={{ margin: 0 }}>Eligibility: {id.slice(0, 8)}...</h4>
            <span style={{ ...styles.badge, background: result.is_eligible ? '#ecfdf5' : '#fef2f2', color: result.is_eligible ? colors.green : colors.red }}>{result.is_eligible ? 'ELIGIBLE' : 'NOT ELIGIBLE'}</span>
          </div>
          <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
            <div style={{ padding: 12, background: '#f8fafc', borderRadius: 8, flex: 1 }}>
              <div style={{ fontSize: 12, color: colors.textSecondary }}>Credit Score</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: (result.credit_score || 0) >= 700 ? colors.green : (result.credit_score || 0) >= 600 ? colors.amber : colors.red }}>{result.credit_score ? Math.round(result.credit_score) : '—'}</div>
            </div>
            <div style={{ padding: 12, background: '#f8fafc', borderRadius: 8, flex: 1 }}>
              <div style={{ fontSize: 12, color: colors.textSecondary }}>Eligibility Score</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: result.score >= 80 ? colors.green : result.score >= 50 ? colors.amber : colors.red }}>{Math.round(result.score)}/100</div>
            </div>
            <div style={{ flex: 2 }}>
              <div style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 4 }}>Reasons</div>
              {result.reasons?.map((r, i) => <div key={i} style={{ fontSize: 13, padding: '2px 0' }}>• {r}</div>)}
            </div>
          </div>
          {!decisions[id] && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input style={{ ...styles.input, flex: 1 }} placeholder="Decision reason..." value={reasonInput} onChange={e => setReasonInput(e.target.value)} />
              <button style={{ ...styles.btn, ...styles.btnSuccess, padding: '10px 16px' }} onClick={() => makeDecision(id, 'APPROVED')}>Approve</button>
              <button style={{ ...styles.btn, ...styles.btnDanger, padding: '10px 16px' }} onClick={() => makeDecision(id, 'REJECTED')}>Reject</button>
            </div>
          )}
          {decisions[id] && <div style={{ ...styles.badge, background: decisions[id].action === 'APPROVED' ? '#ecfdf5' : '#fef2f2', color: decisions[id].action === 'APPROVED' ? colors.green : colors.red }}>Decision: {decisions[id].action} — {decisions[id].reason}</div>}
        </div>
      ))}
    </div>
  );
};

// --- DISBURSEMENT & EMI ---
interface ActiveLoan { id: string; application_id: string; product_type: string; principal_amount: number; interest_rate: number; tenure_months: number; emi_amount: number; outstanding_principal: number; total_interest: number; total_amount: number; status: string; disbursement_date: string; next_emi_date?: string; }

const DisbursementPage: React.FC<{ applications: Application[]; products: LoanProduct[]; showToast: (m: string, t: Toast['type']) => void; refreshApps: () => void }> = ({ applications, products, showToast, refreshApps }) => {
  const [emiSchedules, setEmiSchedules] = useState<Record<string, EMIRow[]>>({});
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null);
  const [payments, setPayments] = useState<{ id: string; emi_no: number; date: string }[]>([]);
  const [activeLoans, setActiveLoans] = useState<ActiveLoan[]>([]);
  const approved = applications.filter(a => a.status?.toUpperCase() === 'APPROVED');
  const disbursed = applications.filter(a => ['DISBURSED', 'ACTIVE'].includes(a.status?.toUpperCase() || ''));

  const refreshActiveLoans = async () => {
    try {
      const data = await apiFetch('/loans');
      if (Array.isArray(data)) setActiveLoans(data);
    } catch { /* silent */ }
  };

  useEffect(() => { refreshActiveLoans(); }, []);

  const loadSchedule = async (appId: string) => {
    try {
      // The disbursement-service returns schedule items keyed by loan_id, not app_id.
      // First resolve the loan for this application, then pull its schedule.
      const loans: any[] = await apiFetch('/loans');
      const loan = Array.isArray(loans) ? loans.find(l => l.application_id === appId) : null;
      if (!loan) {
        showToast('No loan record yet for this application — try disbursing again', 'info');
        return;
      }
      const items: any[] = await apiFetch(`/loans/${loan.id}/schedule`);
      if (!Array.isArray(items) || items.length === 0) {
        showToast('EMI schedule is empty', 'info');
        return;
      }
      const schedule: EMIRow[] = items.map(item => ({
        emi_no: item.installment_number,
        due_date: new Date(item.due_date).toLocaleDateString(),
        principal: Math.round(item.principal_component || 0),
        interest: Math.round(item.interest_component || 0),
        total: Math.round(item.emi_amount || 0),
        status: item.status || 'DUE',
      }));
      setEmiSchedules(prev => ({ ...prev, [appId]: schedule }));
      setSelectedScheduleId(appId);
    } catch (err: any) {
      showToast(err.message || 'Failed to load schedule', 'error');
    }
  };

  const processDisbursement = async (id: string) => {
    const app = applications.find(a => a.id === id);
    if (!app) { showToast('Application not found', 'error'); return; }
    const product = products.find(p => p.id === app.product_id);
    if (!product) { showToast('Loan product not found for this application', 'error'); return; }
    try {
      // Step 1: create the disbursement record + loan + EMI schedule in
      // disbursement-service. This is the call that actually moves money
      // and populates the dashboard counters.
      await apiFetch(`/disbursements/${id}`, {
        method: 'POST',
        body: JSON.stringify({
          application_id: id,
          customer_id: app.customer_id || app.id, // backend ignores if absent in JWT-based auth
          amount: app.amount,
          interest_rate: product.interest_rate,
          tenure_months: app.tenure_months,
          product_type: product.product_type || 'PERSONAL',
        }),
      });
      // Step 2: flip the loan-service application status so other tabs and
      // the dashboard pipeline see the new state.
      await apiFetch(`/applications/${id}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'DISBURSED' }),
      });
      audit('LoanApplication', id, 'DISBURSE', { amount: app.amount, product_type: product.product_type });
      showToast('Loan disbursed successfully!', 'success');
      refreshApps();
      await refreshActiveLoans();
      await loadSchedule(id);
    } catch (err: any) { showToast(err.message || 'Disbursement failed', 'error'); }
  };

  // For applications already in DISBURSED state when the page loads, pull
  // the real EMI schedule on demand instead of generating a fake one.
  const viewSchedule = (id: string) => {
    // Toggle off if clicking the same row, otherwise switch to that loan.
    if (selectedScheduleId === id) {
      setSelectedScheduleId(null);
      return;
    }
    if (emiSchedules[id]) {
      setSelectedScheduleId(id);
      return;
    }
    loadSchedule(id);
  };

  const makePayment = async (id: string, emiNo: number) => {
    const schedule = emiSchedules[id] || [];
    const row = schedule.find(e => e.emi_no === emiNo);
    if (!row) return;
    try {
      // The repayment-service is keyed by loan_id, not application_id, so
      // resolve the loan first. Best-effort: if the call fails (e.g. no
      // real loan record exists), still update the local UI so the
      // workshop demo flows.
      const loans: any[] = await apiFetch('/loans');
      const loan = Array.isArray(loans) ? loans.find(l => l.application_id === id) : null;
      if (loan) {
        await apiFetch(`/repayments/${loan.id}/pay`, {
          method: 'POST',
          body: JSON.stringify({ amount: row.total, payment_method: 'BANK_TRANSFER', installment_number: emiNo }),
        }).catch(() => undefined);
      }
    } catch { /* ignored */ }
    setEmiSchedules(prev => ({ ...prev, [id]: prev[id].map(e => e.emi_no === emiNo ? { ...e, status: 'PAID' } : e) }));
    setPayments(prev => [...prev, { id, emi_no: emiNo, date: new Date().toLocaleString() }]);
    audit('LoanApplication', id, 'EMI_PAID', { emi_number: emiNo, amount: row.total });
    showToast(`EMI #${emiNo} paid successfully`, 'success');
    refreshApps();
    refreshActiveLoans();
  };

  return (
    <div>
      <h2 style={styles.pageTitle}>💰 Disbursement & EMI</h2>
      <div style={styles.statsGrid}>
        <StatCard title="Ready for Disbursement" value={approved.length} color={colors.amber} icon="📋" />
        <StatCard title="Disbursed" value={disbursed.length} color={colors.green} icon="✅" />
        <StatCard title="Payments Made" value={payments.length} color={colors.primary} icon="💳" />
      </div>
      {approved.length > 0 && (
        <div style={styles.card}>
          <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>Approved — Ready for Disbursement</h3>
          <table style={styles.table}>
            <thead><tr><th style={styles.th}>ID</th><th style={styles.th}>Amount</th><th style={styles.th}>Tenure</th><th style={styles.th}>Action</th></tr></thead>
            <tbody>
              {approved.map(app => (
                <tr key={app.id}>
                  <td style={styles.td}>{app.id.slice(0, 8)}...</td>
                  <td style={styles.td}>₹{app.amount?.toLocaleString()}</td>
                  <td style={styles.td}>{app.tenure_months}mo</td>
                  <td style={styles.td}><button style={{ ...styles.btn, ...styles.btnSuccess, padding: '6px 12px', fontSize: 12 }} onClick={() => processDisbursement(app.id)}>Process Disbursement</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {activeLoans.length > 0 && (
        <div style={styles.card}>
          <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>Active Loans ({activeLoans.length})</h3>
          <table style={styles.table}>
            <thead><tr><th style={styles.th}>Loan ID</th><th style={styles.th}>Product</th><th style={styles.th}>Principal</th><th style={styles.th}>Outstanding</th><th style={styles.th}>EMI</th><th style={styles.th}>Tenure</th><th style={styles.th}>Next EMI</th><th style={styles.th}>Status</th><th style={styles.th}>Action</th></tr></thead>
            <tbody>
              {activeLoans.map(l => (
                <tr key={l.id}>
                  <td style={styles.td}>{l.id.slice(0, 8)}…</td>
                  <td style={styles.td}>{l.product_type}</td>
                  <td style={styles.td}>₹{l.principal_amount.toLocaleString()}</td>
                  <td style={styles.td}>₹{l.outstanding_principal.toLocaleString()}</td>
                  <td style={styles.td}>₹{Math.round(l.emi_amount).toLocaleString()}</td>
                  <td style={styles.td}>{l.tenure_months}mo</td>
                  <td style={styles.td}>{l.next_emi_date ? new Date(l.next_emi_date).toLocaleDateString() : '—'}</td>
                  <td style={styles.td}><span style={{ ...styles.badge, background: '#ecfdf5', color: colors.green }}>{l.status}</span></td>
                  <td style={styles.td}><button style={{ ...styles.btn, ...styles.btnPrimary, padding: '6px 12px', fontSize: 12 }} onClick={() => viewSchedule(l.application_id)}>View EMI Schedule</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {disbursed.length > 0 && (
        <div style={styles.card}>
          <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>Disbursed Applications</h3>
          <table style={styles.table}>
            <thead><tr><th style={styles.th}>ID</th><th style={styles.th}>Amount</th><th style={styles.th}>Tenure</th><th style={styles.th}>Status</th><th style={styles.th}>Action</th></tr></thead>
            <tbody>
              {disbursed.map(app => (
                <tr key={app.id}>
                  <td style={styles.td}>{app.id.slice(0, 8)}...</td>
                  <td style={styles.td}>₹{app.amount?.toLocaleString()}</td>
                  <td style={styles.td}>{app.tenure_months}mo</td>
                  <td style={styles.td}><span style={{ ...styles.badge, background: '#ecfdf5', color: colors.green }}>{app.status}</span></td>
                  <td style={styles.td}><button style={{ ...styles.btn, ...styles.btnPrimary, padding: '6px 12px', fontSize: 12 }} onClick={() => viewSchedule(app.id)}>View EMI Schedule</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {selectedScheduleId && emiSchedules[selectedScheduleId] && (() => {
        const id = selectedScheduleId;
        const schedule = emiSchedules[id];
        const app = applications.find(a => a.id === id);
        const loan = activeLoans.find(l => l.application_id === id);
        const prod = products.find(p => p.id === app?.product_id);
        const totalRows = schedule.length;
        const paidRows = schedule.filter(e => e.status === 'PAID').length;
        return (
          <div style={styles.card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>EMI Schedule</h3>
              <button style={{ ...styles.btn, background: '#f1f5f9', color: colors.textPrimary, padding: '6px 12px', fontSize: 12 }} onClick={() => setSelectedScheduleId(null)}>Close</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8, marginBottom: 16 }}>
              <DetailField label="Application ID" value={id} />
              <DetailField label="Loan ID" value={loan?.id || '—'} />
              <DetailField label="Product" value={prod?.name || loan?.product_type || '—'} />
              <DetailField label="Principal" value={`₹${(loan?.principal_amount ?? app?.amount ?? 0).toLocaleString()}`} />
              <DetailField label="EMI" value={loan ? `₹${Math.round(loan.emi_amount).toLocaleString()}` : '—'} />
              <DetailField label="Outstanding" value={loan ? `₹${loan.outstanding_principal.toLocaleString()}` : '—'} />
              <DetailField label="Tenure" value={`${loan?.tenure_months ?? app?.tenure_months ?? '—'} months`} />
              <DetailField label="Paid / Total" value={`${paidRows} / ${totalRows}`} />
            </div>
            <table style={styles.table}>
              <thead><tr><th style={styles.th}>EMI #</th><th style={styles.th}>Due Date</th><th style={styles.th}>Principal</th><th style={styles.th}>Interest</th><th style={styles.th}>Total</th><th style={styles.th}>Status</th><th style={styles.th}>Action</th></tr></thead>
              <tbody>
                {schedule.map(e => (
                  <tr key={e.emi_no}>
                    <td style={styles.td}>{e.emi_no}</td><td style={styles.td}>{e.due_date}</td>
                    <td style={styles.td}>₹{e.principal.toLocaleString()}</td><td style={styles.td}>₹{e.interest.toLocaleString()}</td><td style={styles.td}>₹{e.total.toLocaleString()}</td>
                    <td style={styles.td}><span style={{ ...styles.badge, background: e.status === 'PAID' ? '#ecfdf5' : '#fef3c7', color: e.status === 'PAID' ? colors.green : colors.amber }}>{e.status}</span></td>
                    <td style={styles.td}>{e.status !== 'PAID' && <button style={{ ...styles.btn, ...styles.btnPrimary, padding: '4px 10px', fontSize: 11 }} onClick={() => makePayment(id, e.emi_no)}>Pay</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })()}
      {payments.length > 0 && (
        <div style={styles.card}>
          <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>Payment History</h3>
          {payments.map((p, i) => (
            <div key={i} style={{ padding: '8px 0', borderBottom: `1px solid ${colors.border}`, fontSize: 13 }}>
              💳 EMI #{p.emi_no} for loan {p.id.slice(0, 8)}... — Paid on {p.date}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// --- COLLECTIONS ---
const STAGE_LABELS: Record<string, string> = {
  REMINDER: 'Reminder',
  OVERDUE_NOTICE: 'Overdue Notice',
  LEGAL_NOTICE: 'Legal Notice',
  RESOLVED: 'Resolved',
};

const stageLabel = (raw?: string): string => {
  if (!raw) return 'Reminder';
  const key = raw.toUpperCase().replace(/\s+/g, '_');
  return STAGE_LABELS[key] || raw;
};

const CollectionsPage: React.FC<{ showToast: (m: string, t: Toast['type']) => void }> = ({ showToast }) => {
  const [cases, setCases] = useState<CollectionCase[]>([]);
  const [actionLog, setActionLog] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const loadCases = async () => {
    try {
      const data = await apiFetch('/collections');
      if (Array.isArray(data)) {
        // Backend returns CollectionsCaseResponse fields; map to the local
        // CollectionCase shape used by the table.
        const mapped: CollectionCase[] = data.map((c: any) => ({
          id: c.id,
          loan_id: c.loan_id,
          customer_name: c.customer_name || c.customer_id?.toString().slice(0, 8) || 'Customer',
          amount_overdue: Number(c.total_overdue_amount ?? c.amount_overdue ?? 0),
          days_overdue: Number(c.days_overdue ?? 0),
          stage: stageLabel(c.stage),
        }));
        setCases(mapped);
      }
    } catch { /* leave list empty */ }
    setLoading(false);
  };

  useEffect(() => { loadCases(); }, []);

  const escalate = async (id: string) => {
    const before = cases.find(c => c.id === id);
    if (!before) return;
    const targetLoanId = before.loan_id || id;
    try {
      await apiFetch(`/collections/${targetLoanId}/escalate`, { method: 'POST', body: JSON.stringify({}) });
      audit('CollectionsCase', id, 'ESCALATE', { from_stage: before.stage, loan_id: targetLoanId });
      setActionLog(prev => [`[${new Date().toLocaleTimeString()}] Escalated case ${id.slice(0, 8)}... from ${before.stage}`, ...prev]);
      showToast(`Escalated case ${id.slice(0, 8)}...`, 'info');
      await loadCases();
    } catch (err: any) {
      showToast(err.message || 'Escalation failed', 'error');
    }
  };

  const seedDemoCase = async () => {
    try {
      const created = await apiFetch('/collections/seed-demo-case', { method: 'POST', body: JSON.stringify({}) });
      const id = created?.id || '';
      audit('CollectionsCase', id, 'CREATE', { source: 'demo-seed' });
      setActionLog(prev => [`[${new Date().toLocaleTimeString()}] Created demo collections case ${String(id).slice(0, 8)}...`, ...prev]);
      showToast('Demo collections case created', 'success');
      await loadCases();
    } catch (err: any) {
      showToast(err.message || 'Failed to create demo case', 'error');
    }
  };

  const reminder = cases.filter(c => c.stage === 'Reminder').length;
  const overdue = cases.filter(c => c.stage === 'Overdue Notice').length;
  const legal = cases.filter(c => c.stage === 'Legal Notice').length;

  return (
    <div>
      <h2 style={styles.pageTitle}>⚠️ Collections</h2>
      <div style={styles.statsGrid}>
        <StatCard title="Reminder Stage" value={reminder} color={colors.amber} icon="📧" />
        <StatCard title="Overdue Notice" value={overdue} color={colors.red} icon="📋" />
        <StatCard title="Legal Notice" value={legal} color={colors.purple} icon="⚖️" />
      </div>
      <div style={{ marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
        <button style={{ ...styles.btn, ...styles.btnAmber }} onClick={seedDemoCase}>+ Simulate Overdue</button>
        <span style={{ fontSize: 12, color: colors.textSecondary }}>Creates a synthetic case for demo purposes (12 days overdue, ₹42,500).</span>
      </div>
      <div style={styles.card}>
        <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>Overdue Accounts</h3>
        {loading ? (
          <p style={{ color: colors.textSecondary, textAlign: 'center', padding: 20 }}>Loading collections cases…</p>
        ) : cases.length === 0 ? (
          <p style={{ color: colors.textSecondary, textAlign: 'center', padding: 20 }}>
            No collections cases yet. Cases appear automatically when EMIs go overdue.
          </p>
        ) : (
          <table style={styles.table}>
            <thead><tr><th style={styles.th}>Customer</th><th style={styles.th}>Amount Overdue</th><th style={styles.th}>Days Overdue</th><th style={styles.th}>Stage</th><th style={styles.th}>Action</th></tr></thead>
            <tbody>
              {cases.map(c => (
                <tr key={c.id}>
                  <td style={styles.td}>{c.customer_name}</td>
                  <td style={styles.td}>₹{c.amount_overdue.toLocaleString()}</td>
                  <td style={{ ...styles.td, color: c.days_overdue > 60 ? colors.red : c.days_overdue > 30 ? colors.amber : colors.textPrimary, fontWeight: 600 }}>{c.days_overdue}</td>
                  <td style={styles.td}><span style={{ ...styles.badge, background: c.stage === 'Reminder' ? '#fef3c7' : c.stage === 'Overdue Notice' ? '#fef2f2' : '#f5f3ff', color: c.stage === 'Reminder' ? colors.amber : c.stage === 'Overdue Notice' ? colors.red : colors.purple }}>{c.stage}</span></td>
                  <td style={styles.td}>{c.stage !== 'Legal Notice' && c.stage !== 'Resolved' && <button style={{ ...styles.btn, ...styles.btnDanger, padding: '4px 10px', fontSize: 11 }} onClick={() => escalate(c.id)}>Escalate ↑</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {actionLog.length > 0 && (
        <div style={styles.card}>
          <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>Action Log</h3>
          {actionLog.map((log, i) => <div key={i} style={{ padding: '6px 0', borderBottom: `1px solid ${colors.border}`, fontSize: 13, color: colors.textSecondary }}>{log}</div>)}
        </div>
      )}
    </div>
  );
};

// --- ADMIN ---
interface AuditEntry { id: string; entity_type: string; entity_id: string; action: string; actor_name?: string; service_name?: string; details?: Record<string, unknown>; created_at: string; }
interface KycSubmission { id: string; customer_id: string; status: string; submitted_at?: string; reviewed_at?: string }

const AdminPage: React.FC<{ users: User[]; products: LoanProduct[] }> = ({ users, products }) => {
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(true);
  const [kycSubmissions, setKycSubmissions] = useState<KycSubmission[]>([]);
  const [kycLoading, setKycLoading] = useState(true);
  const [kycActivity, setKycActivity] = useState<KycActivityEntry[]>([]);

  const loadAudit = async () => {
    setAuditLoading(true);
    try {
      const data = await apiFetch('/audit/logs?limit=50');
      if (Array.isArray(data)) setAuditLogs(data);
    } catch { /* silent */ }
    setAuditLoading(false);
  };

  const loadKyc = async () => {
    setKycLoading(true);
    try {
      const data = await apiFetch('/kyc/pending');
      if (Array.isArray(data)) setKycSubmissions(data);
    } catch { /* silent */ }
    try {
      const activity = await apiFetch('/audit/logs?entity_type=KYC&limit=25');
      if (Array.isArray(activity)) setKycActivity(activity);
    } catch { /* silent */ }
    setKycLoading(false);
  };

  useEffect(() => {
    loadAudit();
    loadKyc();
    const id = window.setInterval(() => { loadAudit(); loadKyc(); }, 30000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div>
      <h2 style={styles.pageTitle}>👥 Admin Panel</h2>
      <div style={styles.card}>
        <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>Users ({users.length})</h3>
        {users.length === 0 ? <p style={{ color: colors.textSecondary }}>No users loaded</p> : (
          <table style={styles.table}>
            <thead><tr><th style={styles.th}>Username</th><th style={styles.th}>Role</th><th style={styles.th}>Email</th></tr></thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}><td style={styles.td}>{u.username}</td><td style={styles.td}><span style={{ ...styles.badge, background: '#eff6ff', color: colors.primary }}>{u.role}</span></td><td style={styles.td}>{u.email || '—'}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div style={styles.card}>
        <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>Loan Products ({products.length})</h3>
        {products.length === 0 ? <p style={{ color: colors.textSecondary }}>No products loaded</p> : (
          <table style={styles.table}>
            <thead><tr><th style={styles.th}>Name</th><th style={styles.th}>Interest Rate</th><th style={styles.th}>Amount Range</th><th style={styles.th}>Max Tenure</th></tr></thead>
            <tbody>
              {products.map(p => (
                <tr key={p.id}><td style={styles.td}>{p.name}</td><td style={styles.td}>{p.interest_rate}%</td><td style={styles.td}>₹{p.min_amount?.toLocaleString()} - ₹{p.max_amount?.toLocaleString()}</td><td style={styles.td}>{p.max_tenure_months}mo</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={styles.card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>Pending KYC Submissions ({kycSubmissions.length})</h3>
          <button style={{ ...styles.btn, ...styles.btnPrimary, padding: '6px 12px', fontSize: 12 }} onClick={loadKyc}>Refresh</button>
        </div>
        {kycLoading ? (
          <p style={{ color: colors.textSecondary, textAlign: 'center', padding: 20 }}>Loading…</p>
        ) : kycSubmissions.length === 0 ? (
          <p style={{ color: colors.textSecondary, textAlign: 'center', padding: 20 }}>No pending KYC submissions in customer-service.</p>
        ) : (
          <table style={styles.table}>
            <thead><tr><th style={styles.th}>Submission ID</th><th style={styles.th}>Customer</th><th style={styles.th}>Status</th><th style={styles.th}>Submitted</th></tr></thead>
            <tbody>
              {kycSubmissions.map(k => (
                <tr key={k.id}>
                  <td style={styles.td}>{k.id?.slice(0, 8)}…</td>
                  <td style={styles.td}>{k.customer_id?.slice(0, 8)}…</td>
                  <td style={styles.td}><span style={{ ...styles.badge, background: '#fef3c7', color: colors.amber }}>{k.status}</span></td>
                  <td style={styles.td}>{k.submitted_at ? new Date(k.submitted_at).toLocaleString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={styles.card}>
        <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>Recent KYC Activity ({kycActivity.length})</h3>
        {kycActivity.length === 0 ? (
          <p style={{ color: colors.textSecondary, textAlign: 'center', padding: 20 }}>No KYC activity recorded. Submit one from the KYC tab to populate.</p>
        ) : (
          <table style={styles.table}>
            <thead><tr><th style={styles.th}>When</th><th style={styles.th}>Actor</th><th style={styles.th}>Action</th><th style={styles.th}>Reference</th><th style={styles.th}>Details</th></tr></thead>
            <tbody>
              {kycActivity.map(a => (
                <tr key={a.id}>
                  <td style={styles.td}>{new Date(a.created_at).toLocaleString()}</td>
                  <td style={styles.td}>{a.actor_name || '—'}</td>
                  <td style={styles.td}><span style={{ ...styles.badge, background: a.action === 'VERIFY' ? '#ecfdf5' : '#fef3c7', color: a.action === 'VERIFY' ? colors.green : colors.amber }}>{a.action}</span></td>
                  <td style={{ ...styles.td, fontFamily: 'ui-monospace, SFMono-Regular, monospace', fontSize: 12 }}>{a.entity_id}</td>
                  <td style={{ ...styles.td, fontSize: 12 }}>
                    <KycDetailsCell details={a.details} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={styles.card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>Audit Log</h3>
          <button style={{ ...styles.btn, ...styles.btnPrimary, padding: '6px 12px', fontSize: 12 }} onClick={loadAudit}>Refresh</button>
        </div>
        {auditLoading ? (
          <p style={{ color: colors.textSecondary, textAlign: 'center', padding: 20 }}>Loading…</p>
        ) : auditLogs.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: colors.textSecondary }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📜</div>
            <p>No audit entries yet. Activity is captured automatically as you use the app.</p>
          </div>
        ) : (
          <table style={styles.table}>
            <thead><tr><th style={styles.th}>When</th><th style={styles.th}>Actor</th><th style={styles.th}>Action</th><th style={styles.th}>Entity</th><th style={styles.th}>Details</th></tr></thead>
            <tbody>
              {auditLogs.map(e => (
                <tr key={e.id}>
                  <td style={styles.td}>{new Date(e.created_at).toLocaleString()}</td>
                  <td style={styles.td}>{e.actor_name || '—'}</td>
                  <td style={styles.td}><span style={{ ...styles.badge, background: '#eff6ff', color: colors.primary }}>{e.action}</span></td>
                  <td style={styles.td}>{e.entity_type} {e.entity_id?.slice(0, 8)}…</td>
                  <td style={{ ...styles.td, fontSize: 12, color: colors.textSecondary }}>{e.details && Object.keys(e.details).length > 0 ? JSON.stringify(e.details) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

// ============ ERROR BOUNDARY ============
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <h2>Something went wrong</h2>
        <p>Please refresh the page</p>
        <button onClick={() => window.location.reload()} style={{ ...styles.btn, ...styles.btnPrimary }}>Reload</button>
      </div>
    );
    return this.props.children;
  }
}

// ============ LOGIN PAGE ============
const LoginPage: React.FC<{ onSuccess: (user: { id?: string; username: string; role: string }) => void }> = ({ onSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('Username and password are required.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const token: string = res.access_token || res.token || '';
      if (!token) throw new Error('No token returned');
      tokenStore.set(token);

      const userObj = res.user || {};
      const role = typeof userObj.role === 'object' ? userObj.role?.name : (userObj.role || 'CUSTOMER');
      const session = { id: userObj.id, username: userObj.username || username.trim(), role: String(role) };
      userStore.set(session);
      onSuccess(session);
    } catch (err: any) {
      const raw: string = err?.message || '';
      // apiFetch prefixes errors with the HTTP status (e.g. "401 Invalid
      // credentials"). Strip the status when we recognise a known login
      // failure so the user sees just the actionable detail.
      const cleaned = raw.replace(/^4\d\d\s+/, '');
      let friendly: string;
      if (raw.startsWith('401')) {
        friendly = cleaned || 'Invalid username or password.';
      } else if (raw.startsWith('429')) {
        friendly = cleaned || 'Too many attempts. Please wait a minute and try again.';
      } else if (raw) {
        friendly = cleaned;
      } else {
        friendly = 'Login failed. Please try again.';
      }
      setError(friendly);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'linear-gradient(135deg, #1e40af 0%, #0f172a 100%)', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <form onSubmit={handleSubmit} style={{ background: '#fff', borderRadius: 16, padding: 32, width: 360, boxShadow: '0 10px 40px rgba(0,0,0,0.25)' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 40 }}>🏦</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: '8px 0 4px', color: colors.navy }}>LoanFlow Pro</h1>
          <div style={{ fontSize: 13, color: colors.textSecondary }}>Sign in to continue</div>
        </div>

        <label htmlFor="login-user" style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: colors.textPrimary }}>
          Username
        </label>
        <input
          id="login-user"
          type="text"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          style={{ ...styles.input, marginBottom: 12 }}
          required
        />

        <label htmlFor="login-pass" style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: colors.textPrimary }}>
          Password
        </label>
        <div style={{ position: 'relative', marginBottom: 16 }}>
          <input
            id="login-pass"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ ...styles.input, paddingRight: 44 }}
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword(v => !v)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            title={showPassword ? 'Hide password' : 'Show password'}
            style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 6, fontSize: 16, lineHeight: 1, color: colors.textSecondary }}
          >
            {showPassword ? '🙈' : '👁️'}
          </button>
        </div>

        {error && (
          <div role="alert" style={{ padding: '10px 12px', borderRadius: 8, background: '#fef2f2', color: colors.red, fontSize: 13, marginBottom: 12, border: '1px solid #fecaca' }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          style={{ ...styles.btn, ...styles.btnPrimary, width: '100%', opacity: submitting ? 0.7 : 1, cursor: submitting ? 'not-allowed' : 'pointer' }}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
};

// ============ MAIN APP ============
const App: React.FC = () => {
  const [authedUser, setAuthedUser] = useState<{ id?: string; username: string; role: string } | null>(() => userStore.get());
  const [page, setPage] = useState('dashboard');
  const [appsStatusFilter, setAppsStatusFilter] = useState<string | undefined>(undefined);

  const goTo = (target: string, options?: { applicationsStatusFilter?: string }) => {
    if (options?.applicationsStatusFilter !== undefined) {
      setAppsStatusFilter(options.applicationsStatusFilter);
    }
    setPage(target);
  };
  const [toast, setToast] = useState<Toast | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [products, setProducts] = useState<LoanProduct[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [summary, setSummary] = useState<DashboardSummary>({ total_applications: 0, pending: 0, approved: 0, active_loans: 0, disbursed_amount: 0, overdue: 0 });
  const [loading, setLoading] = useState(false);

  const showToast = (message: string, type: Toast['type']) => setToast({ message, type });

  const fetchApps = async () => {
    try { const data = await apiFetch('/applications'); if (Array.isArray(data)) setApplications(data); } catch { /* silent */ }
  };

  const fetchSummary = async () => {
    try {
      const d = await apiFetch('/dashboard/summary');
      if (d) {
        setSummary({
          total_applications: d.total_applications || 0,
          pending: d.pending_applications || d.pending || 0,
          approved: d.approved_applications || d.approved || 0,
          active_loans: d.active_loans || 0,
          disbursed_amount: d.total_disbursed || d.disbursed_amount || 0,
          overdue: d.total_collections_cases || d.overdue || 0,
        });
      }
    } catch { /* silent */ }
  };

  // Refresh both the application list and the dashboard summary so cards
  // wired to either source stay consistent after any mutation.
  const refreshAll = async () => {
    await Promise.all([fetchApps(), fetchSummary()]);
  };

  const handleLogout = () => {
    tokenStore.clear();
    setAuthedUser(null);
    setPage('dashboard');
  };

  const handleLoginSuccess = (user: { id?: string; username: string; role: string }) => {
    setAuthedUser(user);
  };

  useEffect(() => {
    if (!authedUser) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const results = await Promise.allSettled([
          apiFetch('/users'),
          apiFetch('/loan-products'),
          apiFetch('/applications'),
          apiFetch('/dashboard/summary'),
        ]);
        if (cancelled) return;
        if (results[0].status === 'fulfilled' && Array.isArray(results[0].value)) {
          setUsers(results[0].value.map((u: any) => ({ ...u, role: typeof u.role === 'object' ? u.role.name : u.role })));
        }
        if (results[1].status === 'fulfilled' && Array.isArray(results[1].value)) setProducts(results[1].value);
        if (results[2].status === 'fulfilled' && Array.isArray(results[2].value)) setApplications(results[2].value);
        if (results[3].status === 'fulfilled' && results[3].value) {
          const d = results[3].value;
          setSummary({
            total_applications: d.total_applications || 0,
            pending: d.pending_applications || d.pending || 0,
            approved: d.approved_applications || d.approved || 0,
            active_loans: d.active_loans || 0,
            disbursed_amount: d.total_disbursed || d.disbursed_amount || 0,
            overdue: d.total_collections_cases || d.overdue || 0,
          });
        }
      } catch { /* prevent crash */ }
      if (!cancelled) setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, [authedUser]);

  // Whenever the user opens the dashboard tab, refresh both the application
  // list and the dashboard summary so the cards reflect the latest state.
  // While the dashboard is the active tab we also poll every 30s in case
  // another user (e.g. an underwriter on a separate session) changes data.
  useEffect(() => {
    if (!authedUser || page !== 'dashboard') return;
    let cancelled = false;
    const tick = () => { if (!cancelled) refreshAll(); };
    tick();
    const id = window.setInterval(tick, 30000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [authedUser, page]);

  // Refresh on window focus too: a common workflow is a participant
  // switches away to CloudShell to inject a lab fault, then comes back.
  useEffect(() => {
    if (!authedUser) return;
    const onFocus = () => { refreshAll(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [authedUser]);

  const navItems = [
    { id: 'dashboard', icon: '🏠', label: 'Dashboard' },
    { id: 'kyc', icon: '👤', label: 'KYC Verification' },
    { id: 'application', icon: '📝', label: 'Loan Application' },
    { id: 'underwriting', icon: '✅', label: 'Underwriting' },
    { id: 'disbursement', icon: '💰', label: 'Disbursement & EMI' },
    { id: 'collections', icon: '⚠️', label: 'Collections' },
    { id: 'admin', icon: '👥', label: 'Admin' },
  ];

  if (!authedUser) {
    return <LoginPage onSuccess={handleLoginSuccess} />;
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: colors.lightBg }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🏦</div>
        <div style={{ fontSize: 18, fontWeight: 600, color: colors.textPrimary }}>Loading LoanFlow Pro...</div>
        <div style={{ marginTop: 12, width: 200, height: 4, background: colors.border, borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ width: '60%', height: '100%', background: colors.primary, borderRadius: 4, animation: 'pulse 1s infinite' }} />
        </div>
      </div>
    </div>
  );

  return (
    <ErrorBoundary>
      <div style={styles.app}>
        <ToastNotification toast={toast} onClose={() => setToast(null)} />
        <nav style={styles.sidebar}>
          <div style={styles.sidebarTitle}>🏦 LoanFlow Pro</div>
          {navItems.map(item => (
            <div key={item.id} onClick={() => setPage(item.id)} style={{ ...styles.navItem, ...(page === item.id ? styles.navItemActive : {}) }}
              onMouseEnter={e => { if (page !== item.id) e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
              onMouseLeave={e => { if (page !== item.id) e.currentTarget.style.background = 'transparent'; }}>
              <span>{item.icon}</span><span>{item.label}</span>
            </div>
          ))}
          <div style={{ marginTop: 'auto', padding: '16px 20px', borderTop: '1px solid rgba(255,255,255,0.1)', fontSize: 12, color: '#64748b' }}>
            <div>Logged in as <strong style={{ color: '#fff' }}>{authedUser.username}</strong></div>
            <div style={{ marginTop: 2, color: '#94a3b8' }}>Role: {authedUser.role}</div>
            <button
              onClick={handleLogout}
              style={{ marginTop: 10, padding: '6px 12px', background: 'transparent', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>
              Sign out
            </button>
            <div style={{ marginTop: 8 }}>v1.0.0</div>
          </div>
        </nav>
        <main style={styles.main}>
          {page === 'dashboard' && <DashboardPage summary={summary} onNavigate={setPage} onTileClick={goTo} />}
          {page === 'kyc' && <KYCPage showToast={showToast} />}
          {page === 'application' && <ApplicationPage products={products} applications={applications} initialStatusFilter={appsStatusFilter} showToast={showToast} refreshApps={refreshAll} />}
          {page === 'underwriting' && <UnderwritingPage applications={applications} showToast={showToast} refreshApps={refreshAll} />}
          {page === 'disbursement' && <DisbursementPage applications={applications} products={products} showToast={showToast} refreshApps={refreshAll} />}
          {page === 'collections' && <CollectionsPage showToast={showToast} />}
          {page === 'admin' && <AdminPage users={users} products={products} />}
        </main>
      </div>
    </ErrorBoundary>
  );
};

export default App;
