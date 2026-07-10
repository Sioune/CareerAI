import { useEffect, useState, useCallback, type FormEvent } from 'react';

const TOKEN_KEY = 'careerai_admin_token';

function fmtMoney(cents: number): string {
  return `¥${(cents / 100).toFixed(2)}`;
}

function fmtDate(d?: string | null): string {
  if (!d) return '-';
  const date = new Date(d);
  if (isNaN(date.getTime())) return '-';
  return date.toLocaleString('zh-CN', { hour12: false });
}

async function apiFetch(path: string, opts: RequestInit = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  const res = await fetch(path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `请求失败 (${res.status})`);
  return data;
}

function LoginScreen({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [mfaRequired, setMfaRequired] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await apiFetch('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({ username, password, mfaCode: mfaCode || undefined }),
      });
      localStorage.setItem(TOKEN_KEY, data.token);
      onLoggedIn();
    } catch (err: any) {
      if (err.message?.includes('验证码')) setMfaRequired(true);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100">
      <form onSubmit={submit} className="bg-white p-8 rounded-xl shadow-md w-full max-w-sm space-y-4">
        <h1 className="text-xl font-bold text-slate-900">CareerAI 后台管理</h1>
        <div>
          <label className="block text-sm text-slate-600 mb-1">用户名</label>
          <input
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
          />
        </div>
        <div>
          <label className="block text-sm text-slate-600 mb-1">密码</label>
          <input
            type="password"
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {mfaRequired && (
          <div>
            <label className="block text-sm text-slate-600 mb-1">动态验证码 (或备用码)</label>
            <input
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm tracking-widest"
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value)}
              autoFocus
            />
          </div>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-slate-900 text-white rounded-lg py-2 text-sm font-semibold disabled:opacity-50"
        >
          {loading ? '登录中...' : '登录'}
        </button>
      </form>
    </div>
  );
}

type Tab = 'overview' | 'users' | 'tasks' | 'payments' | 'refunds' | 'referrals' | 'finance' | 'audit' | 'accounts' | 'config' | 'ai' | 'tickets' | 'notifications' | 'risk' | 'security';

const ROLE_LABEL: Record<string, string> = {
  super_admin: '超级管理员',
  operations: '运营',
  finance: '财务',
  customer_service: '客服',
  auditor: '审计',
};

function Nav({ tab, setTab, onLogout, adminName, adminRole }: { tab: Tab; setTab: (t: Tab) => void; onLogout: () => void; adminName: string; adminRole: string }) {
  const isSuper = adminRole === 'super_admin';
  const items: { key: Tab; label: string; roles?: string[] }[] = [
    { key: 'overview', label: '经营概览' },
    { key: 'users', label: '用户管理' },
    { key: 'tasks', label: '任务列表' },
    { key: 'payments', label: '支付管理' },
    { key: 'refunds', label: '退款管理', roles: ['finance'] },
    { key: 'referrals', label: '推荐/权益' },
    { key: 'finance', label: '财务与AI成本', roles: ['finance'] },
    { key: 'audit', label: '审计日志', roles: ['auditor'] },
    { key: 'tickets', label: '工单中心', roles: ['customer_service'] },
    { key: 'risk', label: '风控中心', roles: ['operations'] },
    { key: 'notifications', label: '通知中心', roles: ['operations'] },
    { key: 'config', label: '站点配置', roles: ['operations'] },
    { key: 'ai', label: 'AI模型/提示词', roles: ['operations'] },
    { key: 'accounts', label: '管理员账号', roles: ['super_admin'] },
    { key: 'security', label: '安全设置' },
  ];
  const visible = items.filter((it) => !it.roles || isSuper || it.roles.includes(adminRole));
  return (
    <div className="w-56 shrink-0 bg-slate-900 text-slate-100 min-h-screen flex flex-col">
      <div className="p-4 border-b border-slate-700">
        <p className="font-bold text-lg">CareerAI</p>
        <p className="text-xs text-slate-400">后台管理系统</p>
      </div>
      <nav className="flex-1 py-2">
        {visible.map((it) => (
          <button
            key={it.key}
            onClick={() => setTab(it.key)}
            className={`w-full text-left px-4 py-2.5 text-sm ${tab === it.key ? 'bg-slate-700 text-white' : 'text-slate-300 hover:bg-slate-800'}`}
          >
            {it.label}
          </button>
        ))}
      </nav>
      <div className="p-4 border-t border-slate-700 text-xs text-slate-400">
        <p className="mb-1">{adminName}</p>
        <p className="mb-2 text-slate-500">{ROLE_LABEL[adminRole] || adminRole}</p>
        <button onClick={onLogout} className="text-slate-300 hover:text-white underline">退出登录</button>
      </div>
    </div>
  );
}

function Card({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-2xl font-bold text-slate-900 mt-1">{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  );
}

function OverviewTab() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch('/api/admin/overview').then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="text-red-600 text-sm">{error}</p>;
  if (!data) return <p className="text-slate-500 text-sm">加载中...</p>;

  return (
    <div>
      <h2 className="text-lg font-bold text-slate-900 mb-4">经营概览</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card label="累计用户" value={String(data.totalUsers)} sub={`近7日新增 ${data.newUsersLast7d}`} />
        <Card label="完成任务数" value={String(data.totalTasks)} />
        <Card label="累计支付订单" value={String(data.totalPayments)} sub={`已支付 ${data.paidPayments} / 待支付 ${data.pendingPayments}`} />
        <Card label="推荐转化数" value={String(data.referralConversions)} />
        <Card label="累计收入" value={fmtMoney(data.totalRevenueCents)} />
        <Card label="累计退款" value={fmtMoney(data.totalRefundedCents)} sub={`${data.refundCount} 笔`} />
        <Card label="净收入" value={fmtMoney(data.netRevenueCents)} />
      </div>
    </div>
  );
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <input
      className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm w-64"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function UsersTab() {
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState<any>(null);

  const load = useCallback(() => {
    apiFetch(`/api/admin/users?search=${encodeURIComponent(search)}`)
      .then((d) => { setRows(d.users); setTotal(d.total); })
      .catch((e) => setError(e.message));
  }, [search]);

  useEffect(() => { load(); }, [load]);

  const openDetail = (uid: string) => {
    apiFetch(`/api/admin/users/${encodeURIComponent(uid)}`).then(setDetail).catch((e) => setError(e.message));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-slate-900">用户管理 ({total})</h2>
        <SearchBox value={search} onChange={setSearch} placeholder="搜索 UID / 邮箱" />
      </div>
      {error && <p className="text-red-600 text-sm mb-2">{error}</p>}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-xs">
            <tr>
              <th className="text-left px-3 py-2">UID</th>
              <th className="text-left px-3 py-2">邮箱</th>
              <th className="text-left px-3 py-2">推荐人</th>
              <th className="text-left px-3 py-2">任务数</th>
              <th className="text-left px-3 py-2">累计支付</th>
              <th className="text-left px-3 py-2">注册时间</th>
              <th className="text-left px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id} className="border-t border-slate-100">
                <td className="px-3 py-2 font-medium">{u.uid}</td>
                <td className="px-3 py-2 text-slate-500">{u.email}</td>
                <td className="px-3 py-2 text-slate-500">{u.referredBy || '-'}</td>
                <td className="px-3 py-2">{u.taskCount}</td>
                <td className="px-3 py-2">{fmtMoney(u.totalPaidCents)}</td>
                <td className="px-3 py-2 text-slate-500">{fmtDate(u.createdAt)}</td>
                <td className="px-3 py-2">
                  <button onClick={() => openDetail(u.uid)} className="text-blue-600 hover:underline">详情</button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={7} className="text-center text-slate-400 py-6">暂无数据</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {detail && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setDetail(null)}>
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">{detail.user.uid}</h3>
              <button onClick={() => setDetail(null)} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>
            <p className="text-sm text-slate-500 mb-4">{detail.user.email} · 注册于 {fmtDate(detail.user.createdAt)}</p>

            <h4 className="font-semibold text-sm mb-2">支付记录 ({detail.payments.length})</h4>
            <div className="space-y-1 mb-4">
              {detail.payments.map((p: any) => (
                <div key={p.id} className="text-xs text-slate-600 flex justify-between border-b border-slate-100 py-1">
                  <span>{p.businessOrderNo}</span>
                  <span>{fmtMoney(p.amount)}</span>
                  <span>{p.statusName}</span>
                </div>
              ))}
              {detail.payments.length === 0 && <p className="text-xs text-slate-400">无</p>}
            </div>

            <h4 className="font-semibold text-sm mb-2">任务 ({detail.tasks.length})</h4>
            <div className="space-y-1 mb-4">
              {detail.tasks.map((t: any) => (
                <div key={t.reportId} className="text-xs text-slate-600 flex justify-between border-b border-slate-100 py-1">
                  <span>{t.reportId}</span>
                  <span>{fmtDate(t.createdAt)}</span>
                </div>
              ))}
              {detail.tasks.length === 0 && <p className="text-xs text-slate-400">无</p>}
            </div>

            <h4 className="font-semibold text-sm mb-2">推荐转化 ({detail.referralConversions.length})</h4>
            <div className="space-y-1">
              {detail.referralConversions.map((r: any, i: number) => (
                <div key={i} className="text-xs text-slate-600 flex justify-between border-b border-slate-100 py-1">
                  <span>{fmtDate(r.createdAt)}</span>
                </div>
              ))}
              {detail.referralConversions.length === 0 && <p className="text-xs text-slate-400">无</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TasksTab() {
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch(`/api/admin/tasks?search=${encodeURIComponent(search)}`)
      .then((d) => { setRows(d.tasks); setTotal(d.total); })
      .catch((e) => setError(e.message));
  }, [search]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-slate-900">任务列表 ({total})</h2>
        <SearchBox value={search} onChange={setSearch} placeholder="搜索任务ID / UID" />
      </div>
      {error && <p className="text-red-600 text-sm mb-2">{error}</p>}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-xs">
            <tr>
              <th className="text-left px-3 py-2">任务ID</th>
              <th className="text-left px-3 py-2">用户</th>
              <th className="text-left px-3 py-2">是否已解锁</th>
              <th className="text-left px-3 py-2">支付次数</th>
              <th className="text-left px-3 py-2">创建时间</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.reportId} className="border-t border-slate-100">
                <td className="px-3 py-2 font-mono text-xs">{t.reportId}</td>
                <td className="px-3 py-2">{t.uid}</td>
                <td className="px-3 py-2">{t.hasPaidUnlock ? <span className="text-emerald-600">已解锁</span> : <span className="text-slate-400">未解锁</span>}</td>
                <td className="px-3 py-2">{t.paymentCount}</td>
                <td className="px-3 py-2 text-slate-500">{fmtDate(t.createdAt)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={5} className="text-center text-slate-400 py-6">暂无数据</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const PAYMENT_STATUS_LABEL: Record<number, string> = {
  1: '待支付', 2: '已支付', 3: '失败', 4: '已取消', 5: '已过期', 6: '已退款',
};

function PaymentsTab() {
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');
  const [refundTarget, setRefundTarget] = useState<any>(null);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [refundError, setRefundError] = useState('');

  const load = useCallback(() => {
    const q = statusFilter ? `?status=${statusFilter}` : '';
    apiFetch(`/api/admin/payments${q}`)
      .then((d) => { setRows(d.payments); setTotal(d.total); })
      .catch((e) => setError(e.message));
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  const openRefund = (p: any) => {
    setRefundTarget(p);
    setRefundAmount((p.amount / 100).toFixed(2));
    setRefundReason('');
    setRefundError('');
  };

  const submitRefund = async () => {
    if (!refundTarget) return;
    setSubmitting(true);
    setRefundError('');
    try {
      const cents = Math.round(parseFloat(refundAmount) * 100);
      await apiFetch(`/api/admin/payments/${refundTarget.businessOrderNo}/refund`, {
        method: 'POST',
        body: JSON.stringify({ amount: cents, reason: refundReason }),
      });
      setRefundTarget(null);
      load();
    } catch (err: any) {
      setRefundError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-slate-900">支付管理 ({total})</h2>
        <select className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">全部状态</option>
          {Object.entries(PAYMENT_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      {error && <p className="text-red-600 text-sm mb-2">{error}</p>}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-xs">
            <tr>
              <th className="text-left px-3 py-2">订单号</th>
              <th className="text-left px-3 py-2">用户</th>
              <th className="text-left px-3 py-2">金额</th>
              <th className="text-left px-3 py-2">状态</th>
              <th className="text-left px-3 py-2">支付时间</th>
              <th className="text-left px-3 py-2">创建时间</th>
              <th className="text-left px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="border-t border-slate-100">
                <td className="px-3 py-2 font-mono text-xs">{p.businessOrderNo}</td>
                <td className="px-3 py-2">{p.uid}</td>
                <td className="px-3 py-2">{fmtMoney(p.amount)}</td>
                <td className="px-3 py-2">{p.statusName}</td>
                <td className="px-3 py-2 text-slate-500">{fmtDate(p.paidAt)}</td>
                <td className="px-3 py-2 text-slate-500">{fmtDate(p.createdAt)}</td>
                <td className="px-3 py-2">
                  {p.status === 2 && (
                    <button onClick={() => openRefund(p)} className="text-red-600 hover:underline">退款</button>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={7} className="text-center text-slate-400 py-6">暂无数据</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {refundTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setRefundTarget(null)}>
          <div className="bg-white rounded-xl max-w-sm w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">发起退款申请</h3>
            <p className="text-xs text-slate-500 mb-3">订单：{refundTarget.businessOrderNo}（需另一位管理员审批后才会实际退款）</p>
            <label className="block text-sm text-slate-600 mb-1">退款金额（元）</label>
            <input
              type="number"
              step="0.01"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-3"
              value={refundAmount}
              onChange={(e) => setRefundAmount(e.target.value)}
            />
            <label className="block text-sm text-slate-600 mb-1">退款原因</label>
            <textarea
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-3"
              value={refundReason}
              onChange={(e) => setRefundReason(e.target.value)}
              rows={3}
            />
            {refundError && <p className="text-sm text-red-600 mb-3">{refundError}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={() => setRefundTarget(null)} className="px-4 py-2 text-sm rounded-lg border border-slate-300">取消</button>
              <button onClick={submitRefund} disabled={submitting} className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white disabled:opacity-50">
                {submitting ? '提交中...' : '确认退款'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RefundsTab({ adminUsername, adminRole }: { adminUsername: string; adminRole: string }) {
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');
  const [rejectTarget, setRejectTarget] = useState<any>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(() => {
    apiFetch('/api/admin/refunds').then((d) => { setRows(d.refunds); setTotal(d.total); }).catch((e) => setError(e.message));
  }, []);

  useEffect(() => { load(); }, [load]);

  const canApprove = (r: any) => r.status === 0 && (adminRole === 'super_admin' || r.requestedByAdmin !== adminUsername);

  const approve = async (id: number) => {
    setBusyId(id);
    setError('');
    try {
      await apiFetch(`/api/admin/refunds/${id}/approve`, { method: 'POST' });
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const submitReject = async () => {
    if (!rejectTarget) return;
    setBusyId(rejectTarget.id);
    try {
      await apiFetch(`/api/admin/refunds/${rejectTarget.id}/reject`, { method: 'POST', body: JSON.stringify({ reason: rejectReason }) });
      setRejectTarget(null);
      setRejectReason('');
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <h2 className="text-lg font-bold text-slate-900 mb-4">退款管理 ({total})</h2>
      <p className="text-xs text-slate-400 mb-3">双人复核机制：发起人不能审批自己提交的退款申请（超级管理员除外）。</p>
      {error && <p className="text-red-600 text-sm mb-2">{error}</p>}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-xs">
            <tr>
              <th className="text-left px-3 py-2">订单号</th>
              <th className="text-left px-3 py-2">用户</th>
              <th className="text-left px-3 py-2">退款金额</th>
              <th className="text-left px-3 py-2">原因</th>
              <th className="text-left px-3 py-2">状态</th>
              <th className="text-left px-3 py-2">发起人</th>
              <th className="text-left px-3 py-2">审批人</th>
              <th className="text-left px-3 py-2">时间</th>
              <th className="text-left px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="px-3 py-2 font-mono text-xs">{r.businessOrderNo}</td>
                <td className="px-3 py-2">{r.uid}</td>
                <td className="px-3 py-2">{fmtMoney(r.amount)}</td>
                <td className="px-3 py-2 text-slate-500">{r.reason}</td>
                <td className="px-3 py-2">
                  {r.status === 0 ? <span className="text-amber-600">待审批</span> : r.status === 4 ? <span className="text-slate-400">已拒绝</span> : r.statusName}
                </td>
                <td className="px-3 py-2 text-slate-500">{r.requestedByAdmin || r.processedByAdmin || '-'}</td>
                <td className="px-3 py-2 text-slate-500">{r.approvedByAdmin || '-'}</td>
                <td className="px-3 py-2 text-slate-500">{fmtDate(r.createdAt)}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {r.status === 0 && (
                    canApprove(r) ? (
                      <>
                        <button disabled={busyId === r.id} onClick={() => approve(r.id)} className="text-emerald-600 hover:underline mr-3 disabled:opacity-50">批准</button>
                        <button disabled={busyId === r.id} onClick={() => { setRejectTarget(r); setRejectReason(''); }} className="text-red-600 hover:underline disabled:opacity-50">拒绝</button>
                      </>
                    ) : (
                      <span className="text-xs text-slate-400">待他人审批</span>
                    )
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={9} className="text-center text-slate-400 py-6">暂无数据</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {rejectTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setRejectTarget(null)}>
          <div className="bg-white rounded-xl max-w-sm w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">拒绝退款申请</h3>
            <p className="text-xs text-slate-500 mb-3">订单：{rejectTarget.businessOrderNo}</p>
            <label className="block text-sm text-slate-600 mb-1">拒绝原因</label>
            <textarea
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-3"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setRejectTarget(null)} className="px-4 py-2 text-sm rounded-lg border border-slate-300">取消</button>
              <button onClick={submitReject} disabled={busyId === rejectTarget.id} className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white disabled:opacity-50">
                确认拒绝
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ReferralsTab() {
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch('/api/admin/referrals').then((d) => { setRows(d.referrals); setTotal(d.total); }).catch((e) => setError(e.message));
  }, []);

  return (
    <div>
      <h2 className="text-lg font-bold text-slate-900 mb-4">推荐 / 权益记录 ({total})</h2>
      {error && <p className="text-red-600 text-sm mb-2">{error}</p>}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-xs">
            <tr>
              <th className="text-left px-3 py-2">推荐人</th>
              <th className="text-left px-3 py-2">被推荐人</th>
              <th className="text-left px-3 py-2">是否已兑换权益</th>
              <th className="text-left px-3 py-2">时间</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="px-3 py-2">{r.referrerUid}</td>
                <td className="px-3 py-2">{r.referredUid}</td>
                <td className="px-3 py-2">{r.claimed ? '已兑换' : '未兑换'}</td>
                <td className="px-3 py-2 text-slate-500">{fmtDate(r.createdAt)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={4} className="text-center text-slate-400 py-6">暂无数据</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FinanceTab() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch('/api/admin/finance/costs').then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="text-red-600 text-sm">{error}</p>;
  if (!data) return <p className="text-slate-500 text-sm">加载中...</p>;

  return (
    <div>
      <h2 className="text-lg font-bold text-slate-900 mb-4">财务与 AI 成本</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card label="累计收入" value={fmtMoney(data.totalRevenueCents)} />
        <Card label="AI 成本估算" value={fmtMoney(data.totalCostCents)} sub={`输入 ${data.totalTokensIn} / 输出 ${data.totalTokensOut} tokens`} />
        <Card label="毛利" value={fmtMoney(data.grossMarginCents)} sub={data.grossMarginPct !== null ? `毛利率 ${data.grossMarginPct}%` : undefined} />
        <Card label="AI 调用次数" value={String(data.recentEvents.length)} />
      </div>

      <h3 className="font-semibold text-sm mb-2 text-slate-700">按功能类型成本分布</h3>
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-6">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-xs">
            <tr>
              <th className="text-left px-3 py-2">功能</th>
              <th className="text-left px-3 py-2">调用次数</th>
              <th className="text-left px-3 py-2">成本</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(data.byOperation).map(([op, v]: [string, any]) => (
              <tr key={op} className="border-t border-slate-100">
                <td className="px-3 py-2 font-mono text-xs">{op}</td>
                <td className="px-3 py-2">{v.count}</td>
                <td className="px-3 py-2">{fmtMoney(v.costCents)}</td>
              </tr>
            ))}
            {Object.keys(data.byOperation).length === 0 && (
              <tr><td colSpan={3} className="text-center text-slate-400 py-6">暂无数据（说明：Gemini API 未配置或尚未产生调用）</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-400">注：成本为基于 Gemini 官方公开单价的估算值，非平台实际账单金额，仅供毛利趋势参考。</p>
    </div>
  );
}

function AuditTab() {
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch('/api/admin/audit-logs').then((d) => { setRows(d.logs); setTotal(d.total); }).catch((e) => setError(e.message));
  }, []);

  return (
    <div>
      <h2 className="text-lg font-bold text-slate-900 mb-4">审计日志 ({total})</h2>
      {error && <p className="text-red-600 text-sm mb-2">{error}</p>}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-xs">
            <tr>
              <th className="text-left px-3 py-2">时间</th>
              <th className="text-left px-3 py-2">操作人</th>
              <th className="text-left px-3 py-2">操作</th>
              <th className="text-left px-3 py-2">对象</th>
              <th className="text-left px-3 py-2">详情</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="px-3 py-2 text-slate-500">{fmtDate(r.createdAt)}</td>
                <td className="px-3 py-2">{r.adminUsername}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.action}</td>
                <td className="px-3 py-2 text-slate-500">{r.targetType ? `${r.targetType}:${r.targetId}` : '-'}</td>
                <td className="px-3 py-2 text-slate-400 text-xs max-w-xs truncate">{r.detail || '-'}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={5} className="text-center text-slate-400 py-6">暂无数据</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ConfigTab() {
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');

  const load = useCallback(() => {
    apiFetch('/api/admin/config').then((d) => setRows(d.configs)).catch((e) => setError(e.message));
  }, []);
  useEffect(() => { load(); }, [load]);

  const saveDraft = async () => {
    try {
      let parsed: any = value;
      try { parsed = JSON.parse(value); } catch { /* keep as string */ }
      await apiFetch('/api/admin/config', { method: 'POST', body: JSON.stringify({ key, value: parsed }) });
      setKey(''); setValue('');
      load();
    } catch (e: any) { setError(e.message); }
  };

  const publish = async (id: number) => {
    try { await apiFetch(`/api/admin/config/${id}/publish`, { method: 'POST' }); load(); }
    catch (e: any) { setError(e.message); }
  };

  return (
    <div>
      <h2 className="text-lg font-bold text-slate-900 mb-4">站点配置 / CMS（版本化 + 发布回滚）</h2>
      {error && <p className="text-red-600 text-sm mb-2">{error}</p>}
      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4 flex gap-2 items-end">
        <div className="flex-1">
          <label className="block text-xs text-slate-500 mb-1">配置键 (key)</label>
          <input className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm" value={key} onChange={(e) => setKey(e.target.value)} placeholder="e.g. resume_unlock_price" />
        </div>
        <div className="flex-[2]">
          <label className="block text-xs text-slate-500 mb-1">值 (纯文本或 JSON)</label>
          <input className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm" value={value} onChange={(e) => setValue(e.target.value)} />
        </div>
        <button onClick={saveDraft} disabled={!key || !value} className="bg-slate-900 text-white px-4 py-1.5 rounded-lg text-sm disabled:opacity-50">保存草稿</button>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-xs">
            <tr>
              <th className="text-left px-3 py-2">Key</th>
              <th className="text-left px-3 py-2">版本</th>
              <th className="text-left px-3 py-2">状态</th>
              <th className="text-left px-3 py-2">值</th>
              <th className="text-left px-3 py-2">编辑者</th>
              <th className="text-left px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-t border-slate-100">
                <td className="px-3 py-2 font-medium">{c.key}</td>
                <td className="px-3 py-2">v{c.version}</td>
                <td className="px-3 py-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs ${c.status === 'published' ? 'bg-green-100 text-green-700' : c.status === 'draft' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                    {c.status === 'published' ? '已发布' : c.status === 'draft' ? '草稿' : '已归档'}
                  </span>
                </td>
                <td className="px-3 py-2 text-slate-500 max-w-xs truncate font-mono text-xs">{c.value}</td>
                <td className="px-3 py-2 text-slate-500">{c.editedByAdmin}</td>
                <td className="px-3 py-2">
                  {c.status !== 'published' && <button onClick={() => publish(c.id)} className="text-blue-600 hover:underline text-xs">发布</button>}
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="text-center text-slate-400 py-6">暂无配置</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AiTab() {
  const [providers, setProviders] = useState<any[]>([]);
  const [models, setModels] = useState<any[]>([]);
  const [prompts, setPrompts] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [promptOp, setPromptOp] = useState('');
  const [promptContent, setPromptContent] = useState('');

  const load = useCallback(() => {
    Promise.all([
      apiFetch('/api/admin/ai/providers'),
      apiFetch('/api/admin/ai/models'),
      apiFetch('/api/admin/ai/prompts'),
    ]).then(([p, m, pr]) => { setProviders(p.providers); setModels(m.models); setPrompts(pr.prompts); })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => { load(); }, [load]);

  const toggleModel = async (id: number, enabled: boolean) => {
    try { await apiFetch(`/api/admin/ai/models/${id}`, { method: 'PATCH', body: JSON.stringify({ enabled }) }); load(); }
    catch (e: any) { setError(e.message); }
  };
  const setDefaultModel = async (id: number) => {
    try { await apiFetch(`/api/admin/ai/models/${id}`, { method: 'PATCH', body: JSON.stringify({ isDefault: true }) }); load(); }
    catch (e: any) { setError(e.message); }
  };
  const saveDraftPrompt = async () => {
    try {
      await apiFetch('/api/admin/ai/prompts', { method: 'POST', body: JSON.stringify({ operation: promptOp, content: promptContent }) });
      setPromptOp(''); setPromptContent('');
      load();
    } catch (e: any) { setError(e.message); }
  };
  const publishPrompt = async (id: number) => {
    try { await apiFetch(`/api/admin/ai/prompts/${id}/publish`, { method: 'POST' }); load(); }
    catch (e: any) { setError(e.message); }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-slate-900">AI 模型 / 提示词管理</h2>
      {error && <p className="text-red-600 text-sm">{error}</p>}

      <div>
        <h3 className="font-semibold text-sm mb-2">供应商 ({providers.length})</h3>
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs"><tr><th className="text-left px-3 py-2">名称</th><th className="text-left px-3 py-2">显示名</th><th className="text-left px-3 py-2">密钥环境变量</th></tr></thead>
            <tbody>
              {providers.map((p) => (
                <tr key={p.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-medium">{p.name}</td>
                  <td className="px-3 py-2">{p.displayName}</td>
                  <td className="px-3 py-2 text-slate-500 font-mono text-xs">{p.apiKeyEnvVar}</td>
                </tr>
              ))}
              {providers.length === 0 && <tr><td colSpan={3} className="text-center text-slate-400 py-4">暂无供应商，需通过 API 手动录入</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h3 className="font-semibold text-sm mb-2">模型 ({models.length})</h3>
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs"><tr><th className="text-left px-3 py-2">模型</th><th className="text-left px-3 py-2">用途</th><th className="text-left px-3 py-2">输入价/百万</th><th className="text-left px-3 py-2">输出价/百万</th><th className="text-left px-3 py-2">默认</th><th className="text-left px-3 py-2">启用</th></tr></thead>
            <tbody>
              {models.map((m) => (
                <tr key={m.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-medium">{m.modelName}</td>
                  <td className="px-3 py-2 text-slate-500">{m.operation}</td>
                  <td className="px-3 py-2">${m.priceInputPerMillion}</td>
                  <td className="px-3 py-2">${m.priceOutputPerMillion}</td>
                  <td className="px-3 py-2">
                    {m.isDefault ? <span className="text-green-600 text-xs">默认</span> : <button onClick={() => setDefaultModel(m.id)} className="text-blue-600 hover:underline text-xs">设为默认</button>}
                  </td>
                  <td className="px-3 py-2">
                    <input type="checkbox" checked={!!m.enabled} onChange={(e) => toggleModel(m.id, e.target.checked)} />
                  </td>
                </tr>
              ))}
              {models.length === 0 && <tr><td colSpan={6} className="text-center text-slate-400 py-4">暂无模型，需通过 API 手动录入</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h3 className="font-semibold text-sm mb-2">提示词版本管理</h3>
        <div className="bg-white rounded-xl border border-slate-200 p-4 mb-3 flex gap-2 items-end">
          <div className="flex-1">
            <label className="block text-xs text-slate-500 mb-1">操作类型 (operation)</label>
            <input className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm" value={promptOp} onChange={(e) => setPromptOp(e.target.value)} placeholder="e.g. resume_rewrite" />
          </div>
          <div className="flex-[2]">
            <label className="block text-xs text-slate-500 mb-1">提示词内容</label>
            <textarea className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm" rows={2} value={promptContent} onChange={(e) => setPromptContent(e.target.value)} />
          </div>
          <button onClick={saveDraftPrompt} disabled={!promptOp || !promptContent} className="bg-slate-900 text-white px-4 py-1.5 rounded-lg text-sm disabled:opacity-50">保存草稿</button>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs"><tr><th className="text-left px-3 py-2">操作</th><th className="text-left px-3 py-2">版本</th><th className="text-left px-3 py-2">状态</th><th className="text-left px-3 py-2">内容</th><th className="text-left px-3 py-2"></th></tr></thead>
            <tbody>
              {prompts.map((p) => (
                <tr key={p.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-medium">{p.operation}</td>
                  <td className="px-3 py-2">v{p.version}</td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs ${p.status === 'published' ? 'bg-green-100 text-green-700' : p.status === 'draft' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                      {p.status === 'published' ? '已发布' : p.status === 'draft' ? '草稿' : '已归档'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-500 max-w-xs truncate text-xs">{p.content}</td>
                  <td className="px-3 py-2">{p.status !== 'published' && <button onClick={() => publishPrompt(p.id)} className="text-blue-600 hover:underline text-xs">发布</button>}</td>
                </tr>
              ))}
              {prompts.length === 0 && <tr><td colSpan={5} className="text-center text-slate-400 py-4">暂无提示词版本</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function TicketsTab() {
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState<any>(null);
  const [replyMsg, setReplyMsg] = useState('');

  const load = useCallback(() => {
    apiFetch('/api/admin/tickets').then((d) => setRows(d.tickets)).catch((e) => setError(e.message));
  }, []);
  useEffect(() => { load(); }, [load]);

  const openTicket = (id: number) => {
    apiFetch(`/api/admin/tickets/${id}`).then(setDetail).catch((e) => setError(e.message));
  };

  const reply = async () => {
    if (!detail || !replyMsg.trim()) return;
    try {
      await apiFetch(`/api/admin/tickets/${detail.ticket.id}/reply`, { method: 'POST', body: JSON.stringify({ message: replyMsg, status: 'in_progress' }) });
      setReplyMsg('');
      openTicket(detail.ticket.id);
      load();
    } catch (e: any) { setError(e.message); }
  };

  const setStatus = async (id: number, status: string) => {
    try {
      await apiFetch(`/api/admin/tickets/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
      load();
      if (detail?.ticket.id === id) openTicket(id);
    } catch (e: any) { setError(e.message); }
  };

  const STATUS_LABEL: Record<string, string> = { open: '待处理', in_progress: '处理中', resolved: '已解决', closed: '已关闭' };

  return (
    <div>
      <h2 className="text-lg font-bold text-slate-900 mb-4">工单中心 ({rows.length})</h2>
      {error && <p className="text-red-600 text-sm mb-2">{error}</p>}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-xs"><tr><th className="text-left px-3 py-2">主题</th><th className="text-left px-3 py-2">UID</th><th className="text-left px-3 py-2">状态</th><th className="text-left px-3 py-2">处理人</th><th className="text-left px-3 py-2">创建时间</th><th className="text-left px-3 py-2"></th></tr></thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id} className="border-t border-slate-100">
                <td className="px-3 py-2 font-medium">{t.subject}</td>
                <td className="px-3 py-2 text-slate-500">{t.uid || '-'}</td>
                <td className="px-3 py-2">
                  <select className="border border-slate-300 rounded-lg px-2 py-1 text-xs" value={t.status} onChange={(e) => setStatus(t.id, e.target.value)}>
                    {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </td>
                <td className="px-3 py-2 text-slate-500">{t.assignedToAdmin || '-'}</td>
                <td className="px-3 py-2 text-slate-500">{fmtDate(t.createdAt)}</td>
                <td className="px-3 py-2"><button onClick={() => openTicket(t.id)} className="text-blue-600 hover:underline text-xs">详情</button></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="text-center text-slate-400 py-6">暂无工单</td></tr>}
          </tbody>
        </table>
      </div>

      {detail && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setDetail(null)}>
          <div className="bg-white rounded-xl max-w-xl w-full max-h-[85vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">{detail.ticket.subject}</h3>
              <button onClick={() => setDetail(null)} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>
            <p className="text-sm text-slate-600 mb-3">{detail.ticket.message}</p>
            <div className="space-y-2 mb-4 max-h-64 overflow-y-auto">
              {detail.replies.map((r: any) => (
                <div key={r.id} className={`text-xs p-2 rounded-lg ${r.authorType === 'admin' ? 'bg-blue-50 text-blue-900' : 'bg-slate-100 text-slate-700'}`}>
                  <span className="font-semibold">{r.authorName || r.authorType}</span>: {r.message}
                </div>
              ))}
              {detail.replies.length === 0 && <p className="text-xs text-slate-400">暂无回复</p>}
            </div>
            <div className="flex gap-2">
              <input className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm" value={replyMsg} onChange={(e) => setReplyMsg(e.target.value)} placeholder="输入回复..." />
              <button onClick={reply} className="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm">回复</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function NotificationsTab() {
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState('all');
  const [targetUid, setTargetUid] = useState('');

  const load = useCallback(() => {
    apiFetch('/api/admin/notifications').then((d) => setRows(d.notifications)).catch((e) => setError(e.message));
  }, []);
  useEffect(() => { load(); }, [load]);

  const send = async () => {
    try {
      await apiFetch('/api/admin/notifications', { method: 'POST', body: JSON.stringify({ title, body, audience, targetUid: audience === 'uid' ? targetUid : undefined }) });
      setTitle(''); setBody(''); setTargetUid('');
      load();
    } catch (e: any) { setError(e.message); }
  };

  return (
    <div>
      <h2 className="text-lg font-bold text-slate-900 mb-4">通知中心</h2>
      {error && <p className="text-red-600 text-sm mb-2">{error}</p>}
      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4 space-y-2">
        <input className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm" placeholder="标题" value={title} onChange={(e) => setTitle(e.target.value)} />
        <textarea className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm" rows={2} placeholder="正文" value={body} onChange={(e) => setBody(e.target.value)} />
        <div className="flex gap-2 items-center">
          <select className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm" value={audience} onChange={(e) => setAudience(e.target.value)}>
            <option value="all">全体用户</option>
            <option value="uid">指定用户</option>
          </select>
          {audience === 'uid' && <input className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm" placeholder="目标 UID" value={targetUid} onChange={(e) => setTargetUid(e.target.value)} />}
          <button onClick={send} disabled={!title || !body} className="bg-slate-900 text-white px-4 py-1.5 rounded-lg text-sm disabled:opacity-50 ml-auto">发送</button>
        </div>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-xs"><tr><th className="text-left px-3 py-2">标题</th><th className="text-left px-3 py-2">受众</th><th className="text-left px-3 py-2">发送人</th><th className="text-left px-3 py-2">时间</th></tr></thead>
          <tbody>
            {rows.map((n) => (
              <tr key={n.id} className="border-t border-slate-100">
                <td className="px-3 py-2 font-medium">{n.title}</td>
                <td className="px-3 py-2 text-slate-500">{n.audience === 'all' ? '全体' : n.targetUid}</td>
                <td className="px-3 py-2 text-slate-500">{n.createdByAdmin}</td>
                <td className="px-3 py-2 text-slate-500">{fmtDate(n.createdAt)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={4} className="text-center text-slate-400 py-6">暂无通知</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RiskTab() {
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    apiFetch('/api/admin/risk-flags').then((d) => setRows(d.flags)).catch((e) => setError(e.message));
  }, []);
  useEffect(() => { load(); }, [load]);

  const review = async (id: number, status: string) => {
    try { await apiFetch(`/api/admin/risk-flags/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }); load(); }
    catch (e: any) { setError(e.message); }
  };

  const SEVERITY_COLOR: Record<string, string> = { low: 'bg-slate-100 text-slate-600', medium: 'bg-amber-100 text-amber-700', high: 'bg-red-100 text-red-700' };

  return (
    <div>
      <h2 className="text-lg font-bold text-slate-900 mb-4">风控中心 ({rows.length})</h2>
      {error && <p className="text-red-600 text-sm mb-2">{error}</p>}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-xs"><tr><th className="text-left px-3 py-2">UID</th><th className="text-left px-3 py-2">规则</th><th className="text-left px-3 py-2">严重度</th><th className="text-left px-3 py-2">详情</th><th className="text-left px-3 py-2">状态</th><th className="text-left px-3 py-2">时间</th><th className="text-left px-3 py-2"></th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="px-3 py-2 font-medium">{r.uid}</td>
                <td className="px-3 py-2 text-slate-500">{r.ruleType}</td>
                <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded-full text-xs ${SEVERITY_COLOR[r.severity] || ''}`}>{r.severity}</span></td>
                <td className="px-3 py-2 text-slate-500 text-xs max-w-xs truncate">{r.detail}</td>
                <td className="px-3 py-2 text-slate-500">{r.status}</td>
                <td className="px-3 py-2 text-slate-500">{fmtDate(r.createdAt)}</td>
                <td className="px-3 py-2 space-x-2">
                  {r.status === 'open' && (
                    <>
                      <button onClick={() => review(r.id, 'reviewed')} className="text-blue-600 hover:underline text-xs">已复核</button>
                      <button onClick={() => review(r.id, 'dismissed')} className="text-slate-500 hover:underline text-xs">忽略</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7} className="text-center text-slate-400 py-6">暂无风控告警</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SecurityTab() {
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [setupData, setSetupData] = useState<any>(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    apiFetch('/api/admin/me').then((d) => setMfaEnabled(!!d.mfaEnabled)).catch((e) => setError(e.message));
  }, []);
  useEffect(() => { load(); }, [load]);

  const startSetup = async () => {
    try { setSetupData(await apiFetch('/api/admin/mfa/setup', { method: 'POST' })); }
    catch (e: any) { setError(e.message); }
  };

  const verify = async () => {
    try {
      const data = await apiFetch('/api/admin/mfa/verify', { method: 'POST', body: JSON.stringify({ code: verifyCode }) });
      setBackupCodes(data.backupCodes);
      setSetupData(null);
      setVerifyCode('');
      load();
    } catch (e: any) { setError(e.message); }
  };

  const disable = async () => {
    try { await apiFetch('/api/admin/mfa/disable', { method: 'POST' }); load(); }
    catch (e: any) { setError(e.message); }
  };

  return (
    <div>
      <h2 className="text-lg font-bold text-slate-900 mb-4">安全设置 · 双因素认证 (MFA)</h2>
      {error && <p className="text-red-600 text-sm mb-2">{error}</p>}
      <div className="bg-white rounded-xl border border-slate-200 p-6 max-w-lg">
        {mfaEnabled ? (
          <div>
            <p className="text-sm text-green-700 mb-4">✓ 已启用双因素认证</p>
            <button onClick={disable} className="text-sm text-red-600 hover:underline">停用 MFA</button>
          </div>
        ) : backupCodes ? (
          <div>
            <p className="text-sm text-green-700 mb-3">MFA 已启用！请保存以下备用码（每个仅可使用一次）：</p>
            <div className="grid grid-cols-2 gap-2 font-mono text-sm bg-slate-50 p-3 rounded-lg mb-3">
              {backupCodes.map((c) => <span key={c}>{c}</span>)}
            </div>
            <button onClick={() => setBackupCodes(null)} className="text-sm bg-slate-900 text-white px-4 py-2 rounded-lg">完成</button>
          </div>
        ) : setupData ? (
          <div>
            <p className="text-sm text-slate-600 mb-3">使用 Google Authenticator / 微信身份验证器扫码：</p>
            <img src={setupData.qrDataUrl} alt="MFA QR" className="w-48 h-48 mb-3 border border-slate-200 rounded-lg" />
            <p className="text-xs text-slate-400 mb-3 font-mono">密钥: {setupData.secret}</p>
            <input className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-3" placeholder="输入6位验证码" value={verifyCode} onChange={(e) => setVerifyCode(e.target.value)} />
            <button onClick={verify} disabled={verifyCode.length < 6} className="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50">验证并启用</button>
          </div>
        ) : (
          <div>
            <p className="text-sm text-slate-600 mb-4">尚未启用双因素认证，建议开启以提升账号安全性。</p>
            <button onClick={startSetup} className="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm">开启 MFA</button>
          </div>
        )}
      </div>
    </div>
  );
}

const ALL_ROLES = ['super_admin', 'operations', 'finance', 'customer_service', 'auditor'];

function AccountsTab() {
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('operations');
  const [submitting, setSubmitting] = useState(false);
  const [createError, setCreateError] = useState('');

  const load = useCallback(() => {
    apiFetch('/api/admin/accounts').then((d) => setRows(d.accounts)).catch((e) => setError(e.message));
  }, []);

  useEffect(() => { load(); }, [load]);

  const changeRole = async (id: number, newRole: string) => {
    try {
      await apiFetch(`/api/admin/accounts/${id}/role`, { method: 'PATCH', body: JSON.stringify({ role: newRole }) });
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const createAccount = async () => {
    setSubmitting(true);
    setCreateError('');
    try {
      await apiFetch('/api/admin/accounts', { method: 'POST', body: JSON.stringify({ username, password, role }) });
      setShowCreate(false);
      setUsername(''); setPassword(''); setRole('operations');
      load();
    } catch (e: any) {
      setCreateError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-slate-900">管理员账号</h2>
        <button onClick={() => setShowCreate(true)} className="text-sm bg-slate-900 text-white px-4 py-1.5 rounded-lg">+ 新建管理员</button>
      </div>
      {error && <p className="text-red-600 text-sm mb-2">{error}</p>}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-xs">
            <tr>
              <th className="text-left px-3 py-2">用户名</th>
              <th className="text-left px-3 py-2">角色</th>
              <th className="text-left px-3 py-2">创建时间</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id} className="border-t border-slate-100">
                <td className="px-3 py-2 font-medium">{a.username}</td>
                <td className="px-3 py-2">
                  <select className="border border-slate-300 rounded-lg px-2 py-1 text-xs" value={a.role} onChange={(e) => changeRole(a.id, e.target.value)}>
                    {ALL_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                  </select>
                </td>
                <td className="px-3 py-2 text-slate-500">{fmtDate(a.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-xl max-w-sm w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">新建管理员</h3>
            <label className="block text-sm text-slate-600 mb-1">用户名</label>
            <input className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-3" value={username} onChange={(e) => setUsername(e.target.value)} />
            <label className="block text-sm text-slate-600 mb-1">初始密码</label>
            <input type="password" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-3" value={password} onChange={(e) => setPassword(e.target.value)} />
            <label className="block text-sm text-slate-600 mb-1">角色</label>
            <select className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-3" value={role} onChange={(e) => setRole(e.target.value)}>
              {ALL_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select>
            {createError && <p className="text-sm text-red-600 mb-3">{createError}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm rounded-lg border border-slate-300">取消</button>
              <button onClick={createAccount} disabled={submitting} className="px-4 py-2 text-sm rounded-lg bg-slate-900 text-white disabled:opacity-50">
                {submitting ? '创建中...' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminApp() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [adminName, setAdminName] = useState('');
  const [adminRole, setAdminRole] = useState('');
  const [tab, setTab] = useState<Tab>('overview');

  const checkAuth = useCallback(() => {
    if (!localStorage.getItem(TOKEN_KEY)) {
      setAuthed(false);
      return;
    }
    apiFetch('/api/admin/me')
      .then((d) => { setAdminName(d.username); setAdminRole(d.role); setAuthed(true); })
      .catch(() => { localStorage.removeItem(TOKEN_KEY); setAuthed(false); });
  }, []);

  useEffect(() => { checkAuth(); }, [checkAuth]);

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    setAuthed(false);
  };

  if (authed === null) return null;
  if (!authed) return <LoginScreen onLoggedIn={checkAuth} />;

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Nav tab={tab} setTab={setTab} onLogout={logout} adminName={adminName} adminRole={adminRole} />
      <div className="flex-1 p-6">
        {tab === 'overview' && <OverviewTab />}
        {tab === 'users' && <UsersTab />}
        {tab === 'tasks' && <TasksTab />}
        {tab === 'payments' && <PaymentsTab />}
        {tab === 'refunds' && <RefundsTab adminUsername={adminName} adminRole={adminRole} />}
        {tab === 'referrals' && <ReferralsTab />}
        {tab === 'finance' && <FinanceTab />}
        {tab === 'audit' && <AuditTab />}
        {tab === 'accounts' && <AccountsTab />}
        {tab === 'config' && <ConfigTab />}
        {tab === 'ai' && <AiTab />}
        {tab === 'tickets' && <TicketsTab />}
        {tab === 'notifications' && <NotificationsTab />}
        {tab === 'risk' && <RiskTab />}
        {tab === 'security' && <SecurityTab />}
      </div>
    </div>
  );
}
