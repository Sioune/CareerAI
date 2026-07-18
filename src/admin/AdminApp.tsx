import { useEffect, useState, useCallback, useRef, type FormEvent } from 'react';
import { hasPermission, ROLES as ALL_ROLES, ROLE_LABEL, type PermModule } from '../shared/permissions.ts';

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

type PageKey =
  | 'overview' | 'todos' | 'monitor'
  | 'users' | 'benefits' | 'privacy' | 'tickets'
  | 'wallet' | 'giftCampaign' | 'marketingExpense'
  | 'tasks' | 'results' | 'qc' | 'failures' | 'files'
  | 'products' | 'orders' | 'refunds' | 'referrals'
  | 'finance' | 'allocation' | 'reconcile'
  | 'site' | 'notifications' | 'seo'
  | 'ai' | 'routing' | 'jd'
  | 'funnel' | 'campaigns' | 'risk' | 'blacklist'
  | 'accounts' | 'audit' | 'system' | 'security';

interface NavPage { key: PageKey; label: string; module: PermModule | null; planned?: boolean; alwaysVisible?: boolean; }
interface NavGroup { label: string; pages: NavPage[]; }

// PRD §3.1 后台一级导航（9 模块）。planned = Phase 2/3 规划中占位；
// module=null + alwaysVisible = 个人自助页（如 MFA），不受模块权限限制。
const NAV: NavGroup[] = [
  { label: '经营总览', pages: [
    { key: 'overview', label: '业务看板', module: 'overview' },
    { key: 'todos', label: '审批 · 待办与异常', module: 'approvals' },
    { key: 'monitor', label: '实时监控', module: 'overview', planned: true },
  ]},
  { label: '用户与客户', pages: [
    { key: 'users', label: '用户列表', module: 'users' },
    { key: 'benefits', label: '权益账本', module: 'users' },
    { key: 'wallet', label: '余额管理', module: 'finance' },
    { key: 'privacy', label: '隐私请求', module: 'users', planned: true },
    { key: 'tickets', label: '客服工单', module: 'tickets' },
  ]},
  { label: '任务与结果', pages: [
    { key: 'tasks', label: '任务列表', module: 'tasks' },
    { key: 'results', label: '结果版本', module: 'tasks', planned: true },
    { key: 'qc', label: '质量抽检', module: 'tasks', planned: true },
    { key: 'failures', label: '失败队列', module: 'tasks', planned: true },
    { key: 'files', label: '文件管理', module: 'tasks', planned: true },
  ]},
  { label: '商业化', pages: [
    { key: 'products', label: '商品与价格', module: 'products' },
    { key: 'orders', label: '订单与支付', module: 'payments' },
    { key: 'refunds', label: '退款', module: 'payments' },
    { key: 'referrals', label: '优惠 · 推荐', module: 'growth' },
  ]},
  { label: '财务分析', pages: [
    { key: 'finance', label: '账本 · Token成本 · 毛利', module: 'finance' },
    { key: 'allocation', label: '收入分配', module: 'finance' },
    { key: 'reconcile', label: '对账 · 结算报表', module: 'finance' },
    { key: 'giftCampaign', label: '注册赠送配置', module: 'finance' },
    { key: 'marketingExpense', label: '营销费用台账', module: 'finance' },
  ]},
  { label: '网站运营', pages: [
    { key: 'site', label: '品牌 · 页面/CMS · 法律', module: 'site' },
    { key: 'notifications', label: '公告 · 通知模板', module: 'site' },
    { key: 'seo', label: 'SEO', module: 'site', planned: true },
  ]},
  { label: 'AI与数据源', pages: [
    { key: 'ai', label: '供应商 · 模型 · 提示词', module: 'ai' },
    { key: 'routing', label: '路由 · 评测', module: 'ai', planned: true },
    { key: 'jd', label: 'JD来源', module: 'ai', planned: true },
  ]},
  { label: '增长与风控', pages: [
    { key: 'funnel', label: '漏斗 · 渠道', module: 'growth', planned: true },
    { key: 'campaigns', label: '活动', module: 'growth', planned: true },
    { key: 'risk', label: '风险规则', module: 'growth' },
    { key: 'blacklist', label: '黑名单', module: 'growth', planned: true },
  ]},
  { label: '系统与安全', pages: [
    { key: 'accounts', label: '管理员 · RBAC', module: 'rbac' },
    { key: 'audit', label: '审计日志', module: 'audit' },
    { key: 'system', label: 'Webhook · 队列 · 健康 · 集成', module: 'system', planned: true },
    { key: 'security', label: '我的安全设置', module: null, alwaysVisible: true },
  ]},
];

function pageVisible(p: NavPage, role: string): boolean {
  if (p.alwaysVisible) return true;
  if (!p.module) return false;
  return hasPermission(role, p.module, 'read');
}

function Nav({ page, setPage, onLogout, adminName, adminRole }: { page: PageKey; setPage: (p: PageKey) => void; onLogout: () => void; adminName: string; adminRole: string }) {
  const groups = NAV
    .map((g) => ({ ...g, pages: g.pages.filter((p) => pageVisible(p, adminRole)) }))
    .filter((g) => g.pages.length > 0);
  return (
    <div className="w-60 shrink-0 bg-slate-900 text-slate-100 min-h-screen flex flex-col">
      <div className="p-4 border-b border-slate-700">
        <p className="font-bold text-lg">CareerAI</p>
        <p className="text-xs text-slate-400">后台管理系统</p>
      </div>
      <nav className="flex-1 py-2 overflow-y-auto">
        {groups.map((g) => (
          <div key={g.label} className="mb-1">
            <p className="px-4 pt-3 pb-1 text-[11px] uppercase tracking-wide text-slate-500">{g.label}</p>
            {g.pages.map((p) => (
              <button
                key={p.key}
                onClick={() => setPage(p.key)}
                className={`w-full text-left px-4 py-2 text-sm flex items-center justify-between ${page === p.key ? 'bg-slate-700 text-white' : 'text-slate-300 hover:bg-slate-800'}`}
              >
                <span>{p.label}</span>
                {p.planned && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-300">规划中</span>}
              </button>
            ))}
          </div>
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

function ModelPricingSection() {
  const [prices, setPrices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [form, setForm] = useState({
    provider: 'gemini', model: 'gemini-3.5-flash',
    inputPerMillion: '', outputPerMillion: '',
    currency: 'CNY', source: 'official', effectiveAt: '',
  });

  const load = () => {
    setLoading(true);
    apiFetch('/api/admin/model-prices')
      .then((d) => { setPrices(d.prices || []); setError(''); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    setError(''); setMsg('');
    const inp = Number(form.inputPerMillion);
    const out = Number(form.outputPerMillion);
    if (!form.provider || !form.model) { setError('provider 和 model 不能为空'); return; }
    if (isNaN(inp) || isNaN(out) || form.inputPerMillion === '' || form.outputPerMillion === '') { setError('单价须为有效数字'); return; }
    if (!form.effectiveAt) { setError('生效日期时间不能为空'); return; }
    setSaving(true);
    try {
      await apiFetch('/api/admin/model-prices', {
        method: 'POST',
        body: JSON.stringify({ provider: form.provider, model: form.model, inputPerMillion: inp, outputPerMillion: out, currency: form.currency, source: form.source, effectiveAt: form.effectiveAt }),
      });
      setMsg('✅ 计价条目已保存，新计价对后续调用立即生效');
      setForm((f) => ({ ...f, effectiveAt: '' }));
      load();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-sm text-slate-800">💰 模型计价管理</h3>
          <p className="text-xs text-slate-400 mt-0.5">追加式不可篡改历史 · 单位：分（¥0.01）/ 百万 tokens · 生效日期后新调用使用新价格</p>
        </div>
        <button onClick={load} className="text-xs text-blue-600 hover:underline">刷新</button>
      </div>

      <div className="p-4 border-b border-slate-100 bg-amber-50/40">
        <p className="text-xs font-semibold text-amber-700 mb-2">新增计价条目（仅追加，历史成本记录不受影响）</p>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 mb-2">
          {[
            { label: 'Provider', field: 'provider', placeholder: 'gemini', type: 'text' },
            { label: '模型名称', field: 'model', placeholder: 'gemini-3.5-flash', type: 'text' },
            { label: 'Input 单价（分/百万）', field: 'inputPerMillion', placeholder: '70', type: 'number' },
            { label: 'Output 单价（分/百万）', field: 'outputPerMillion', placeholder: '280', type: 'number' },
          ].map((f) => (
            <div key={f.field}>
              <label className="block text-xs text-slate-500 mb-1">{f.label}</label>
              <input type={f.type} value={(form as any)[f.field]} placeholder={f.placeholder}
                onChange={(e) => setForm((prev) => ({ ...prev, [f.field]: e.target.value }))}
                className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-xs" />
            </div>
          ))}
          <div>
            <label className="block text-xs text-slate-500 mb-1">口径来源</label>
            <select value={form.source} onChange={(e) => setForm((p) => ({ ...p, source: e.target.value }))}
              className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-xs">
              <option value="official">官方公示</option>
              <option value="contract">合同价</option>
              <option value="invoice">账单核对</option>
              <option value="illustrative">示意估算</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">生效日期时间</label>
            <input type="datetime-local" value={form.effectiveAt}
              onChange={(e) => setForm((p) => ({ ...p, effectiveAt: e.target.value }))}
              className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-xs" />
          </div>
        </div>
        {error && <p className="text-xs text-red-600 mb-1">{error}</p>}
        {msg && <p className="text-xs text-emerald-600 mb-1">{msg}</p>}
        <button onClick={save} disabled={saving}
          className="bg-slate-900 text-white px-4 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50">
          {saving ? '保存中...' : '保存新计价'}
        </button>
      </div>

      <div className="overflow-x-auto max-h-64">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-xs sticky top-0">
            <tr>
              <th className="text-left px-3 py-2">Provider</th>
              <th className="text-left px-3 py-2">模型</th>
              <th className="text-right px-3 py-2">Input（分/M）</th>
              <th className="text-right px-3 py-2">Output（分/M）</th>
              <th className="text-left px-3 py-2">口径</th>
              <th className="text-left px-3 py-2">生效时间</th>
              <th className="text-left px-3 py-2">录入人</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="text-center text-slate-400 py-6">加载中...</td></tr>
            ) : prices.length === 0 ? (
              <tr><td colSpan={7} className="text-center text-slate-400 py-6">暂无计价记录，请通过上方表单录入第一条</td></tr>
            ) : prices.map((p, i) => (
              <tr key={p.id} className={`border-t border-slate-100 ${i === 0 ? 'bg-emerald-50/30' : ''}`}>
                <td className="px-3 py-2 font-mono text-xs text-slate-600">{p.provider}</td>
                <td className="px-3 py-2 font-mono text-xs">
                  {p.model}
                  {i === 0 && <span className="ml-1.5 text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-bold">当前生效</span>}
                </td>
                <td className="px-3 py-2 text-right font-mono text-xs text-indigo-600">{p.input_per_million}</td>
                <td className="px-3 py-2 text-right font-mono text-xs text-violet-600">{p.output_per_million}</td>
                <td className="px-3 py-2 text-xs text-slate-500">{p.source}</td>
                <td className="px-3 py-2 text-xs font-mono text-slate-500">{p.effective_at ? fmtDate(p.effective_at) : '—'}</td>
                <td className="px-3 py-2 text-xs text-slate-400">{p.created_by_admin || 'system'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TokenStatsSection() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    apiFetch('/api/admin/finance/token-stats?days=30')
      .then((d) => { setStats(d); setError(''); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  if (loading) return <p className="text-slate-500 text-sm">加载 Token 统计...</p>;
  if (error) return <p className="text-red-600 text-sm">Token统计加载失败: {error}</p>;
  if (!stats) return null;

  const s = stats.summary;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm text-slate-700">🤖 Token 消耗统计（精确口径）</h3>
        <button onClick={load} className="text-xs text-blue-600 hover:underline">刷新</button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card label="累计调用次数" value={s.calls.toLocaleString()} sub="次 AI 调用" />
        <Card label="累计 Input Tokens" value={s.totalTokensIn.toLocaleString()} sub="输入 tokens" />
        <Card label="累计 Output Tokens" value={s.totalTokensOut.toLocaleString()} sub="输出 tokens" />
        <Card label="AI 成本（基于计价）" value={`¥${(s.totalCostCents / 100).toFixed(4)}`} sub={`精确 ${(s.totalMicroCents / 1e6).toFixed(4)} 分`} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-3 py-2 bg-slate-50 border-b border-slate-100">
            <p className="text-xs font-semibold text-slate-600">按模型汇总</p>
          </div>
          <table className="w-full text-xs">
            <thead className="bg-slate-50/50 text-slate-500"><tr>
              <th className="text-left px-3 py-1.5">模型</th>
              <th className="text-right px-3 py-1.5">调用</th>
              <th className="text-right px-3 py-1.5">In Tokens</th>
              <th className="text-right px-3 py-1.5">Out Tokens</th>
              <th className="text-right px-3 py-1.5">成本(¥)</th>
            </tr></thead>
            <tbody>
              {stats.byModel.length === 0 ? (
                <tr><td colSpan={5} className="text-center text-slate-400 py-4">暂无数据</td></tr>
              ) : stats.byModel.map((r: any, i: number) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="px-3 py-1.5 font-mono">{r.model}</td>
                  <td className="px-3 py-1.5 text-right">{r.calls}</td>
                  <td className="px-3 py-1.5 text-right text-indigo-600">{r.tokensIn.toLocaleString()}</td>
                  <td className="px-3 py-1.5 text-right text-violet-600">{r.tokensOut.toLocaleString()}</td>
                  <td className="px-3 py-1.5 text-right text-emerald-600">{(r.costCents / 100).toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-3 py-2 bg-slate-50 border-b border-slate-100">
            <p className="text-xs font-semibold text-slate-600">按操作类型汇总</p>
          </div>
          <table className="w-full text-xs">
            <thead className="bg-slate-50/50 text-slate-500"><tr>
              <th className="text-left px-3 py-1.5">操作</th>
              <th className="text-right px-3 py-1.5">调用</th>
              <th className="text-right px-3 py-1.5">In</th>
              <th className="text-right px-3 py-1.5">Out</th>
              <th className="text-right px-3 py-1.5">成本(¥)</th>
            </tr></thead>
            <tbody>
              {stats.byOperation.length === 0 ? (
                <tr><td colSpan={5} className="text-center text-slate-400 py-4">暂无数据（尚无 AI 调用）</td></tr>
              ) : stats.byOperation.map((r: any, i: number) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="px-3 py-1.5 font-mono">{r.operation}</td>
                  <td className="px-3 py-1.5 text-right">{r.calls}</td>
                  <td className="px-3 py-1.5 text-right text-indigo-600">{r.tokensIn.toLocaleString()}</td>
                  <td className="px-3 py-1.5 text-right text-violet-600">{r.tokensOut.toLocaleString()}</td>
                  <td className="px-3 py-1.5 text-right text-emerald-600">{(r.costCents / 100).toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {stats.byDay && stats.byDay.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-3 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-600">近30天逐日消耗（Asia/Shanghai）</p>
          </div>
          <div className="overflow-x-auto max-h-48">
            <table className="w-full text-xs">
              <thead className="bg-slate-50/50 text-slate-500 sticky top-0"><tr>
                <th className="text-left px-3 py-1.5">业务日</th>
                <th className="text-right px-3 py-1.5">调用</th>
                <th className="text-right px-3 py-1.5">In Tokens</th>
                <th className="text-right px-3 py-1.5">Out Tokens</th>
                <th className="text-right px-3 py-1.5">成本(¥)</th>
              </tr></thead>
              <tbody>
                {stats.byDay.map((r: any, i: number) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="px-3 py-1.5 font-mono">{r.bizDate}</td>
                    <td className="px-3 py-1.5 text-right">{r.calls}</td>
                    <td className="px-3 py-1.5 text-right text-indigo-600">{r.tokensIn.toLocaleString()}</td>
                    <td className="px-3 py-1.5 text-right text-violet-600">{r.tokensOut.toLocaleString()}</td>
                    <td className="px-3 py-1.5 text-right text-emerald-600">{(r.costCents / 100).toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {stats.recent && stats.recent.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-3 py-2 bg-slate-50 border-b border-slate-100">
            <p className="text-xs font-semibold text-slate-600">最近调用明细（最新200条）</p>
          </div>
          <div className="overflow-x-auto max-h-56">
            <table className="w-full text-xs">
              <thead className="bg-slate-50/50 text-slate-500 sticky top-0"><tr>
                <th className="text-left px-3 py-1.5">操作</th>
                <th className="text-left px-3 py-1.5">模型</th>
                <th className="text-right px-3 py-1.5">In</th>
                <th className="text-right px-3 py-1.5">Out</th>
                <th className="text-right px-3 py-1.5">成本(¥)</th>
                <th className="text-left px-3 py-1.5">时间</th>
              </tr></thead>
              <tbody>
                {stats.recent.map((r: any, i: number) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="px-3 py-1 font-mono">{r.operation}</td>
                    <td className="px-3 py-1 text-slate-500 font-mono">{r.model}</td>
                    <td className="px-3 py-1 text-right text-indigo-600">{(r.tokens_in || 0).toLocaleString()}</td>
                    <td className="px-3 py-1 text-right text-violet-600">{(r.tokens_out || 0).toLocaleString()}</td>
                    <td className="px-3 py-1 text-right text-emerald-600">{((r.cost_micro_cents || 0) / 1e8).toFixed(6)}</td>
                    <td className="px-3 py-1 text-slate-400">{fmtDate(r.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function FinanceTab() {
  const [data, setData] = useState<any>(null);
  const [summary, setSummary] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch('/api/admin/finance/costs').then(setData).catch((e) => setError(e.message));
    apiFetch('/api/admin/finance/summary').then(setSummary).catch(() => {});
  }, []);

  if (error) return <p className="text-red-600 text-sm">{error}</p>;
  if (!data) return <p className="text-slate-500 text-sm">加载中...</p>;

  return (
    <div className="space-y-8">
      <h2 className="text-lg font-bold text-slate-900">财务闭环 · 账本 / Token 成本 / 毛利</h2>

      {summary && (
        <>
          <div>
            <h3 className="font-semibold text-sm mb-2 text-slate-700">现金口径（资金账本汇总）</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card label="现金收入" value={fmtMoney(summary.cashInCents)} sub="PAYMENT_RECEIVED" />
              <Card label="退款流出" value={fmtMoney(summary.refundCents)} sub="REFUND" />
              <Card label="渠道手续费(估)" value={fmtMoney(summary.feeCents)} sub="示意口径 ≈0.6%" />
              <Card label="净现金" value={fmtMoney(summary.netCashCents)} sub="现金收入−退款−手续费" />
            </div>
          </div>
          <div>
            <h3 className="font-semibold text-sm mb-2 text-slate-700">履约口径与毛利</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card label="已确认履约收入(净)" value={fmtMoney(summary.recognizedNetCents)} sub={`已冲销 ${fmtMoney(summary.reversalCents)}`} />
              <Card label="待确认收入(递延)" value={fmtMoney(summary.deferredCents)} sub="已收现金但未履约" />
              <Card label="AI Token 成本" value={fmtMoney(summary.totalCostCents)} sub={`精确 ${(summary.totalCostMicroCents / 1e6).toFixed(4)} 分`} />
              <Card label="毛利(履约口径)" value={fmtMoney(summary.grossMarginCents)} sub={summary.grossMarginPct !== null ? `毛利率 ${summary.grossMarginPct}%` : '暂无已确认收入'} />
            </div>
          </div>
        </>
      )}

      <TokenStatsSection />

      <ModelPricingSection />
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

function VersionStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    published: { label: '已发布', cls: 'bg-green-100 text-green-700' },
    draft: { label: '草稿', cls: 'bg-amber-100 text-amber-700' },
    pending: { label: '审批中', cls: 'bg-blue-100 text-blue-700' },
    archived: { label: '已归档', cls: 'bg-slate-100 text-slate-500' },
  };
  const it = map[status] || { label: status, cls: 'bg-slate-100 text-slate-500' };
  return <span className={`px-2 py-0.5 rounded-full text-xs ${it.cls}`}>{it.label}</span>;
}

type ConfigKey = 'brand' | 'app_version' | 'maintenance_banner' | 'footer' | 'homepage_copy';

function useConfigSection(configKey: ConfigKey) {
  const [current, setCurrent] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    try {
      const all = await apiFetch('/api/admin/config');
      const rows: any[] = (all.configs || []).filter((c: any) => c.key === configKey);
      rows.sort((a: any, b: any) => b.version - a.version);
      setHistory(rows);
      const pub = rows.find((r: any) => r.status === 'published');
      const draft = rows.find((r: any) => r.status === 'draft');
      const active = draft || pub;
      if (active) {
        try { setCurrent(JSON.parse(active.value)); } catch { setCurrent({}); }
      }
    } catch (e: any) { setError(e.message); }
  }, [configKey]);

  useEffect(() => { load(); }, [load]);

  const saveDraft = async (value: any) => {
    setError(''); setMsg(''); setSaving(true);
    try {
      await apiFetch('/api/admin/config', { method: 'POST', body: JSON.stringify({ key: configKey, value }) });
      setMsg('✅ 已保存草稿，点击「提交发布」后生效');
      load();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  const submitPublish = async (id: number) => {
    setError(''); setMsg('');
    try { const d = await apiFetch(`/api/admin/config/${id}/publish`, { method: 'POST' }); setMsg(d.message || '✅ 已提交发布审批'); load(); }
    catch (e: any) { setError(e.message); }
  };

  const rollback = async (id: number) => {
    setError(''); setMsg('');
    if (!confirm('确认回滚到该历史版本？将立即生效并归档当前已发布版本。')) return;
    try { const d = await apiFetch(`/api/admin/config/${id}/rollback`, { method: 'POST' }); setMsg(d.message || '✅ 已回滚'); load(); }
    catch (e: any) { setError(e.message); }
  };

  return { current, history, saving, error, msg, saveDraft, submitPublish, rollback, setMsg, setError };
}

function SectionShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
        <h3 className="font-semibold text-sm text-slate-800">{title}</h3>
        <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function ConfigHistoryTable({ history, onPublish, onRollback }: { history: any[]; onPublish: (id: number) => void; onRollback: (id: number) => void }) {
  if (history.length === 0) return <p className="text-xs text-slate-400 mt-2">暂无版本历史</p>;
  return (
    <div className="mt-3 bg-slate-50 rounded-lg overflow-hidden border border-slate-100">
      <table className="w-full text-xs">
        <thead className="text-slate-500 bg-slate-100"><tr>
          <th className="text-left px-3 py-1.5">版本</th>
          <th className="text-left px-3 py-1.5">状态</th>
          <th className="text-left px-3 py-1.5">编辑人</th>
          <th className="text-left px-3 py-1.5">时间</th>
          <th className="px-3 py-1.5"></th>
        </tr></thead>
        <tbody>
          {history.map((c) => (
            <tr key={c.id} className="border-t border-slate-100">
              <td className="px-3 py-1.5 font-mono">v{c.version}</td>
              <td className="px-3 py-1.5"><VersionStatusBadge status={c.status} /></td>
              <td className="px-3 py-1.5 text-slate-500">{c.editedByAdmin || '-'}</td>
              <td className="px-3 py-1.5 text-slate-400">{c.updatedAt ? new Date(c.updatedAt).toLocaleString('zh-CN') : '-'}</td>
              <td className="px-3 py-1.5 whitespace-nowrap">
                {c.status === 'draft' && <button onClick={() => onPublish(c.id)} className="text-blue-600 hover:underline">提交发布</button>}
                {c.status === 'pending' && <span className="text-blue-500">审批中</span>}
                {c.status === 'archived' && <button onClick={() => onRollback(c.id)} className="text-amber-600 hover:underline">回滚</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BrandSection() {
  const { current, history, saving, error, msg, saveDraft, submitPublish, rollback } = useConfigSection('brand');
  const [form, setForm] = useState({ name_zh: '', name_en: '', logo_url: '', favicon_url: '', primary_color: '#2563eb' });
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState('');
  const [uploadError, setUploadError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (current) setForm({ name_zh: current.name_zh || '', name_en: current.name_en || '', logo_url: current.logo_url || '', favicon_url: current.favicon_url || '', primary_color: current.primary_color || '#2563eb' });
  }, [current]);

  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((p) => ({ ...p, [k]: e.target.value }));

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(''); setUploadMsg(''); setUploading(true);
    try {
      const token = localStorage.getItem('careerai_admin_token');
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/admin/upload/logo', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '上传失败');
      setForm((p) => ({ ...p, logo_url: data.logo_url, favicon_url: data.favicon_url }));
      setUploadMsg(`✅ 上传成功！Favicon 已自动生成（64×64 PNG）`);
    } catch (err: any) {
      setUploadError(err.message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <SectionShell title="🎨 品牌 / 外观" subtitle="系统名称、Logo 上传、Favicon 自动生成、主色 — 发布后立即应用至前端">
      {error && <p className="text-red-600 text-xs mb-2">{error}</p>}
      {msg && <p className="text-emerald-600 text-xs mb-2">{msg}</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        <div><label className="block text-xs text-slate-500 mb-1">系统名称（中文）</label><input className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm" value={form.name_zh} onChange={f('name_zh')} placeholder="CareerAI" /></div>
        <div><label className="block text-xs text-slate-500 mb-1">系统名称（英文）</label><input className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm" value={form.name_en} onChange={f('name_en')} placeholder="CareerAI" /></div>
      </div>

      <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 mb-4">
        <p className="text-xs font-semibold text-slate-700 mb-3">Logo 上传 <span className="font-normal text-slate-400">（支持 JPG / PNG / WebP / SVG，≤5MB；上传后 Favicon 自动从 Logo 裁剪生成 64×64 PNG）</span></p>
        <div className="flex gap-4 items-start">
          {form.logo_url && (
            <div className="shrink-0">
              <p className="text-[10px] text-slate-400 mb-1 text-center">Logo 预览</p>
              <img src={form.logo_url} alt="logo preview" className="w-20 h-20 object-contain rounded-lg border border-slate-200 bg-white p-1" />
            </div>
          )}
          {form.favicon_url && form.favicon_url !== form.logo_url && (
            <div className="shrink-0">
              <p className="text-[10px] text-slate-400 mb-1 text-center">Favicon 预览</p>
              <img src={form.favicon_url} alt="favicon preview" className="w-12 h-12 object-contain rounded-lg border border-slate-200 bg-white p-1" />
            </div>
          )}
          <div className="flex-1">
            <input ref={fileRef} type="file" accept="image/jpeg,image/jpg,image/png,image/webp,image/gif,image/svg+xml" className="hidden" onChange={handleFileChange} />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors"
            >
              {uploading ? '上传中...' : '📁 选择图片并上传'}
            </button>
            {uploadMsg && <p className="text-emerald-600 text-xs mt-2">{uploadMsg}</p>}
            {uploadError && <p className="text-red-600 text-xs mt-2">{uploadError}</p>}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Logo URL <span className="text-slate-400">（上传后自动填入，也可手动填写外链）</span></label>
            <input className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-mono bg-white" value={form.logo_url} onChange={f('logo_url')} placeholder="/uploads/logo-xxx.png 或 https://..." />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Favicon URL <span className="text-slate-400">（上传后自动生成，也可手动覆盖）</span></label>
            <input className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-mono bg-white" value={form.favicon_url} onChange={f('favicon_url')} placeholder="/uploads/favicon-xxx.png" />
          </div>
        </div>
      </div>

      <div className="mb-4">
        <label className="block text-xs text-slate-500 mb-1">品牌主色（十六进制）</label>
        <div className="flex gap-2 items-center">
          <input type="color" value={form.primary_color} onChange={f('primary_color')} className="h-9 w-12 rounded border border-slate-300 cursor-pointer" />
          <input className="flex-1 border border-slate-300 rounded-lg px-3 py-1.5 text-sm font-mono" value={form.primary_color} onChange={f('primary_color')} placeholder="#2563eb" />
        </div>
      </div>

      <button onClick={() => saveDraft(form)} disabled={saving} className="bg-slate-900 text-white px-4 py-1.5 rounded-lg text-sm disabled:opacity-50">{saving ? '保存中...' : '保存草稿'}</button>
      <ConfigHistoryTable history={history} onPublish={submitPublish} onRollback={rollback} />
    </SectionShell>
  );
}

function AppVersionSection() {
  const { current, history, saving, error, msg, saveDraft, submitPublish, rollback } = useConfigSection('app_version');
  const [form, setForm] = useState({ version: '', release_notes_zh: '', release_notes_en: '' });
  useEffect(() => { if (current) setForm({ version: current.version || '', release_notes_zh: current.release_notes_zh || '', release_notes_en: current.release_notes_en || '' }); }, [current]);
  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((p) => ({ ...p, [k]: e.target.value }));
  return (
    <SectionShell title="🏷️ 版本号 · 更新日志" subtitle="版本号显示在导航栏徽章；更新日志显示在「版本公告」弹窗">
      {error && <p className="text-red-600 text-xs mb-2">{error}</p>}
      {msg && <p className="text-emerald-600 text-xs mb-2">{msg}</p>}
      <div className="grid grid-cols-1 gap-3 mb-3">
        <div><label className="block text-xs text-slate-500 mb-1">版本号（显示在导航徽章，如 v1.2.0）</label><input className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm font-mono" value={form.version} onChange={f('version')} placeholder="v0.4 PRO" /></div>
        <div><label className="block text-xs text-slate-500 mb-1">更新日志（中文，Markdown 支持）</label><textarea className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm" rows={4} value={form.release_notes_zh} onChange={f('release_notes_zh')} placeholder="## 本版更新&#10;- 新功能：..." /></div>
        <div><label className="block text-xs text-slate-500 mb-1">更新日志（English）</label><textarea className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm" rows={4} value={form.release_notes_en} onChange={f('release_notes_en')} placeholder="## What's New&#10;- Feature: ..." /></div>
      </div>
      <button onClick={() => saveDraft(form)} disabled={saving} className="bg-slate-900 text-white px-4 py-1.5 rounded-lg text-sm disabled:opacity-50">{saving ? '保存中...' : '保存草稿'}</button>
      <ConfigHistoryTable history={history} onPublish={submitPublish} onRollback={rollback} />
    </SectionShell>
  );
}

function MaintenanceBannerSection() {
  const { current, history, saving, error, msg, saveDraft, submitPublish, rollback } = useConfigSection('maintenance_banner');
  const [form, setForm] = useState({ enabled: false, text_zh: '', text_en: '' });
  useEffect(() => { if (current) setForm({ enabled: !!current.enabled, text_zh: current.text_zh || '', text_en: current.text_en || '' }); }, [current]);
  return (
    <SectionShell title="🔔 全站维护公告 Banner" subtitle="开启后，前端顶部显示黄色横幅通知；关闭后立即消失">
      {error && <p className="text-red-600 text-xs mb-2">{error}</p>}
      {msg && <p className="text-emerald-600 text-xs mb-2">{msg}</p>}
      <div className="grid grid-cols-1 gap-3 mb-3">
        <div className="flex items-center gap-3">
          <label className="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" checked={form.enabled} onChange={(e) => setForm((p) => ({ ...p, enabled: e.target.checked }))} className="sr-only peer" />
            <div className="w-11 h-6 bg-slate-200 rounded-full peer peer-checked:bg-amber-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-5"></div>
          </label>
          <span className={`text-sm font-semibold ${form.enabled ? 'text-amber-600' : 'text-slate-400'}`}>{form.enabled ? '⚠️ Banner 当前开启' : 'Banner 当前关闭'}</span>
        </div>
        <div><label className="block text-xs text-slate-500 mb-1">公告文字（中文）</label><input className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm" value={form.text_zh} onChange={(e) => setForm((p) => ({ ...p, text_zh: e.target.value }))} placeholder="系统将于今晚 22:00–23:00 进行维护，期间暂停服务。" /></div>
        <div><label className="block text-xs text-slate-500 mb-1">公告文字（English）</label><input className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm" value={form.text_en} onChange={(e) => setForm((p) => ({ ...p, text_en: e.target.value }))} placeholder="Scheduled maintenance tonight 22:00–23:00. Service will be temporarily unavailable." /></div>
      </div>
      <button onClick={() => saveDraft(form)} disabled={saving} className="bg-slate-900 text-white px-4 py-1.5 rounded-lg text-sm disabled:opacity-50">{saving ? '保存中...' : '保存草稿'}</button>
      <ConfigHistoryTable history={history} onPublish={submitPublish} onRollback={rollback} />
    </SectionShell>
  );
}

function FooterSection() {
  const { current, history, saving, error, msg, saveDraft, submitPublish, rollback } = useConfigSection('footer');
  const [form, setForm] = useState({ copyright: '', icp_number: '', contact_email: '', social_links_raw: '[]', terms_text: '', privacy_text: '' });
  useEffect(() => {
    if (current) setForm({
      copyright: current.copyright || '',
      icp_number: current.icp_number || '',
      contact_email: current.contact_email || '',
      social_links_raw: JSON.stringify(current.social_links || [], null, 2),
      terms_text: current.terms_text || '',
      privacy_text: current.privacy_text || '',
    });
  }, [current]);
  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((p) => ({ ...p, [k]: e.target.value }));
  const handleSave = () => {
    let social_links: any[] = [];
    try { social_links = JSON.parse(form.social_links_raw); } catch { alert('社交链接 JSON 格式错误，请检查'); return; }
    saveDraft({ copyright: form.copyright, icp_number: form.icp_number, contact_email: form.contact_email, social_links, terms_text: form.terms_text, privacy_text: form.privacy_text });
  };
  return (
    <SectionShell title="📄 页脚配置" subtitle="版权文字、ICP 备案号、客服邮箱、社交媒体链接、法律链接文字">
      {error && <p className="text-red-600 text-xs mb-2">{error}</p>}
      {msg && <p className="text-emerald-600 text-xs mb-2">{msg}</p>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
        <div className="md:col-span-2"><label className="block text-xs text-slate-500 mb-1">版权声明文字</label><input className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm" value={form.copyright} onChange={f('copyright')} placeholder="© 2026 CareerAI Executive Search. All rights reserved." /></div>
        <div><label className="block text-xs text-slate-500 mb-1">ICP 备案号（留空则不显示）</label><input className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm font-mono" value={form.icp_number} onChange={f('icp_number')} placeholder="京ICP备XXXXXXXX号" /></div>
        <div><label className="block text-xs text-slate-500 mb-1">客服邮箱</label><input type="email" className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm" value={form.contact_email} onChange={f('contact_email')} placeholder="support@example.com" /></div>
        <div><label className="block text-xs text-slate-500 mb-1">服务条款链接文字</label><input className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm" value={form.terms_text} onChange={f('terms_text')} placeholder="Terms of Service / 服务条款" /></div>
        <div><label className="block text-xs text-slate-500 mb-1">隐私政策链接文字</label><input className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm" value={form.privacy_text} onChange={f('privacy_text')} placeholder="Privacy Policy / 隐私政策" /></div>
        <div className="md:col-span-2">
          <label className="block text-xs text-slate-500 mb-1">社交媒体链接（JSON 数组，格式：{`[{"name":"微信公众号","url":"https://..."}]`}）</label>
          <textarea className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm font-mono" rows={3} value={form.social_links_raw} onChange={f('social_links_raw')} />
        </div>
      </div>
      <button onClick={handleSave} disabled={saving} className="bg-slate-900 text-white px-4 py-1.5 rounded-lg text-sm disabled:opacity-50">{saving ? '保存中...' : '保存草稿'}</button>
      <ConfigHistoryTable history={history} onPublish={submitPublish} onRollback={rollback} />
    </SectionShell>
  );
}

function HomepageCopySection() {
  const { current, history, saving, error, msg, saveDraft, submitPublish, rollback } = useConfigSection('homepage_copy');
  const [form, setForm] = useState({ hero_title_zh: '', hero_title_en: '', hero_subtitle_zh: '', hero_subtitle_en: '', cta_zh: '', cta_en: '' });
  useEffect(() => {
    if (current) setForm({ hero_title_zh: current.hero_title_zh || '', hero_title_en: current.hero_title_en || '', hero_subtitle_zh: current.hero_subtitle_zh || '', hero_subtitle_en: current.hero_subtitle_en || '', cta_zh: current.cta_zh || '', cta_en: current.cta_en || '' });
  }, [current]);
  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((p) => ({ ...p, [k]: e.target.value }));
  return (
    <SectionShell title="🏠 首页文案" subtitle="Hero 标题、副标题、CTA 按钮文字 — 发布后前端立即使用（中英文各一套）">
      {error && <p className="text-red-600 text-xs mb-2">{error}</p>}
      {msg && <p className="text-emerald-600 text-xs mb-2">{msg}</p>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
        <div><label className="block text-xs text-slate-500 mb-1">Hero 主标题（中文）</label><input className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm" value={form.hero_title_zh} onChange={f('hero_title_zh')} placeholder="AI 驱动的高管简历优化器" /></div>
        <div><label className="block text-xs text-slate-500 mb-1">Hero 主标题（English）</label><input className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm" value={form.hero_title_en} onChange={f('hero_title_en')} placeholder="AI-Powered Executive Resume Optimizer" /></div>
        <div><label className="block text-xs text-slate-500 mb-1">副标题（中文）</label><input className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm" value={form.hero_subtitle_zh} onChange={f('hero_subtitle_zh')} placeholder="针对目标岗位 JD，精准重构高管领导力叙事" /></div>
        <div><label className="block text-xs text-slate-500 mb-1">副标题（English）</label><input className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm" value={form.hero_subtitle_en} onChange={f('hero_subtitle_en')} placeholder="Precisely restructure executive narratives for target JDs" /></div>
        <div><label className="block text-xs text-slate-500 mb-1">CTA 按钮文字（中文）</label><input className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm" value={form.cta_zh} onChange={f('cta_zh')} placeholder="立即体验" /></div>
        <div><label className="block text-xs text-slate-500 mb-1">CTA 按钮文字（English）</label><input className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm" value={form.cta_en} onChange={f('cta_en')} placeholder="Get Started" /></div>
      </div>
      <button onClick={() => saveDraft(form)} disabled={saving} className="bg-slate-900 text-white px-4 py-1.5 rounded-lg text-sm disabled:opacity-50">{saving ? '保存中...' : '保存草稿'}</button>
      <ConfigHistoryTable history={history} onPublish={submitPublish} onRollback={rollback} />
    </SectionShell>
  );
}

function ConfigTab() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-900">站点配置 / CMS</h2>
        <p className="text-xs text-slate-400 mt-0.5">每个区块独立版本管理 · 草稿 → 提交审批 → 已发布 → 可回滚 · 发布后前端立即读取新值</p>
      </div>
      <BrandSection />
      <AppVersionSection />
      <MaintenanceBannerSection />
      <FooterSection />
      <HomepageCopySection />
    </div>
  );
}

function AiTab() {
  const [providers, setProviders] = useState<any[]>([]);
  const [models, setModels] = useState<any[]>([]);
  const [prompts, setPrompts] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
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
    setError(''); setMsg('');
    try {
      await apiFetch('/api/admin/ai/prompts', { method: 'POST', body: JSON.stringify({ operation: promptOp, content: promptContent }) });
      setPromptOp(''); setPromptContent('');
      load();
    } catch (e: any) { setError(e.message); }
  };
  const submitPublishPrompt = async (id: number) => {
    setError(''); setMsg('');
    try { const d = await apiFetch(`/api/admin/ai/prompts/${id}/publish`, { method: 'POST' }); setMsg(d.message || '已提交发布审批'); load(); }
    catch (e: any) { setError(e.message); }
  };
  const rollbackPrompt = async (id: number) => {
    setError(''); setMsg('');
    if (!confirm('确认回滚到该历史提示词版本？将立即生效并归档当前已发布版本。')) return;
    try { const d = await apiFetch(`/api/admin/ai/prompts/${id}/rollback`, { method: 'POST' }); setMsg(d.message || '已回滚'); load(); }
    catch (e: any) { setError(e.message); }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-slate-900">AI 模型 / 提示词管理</h2>
      {error && <p className="text-red-600 text-sm">{error}</p>}
      {msg && <p className="text-emerald-600 text-sm">{msg}</p>}

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
                  <td className="px-3 py-2"><VersionStatusBadge status={p.status} /></td>
                  <td className="px-3 py-2 text-slate-500 max-w-xs truncate text-xs">{p.content}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {p.status === 'draft' && <button onClick={() => submitPublishPrompt(p.id)} className="text-blue-600 hover:underline text-xs">提交发布审批</button>}
                    {p.status === 'pending' && <span className="text-blue-500 text-xs">审批中</span>}
                    {p.status === 'archived' && <button onClick={() => rollbackPrompt(p.id)} className="text-amber-600 hover:underline text-xs">回滚到此版本</button>}
                  </td>
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

const APPROVAL_STATUS_LABEL: Record<string, string> = {
  PENDING: '待审批', APPROVED: '已通过', REJECTED: '已拒绝', CANCELED: '已取消', EXPIRED: '已过期',
};
const APPROVAL_TYPE_LABEL: Record<string, string> = {
  refund: '退款', price_publish: '价格发布', config_publish: '配置发布', prompt_publish: '提示词发布',
  account_adjust: '账务调整', bulk_export: '批量导出', key_rotation: '密钥轮换', bulk_delete: '批量删除', other: '其他',
};

function ApprovalsTab({ adminUsername, adminRole }: { adminUsername: string; adminRole: string }) {
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');
  const [rejectTarget, setRejectTarget] = useState<any>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);

  const canDecide = hasPermission(adminRole, 'approvals', 'write');

  const load = useCallback(() => {
    apiFetch('/api/admin/approvals').then((d) => { setRows(d.approvals || []); setTotal(d.total || 0); }).catch((e) => setError(e.message));
  }, []);
  useEffect(() => { load(); }, [load]);

  const canActOn = (r: any) => r.status === 'PENDING' && canDecide && (adminRole === 'super_admin' || r.requestedByAdmin !== adminUsername);

  const approve = async (id: number) => {
    setBusyId(id); setError('');
    try { await apiFetch(`/api/admin/approvals/${id}/approve`, { method: 'POST' }); load(); }
    catch (e: any) { setError(e.message); }
    finally { setBusyId(null); }
  };
  const submitReject = async () => {
    if (!rejectTarget) return;
    setBusyId(rejectTarget.id);
    try {
      await apiFetch(`/api/admin/approvals/${rejectTarget.id}/reject`, { method: 'POST', body: JSON.stringify({ reason: rejectReason }) });
      setRejectTarget(null); setRejectReason(''); load();
    } catch (e: any) { setError(e.message); }
    finally { setBusyId(null); }
  };

  return (
    <div>
      <h2 className="text-lg font-bold text-slate-900 mb-1">审批中心 ({total})</h2>
      <p className="text-xs text-slate-400 mb-3">Maker-Checker 双人复核：高风险动作统一在此审批。发起人不能审批自己提交的申请（超级管理员除外）。</p>
      {error && <p className="text-red-600 text-sm mb-2">{error}</p>}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-xs">
            <tr>
              <th className="text-left px-3 py-2">#</th>
              <th className="text-left px-3 py-2">类型</th>
              <th className="text-left px-3 py-2">对象</th>
              <th className="text-left px-3 py-2">金额</th>
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
                <td className="px-3 py-2 text-slate-400">{r.id}</td>
                <td className="px-3 py-2">{APPROVAL_TYPE_LABEL[r.type] || r.type}</td>
                <td className="px-3 py-2 text-slate-500 font-mono text-xs">{r.targetType ? `${r.targetType}#${r.targetId}` : (r.targetId ?? '-')}</td>
                <td className="px-3 py-2">{typeof r.amount === 'number' ? fmtMoney(r.amount) : '-'}</td>
                <td className="px-3 py-2 text-slate-500">{r.reason || '-'}</td>
                <td className="px-3 py-2">
                  {r.status === 'PENDING' ? <span className="text-amber-600">待审批</span>
                    : r.status === 'APPROVED' ? <span className="text-emerald-600">已通过</span>
                    : r.status === 'REJECTED' ? <span className="text-slate-400">已拒绝</span>
                    : <span className="text-slate-400">{APPROVAL_STATUS_LABEL[r.status] || r.status}</span>}
                </td>
                <td className="px-3 py-2 text-slate-500">{r.requestedByAdmin || '-'}</td>
                <td className="px-3 py-2 text-slate-500">{r.approvedByAdmin || '-'}</td>
                <td className="px-3 py-2 text-slate-500">{fmtDate(r.createdAt)}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {r.status === 'PENDING' && (
                    canActOn(r) ? (
                      <>
                        <button disabled={busyId === r.id} onClick={() => approve(r.id)} className="text-emerald-600 hover:underline mr-3 disabled:opacity-50">通过</button>
                        <button disabled={busyId === r.id} onClick={() => { setRejectTarget(r); setRejectReason(''); }} className="text-red-600 hover:underline disabled:opacity-50">拒绝</button>
                      </>
                    ) : (
                      <span className="text-xs text-slate-400">{canDecide ? '待他人审批' : '只读'}</span>
                    )
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={10} className="text-center text-slate-400 py-6">暂无待办</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {rejectTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setRejectTarget(null)}>
          <div className="bg-white rounded-xl max-w-sm w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">拒绝审批单 #{rejectTarget.id}</h3>
            <label className="block text-sm text-slate-600 mb-1">拒绝原因</label>
            <textarea className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-3" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={3} />
            <div className="flex justify-end gap-2">
              <button onClick={() => setRejectTarget(null)} className="px-4 py-2 text-sm rounded-lg border border-slate-300">取消</button>
              <button onClick={submitReject} disabled={busyId === rejectTarget.id} className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white disabled:opacity-50">确认拒绝</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ProductsTab() {
  const [tree, setTree] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  // new product
  const [pCode, setPCode] = useState('');
  const [pName, setPName] = useState('');
  const [pDesc, setPDesc] = useState('');
  // new sku
  const [skuProductId, setSkuProductId] = useState<number | ''>('');
  const [sCode, setSCode] = useState('');
  const [sName, setSName] = useState('');
  const [sRole, setSRole] = useState('');
  // new price
  const [priceSkuId, setPriceSkuId] = useState<number | ''>('');
  const [priceYuan, setPriceYuan] = useState('');
  const [priceEffective, setPriceEffective] = useState('');

  const load = useCallback(() => {
    apiFetch('/api/admin/products').then((d) => setTree(d.products || [])).catch((e) => setError(e.message));
  }, []);
  useEffect(() => { load(); }, [load]);

  const allSkus = tree.flatMap((p: any) => (p.skus || []).map((s: any) => ({ ...s, productName: p.name })));

  const wrap = async (fn: () => Promise<any>) => {
    setError(''); setMsg('');
    try { const d = await fn(); if (d?.message) setMsg(d.message); load(); return d; }
    catch (e: any) { setError(e.message); }
  };

  const createProduct = () => wrap(async () => {
    const d = await apiFetch('/api/admin/products', { method: 'POST', body: JSON.stringify({ code: pCode, name: pName, description: pDesc }) });
    setPCode(''); setPName(''); setPDesc(''); return d;
  });
  const createSku = () => wrap(async () => {
    const d = await apiFetch('/api/admin/skus', { method: 'POST', body: JSON.stringify({ productId: skuProductId, code: sCode, name: sName, targetRole: sRole }) });
    setSCode(''); setSName(''); setSRole(''); return d;
  });
  const createPrice = () => wrap(async () => {
    const cents = Math.round(parseFloat(priceYuan) * 100);
    if (!Number.isFinite(cents) || cents < 0) throw new Error('请输入有效的价格（元）');
    const d = await apiFetch('/api/admin/prices', { method: 'POST', body: JSON.stringify({ skuId: priceSkuId, amount: cents, effectiveAt: priceEffective || undefined }) });
    setPriceYuan(''); setPriceEffective(''); return d;
  });
  const submitPrice = (id: number) => wrap(() => apiFetch(`/api/admin/prices/${id}/publish`, { method: 'POST' }));
  const rollbackPrice = (id: number) => {
    if (!confirm('确认回滚到该历史价格版本？将立即生效并归档当前已发布版本。')) return;
    return wrap(() => apiFetch(`/api/admin/prices/${id}/rollback`, { method: 'POST' }));
  };

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-slate-900 mb-1">商品与价格（版本化 + 发布审批 + 回滚）</h2>
      <p className="text-xs text-slate-400">商品 → 规格(SKU) → 价格版本。价格发布须经审批中心复核（Maker-Checker）；下单时会记录当时生效价格快照。</p>
      {error && <p className="text-red-600 text-sm">{error}</p>}
      {msg && <p className="text-emerald-600 text-sm">{msg}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h3 className="font-semibold text-sm mb-2">新建商品</h3>
          <input className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm mb-2" value={pCode} onChange={(e) => setPCode(e.target.value)} placeholder="商品编码 code" />
          <input className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm mb-2" value={pName} onChange={(e) => setPName(e.target.value)} placeholder="商品名称" />
          <input className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm mb-2" value={pDesc} onChange={(e) => setPDesc(e.target.value)} placeholder="描述（可选）" />
          <button onClick={createProduct} disabled={!pCode || !pName} className="w-full bg-slate-900 text-white px-4 py-1.5 rounded-lg text-sm disabled:opacity-50">创建商品</button>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h3 className="font-semibold text-sm mb-2">新建规格 (SKU)</h3>
          <select className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm mb-2" value={skuProductId} onChange={(e) => setSkuProductId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">选择所属商品…</option>
            {tree.map((p: any) => <option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}
          </select>
          <input className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm mb-2" value={sCode} onChange={(e) => setSCode(e.target.value)} placeholder="SKU 编码 code" />
          <input className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm mb-2" value={sName} onChange={(e) => setSName(e.target.value)} placeholder="SKU 名称" />
          <input className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm mb-2" value={sRole} onChange={(e) => setSRole(e.target.value)} placeholder="目标岗位 targetRole（用于下单价格快照匹配，可选）" />
          <button onClick={createSku} disabled={!skuProductId || !sCode || !sName} className="w-full bg-slate-900 text-white px-4 py-1.5 rounded-lg text-sm disabled:opacity-50">创建 SKU</button>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h3 className="font-semibold text-sm mb-2">新建价格版本（草稿）</h3>
          <select className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm mb-2" value={priceSkuId} onChange={(e) => setPriceSkuId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">选择 SKU…</option>
            {allSkus.map((s: any) => <option key={s.id} value={s.id}>{s.productName} / {s.name} ({s.code})</option>)}
          </select>
          <input className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm mb-2" value={priceYuan} onChange={(e) => setPriceYuan(e.target.value)} placeholder="价格（元），如 29.90" inputMode="decimal" />
          <label className="block text-xs text-slate-500 mb-1">生效时间（可选）</label>
          <input type="datetime-local" className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm mb-2" value={priceEffective} onChange={(e) => setPriceEffective(e.target.value)} />
          <button onClick={createPrice} disabled={!priceSkuId || !priceYuan} className="w-full bg-slate-900 text-white px-4 py-1.5 rounded-lg text-sm disabled:opacity-50">保存价格草稿</button>
        </div>
      </div>

      {tree.length === 0 && <div className="bg-white rounded-xl border border-dashed border-slate-300 p-10 text-center text-slate-400 text-sm">暂无商品，请先创建商品与 SKU。</div>}

      {tree.map((p: any) => (
        <div key={p.id} className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="font-semibold text-slate-900">{p.name}</span>
            <span className="text-xs text-slate-400 font-mono">{p.code}</span>
            {p.description && <span className="text-xs text-slate-400">— {p.description}</span>}
          </div>
          {(p.skus || []).length === 0 && <p className="text-xs text-slate-400">该商品暂无 SKU。</p>}
          {(p.skus || []).map((s: any) => (
            <div key={s.id} className="mb-4 last:mb-0">
              <div className="text-sm font-medium text-slate-700 mb-1">
                {s.name} <span className="text-xs text-slate-400 font-mono">{s.code}</span>
                {s.targetRole && <span className="ml-2 text-xs text-slate-500">目标岗位：{s.targetRole}</span>}
              </div>
              <table className="w-full text-sm border border-slate-100 rounded-lg overflow-hidden">
                <thead className="bg-slate-50 text-slate-600 text-xs">
                  <tr><th className="text-left px-3 py-1.5">版本</th><th className="text-left px-3 py-1.5">价格</th><th className="text-left px-3 py-1.5">状态</th><th className="text-left px-3 py-1.5">生效时间</th><th className="text-left px-3 py-1.5">编辑者</th><th className="text-left px-3 py-1.5"></th></tr>
                </thead>
                <tbody>
                  {(s.prices || []).map((pv: any) => (
                    <tr key={pv.id} className="border-t border-slate-100">
                      <td className="px-3 py-1.5">v{pv.version}</td>
                      <td className="px-3 py-1.5 font-medium">{fmtMoney(pv.amount)} {pv.currency}</td>
                      <td className="px-3 py-1.5"><VersionStatusBadge status={pv.status} /></td>
                      <td className="px-3 py-1.5 text-slate-500 text-xs">{pv.effectiveAt ? fmtDate(pv.effectiveAt) : '-'}</td>
                      <td className="px-3 py-1.5 text-slate-500 text-xs">{pv.editedByAdmin || '-'}</td>
                      <td className="px-3 py-1.5 whitespace-nowrap">
                        {pv.status === 'draft' && <button onClick={() => submitPrice(pv.id)} className="text-blue-600 hover:underline text-xs">提交发布审批</button>}
                        {pv.status === 'pending' && <span className="text-blue-500 text-xs">审批中</span>}
                        {pv.status === 'archived' && <button onClick={() => rollbackPrice(pv.id)} className="text-amber-600 hover:underline text-xs">回滚到此版本</button>}
                      </td>
                    </tr>
                  ))}
                  {(s.prices || []).length === 0 && <tr><td colSpan={6} className="text-center text-slate-400 py-3 text-xs">暂无价格版本</td></tr>}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function BenefitsTab() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [userId, setUserId] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    apiFetch('/api/admin/finance/entitlements').then(setData).catch((e) => setError(e.message));
  }, []);
  useEffect(() => { load(); }, [load]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setMsg(''); setError(''); setBusy(true);
    try {
      await apiFetch('/api/admin/finance/entitlements/adjust', {
        method: 'POST',
        body: JSON.stringify({ userId: Number(userId), amount: Number(amount), note: note.trim() || undefined }),
      });
      setMsg('调整已记入权益账本'); setUserId(''); setAmount(''); setNote('');
      load();
    } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  };

  if (error && !data) return <p className="text-red-600 text-sm">{error}</p>;
  if (!data) return <p className="text-slate-500 text-sm">加载中...</p>;

  const typeLabel: Record<string, string> = {
    grant: '发放', consume: '消耗', refund_return: '退回', expire: '过期', freeze: '冻结', adjust: '人工调整',
  };

  return (
    <div>
      <h2 className="text-lg font-bold text-slate-900 mb-4">权益账本</h2>
      <p className="text-xs text-slate-400 mb-4">追加式账本：可用余额 = Σ发放 − Σ消耗 ± 调整（不直接改余额，全部由流水派生）。</p>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2">
          <h3 className="font-semibold text-sm mb-2 text-slate-700">用户可用权益</h3>
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-6">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600 text-xs">
                <tr>
                  <th className="text-left px-3 py-2">用户</th>
                  <th className="text-left px-3 py-2">可用余额</th>
                  <th className="text-left px-3 py-2">累计发放</th>
                  <th className="text-left px-3 py-2">累计消耗</th>
                </tr>
              </thead>
              <tbody>
                {data.balances.map((b: any) => (
                  <tr key={b.userId} className="border-t border-slate-100">
                    <td className="px-3 py-2">{b.uid || b.email || `#${b.userId}`}</td>
                    <td className="px-3 py-2 font-semibold">{b.balance}</td>
                    <td className="px-3 py-2 text-slate-500">{b.granted}</td>
                    <td className="px-3 py-2 text-slate-500">{b.consumed}</td>
                  </tr>
                ))}
                {data.balances.length === 0 && (
                  <tr><td colSpan={4} className="text-center text-slate-400 py-6">暂无数据</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h3 className="font-semibold text-sm mb-2 text-slate-700">人工调整</h3>
          <form onSubmit={submit} className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
            <div>
              <label className="block text-xs text-slate-600 mb-1">用户 ID</label>
              <input className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="如 2" />
            </div>
            <div>
              <label className="block text-xs text-slate-600 mb-1">数量（带符号，+发放 / −扣减）</label>
              <input className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="如 1 或 -1" />
            </div>
            <div>
              <label className="block text-xs text-slate-600 mb-1">备注</label>
              <input className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" value={note} onChange={(e) => setNote(e.target.value)} placeholder="如 客诉补偿" />
            </div>
            {msg && <p className="text-xs text-green-600">{msg}</p>}
            {error && <p className="text-xs text-red-600">{error}</p>}
            <button type="submit" disabled={busy} className="w-full bg-slate-900 text-white rounded-lg py-2 text-sm font-semibold disabled:opacity-50">
              {busy ? '提交中...' : '记入账本'}
            </button>
          </form>
        </div>
      </div>

      <h3 className="font-semibold text-sm mb-2 text-slate-700">最近流水</h3>
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-xs">
            <tr>
              <th className="text-left px-3 py-2">时间</th>
              <th className="text-left px-3 py-2">用户</th>
              <th className="text-left px-3 py-2">类型</th>
              <th className="text-left px-3 py-2">数量</th>
              <th className="text-left px-3 py-2">来源</th>
              <th className="text-left px-3 py-2">备注</th>
            </tr>
          </thead>
          <tbody>
            {data.recent.map((r: any) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="px-3 py-2 text-slate-500">{fmtDate(r.createdAt)}</td>
                <td className="px-3 py-2">{r.uid || r.email || `#${r.userId}`}</td>
                <td className="px-3 py-2">{typeLabel[r.entryType] || r.entryType}</td>
                <td className={`px-3 py-2 font-semibold ${r.amount < 0 ? 'text-red-600' : 'text-green-600'}`}>{r.amount > 0 ? `+${r.amount}` : r.amount}</td>
                <td className="px-3 py-2 text-slate-400 text-xs">{r.refType ? `${r.refType}${r.refId ? ':' + r.refId : ''}` : '-'}</td>
                <td className="px-3 py-2 text-slate-400 text-xs">{r.createdByAdmin ? `[${r.createdByAdmin}] ` : ''}{r.note || '-'}</td>
              </tr>
            ))}
            {data.recent.length === 0 && (
              <tr><td colSpan={6} className="text-center text-slate-400 py-6">暂无数据</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AllocationTab() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch('/api/admin/finance/allocations').then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="text-red-600 text-sm">{error}</p>;
  if (!data) return <p className="text-slate-500 text-sm">加载中...</p>;

  return (
    <div>
      <h2 className="text-lg font-bold text-slate-900 mb-4">收入分配</h2>
      <p className="text-xs text-slate-400 mb-4">单次购买：支付净额在实际履约（生成优化简历）时 100% 确认到该任务；退款按额反向冲销，不删除原分配。</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card label="累计已分配" value={fmtMoney(data.totalAllocatedCents)} />
        <Card label="已确认履约收入(毛)" value={fmtMoney(data.recognizedGrossCents)} />
        <Card label="已冲销(退款)" value={fmtMoney(data.reversalCents)} />
        <Card label="待确认收入(递延)" value={fmtMoney(data.deferredCents)} />
      </div>

      <h3 className="font-semibold text-sm mb-2 text-slate-700">分配明细</h3>
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-xs">
            <tr>
              <th className="text-left px-3 py-2">时间</th>
              <th className="text-left px-3 py-2">订单号</th>
              <th className="text-left px-3 py-2">任务</th>
              <th className="text-left px-3 py-2">毛额</th>
              <th className="text-left px-3 py-2">分配额</th>
              <th className="text-left px-3 py-2">方式</th>
              <th className="text-left px-3 py-2">支付状态</th>
            </tr>
          </thead>
          <tbody>
            {data.allocations.map((a: any) => (
              <tr key={a.id} className="border-t border-slate-100">
                <td className="px-3 py-2 text-slate-500">{fmtDate(a.createdAt)}</td>
                <td className="px-3 py-2 font-mono text-xs">{a.businessOrderNo || '-'}</td>
                <td className="px-3 py-2 font-mono text-xs">{a.taskId ? String(a.taskId).slice(0, 12) : '-'}</td>
                <td className="px-3 py-2">{fmtMoney(a.grossAmount || 0)}</td>
                <td className="px-3 py-2 font-semibold">{fmtMoney(a.allocatedAmount || 0)}</td>
                <td className="px-3 py-2 text-slate-400 text-xs">{a.allocationMethod || '-'}</td>
                <td className="px-3 py-2 text-slate-500">{a.paymentStatusName || '-'}</td>
              </tr>
            ))}
            {data.allocations.length === 0 && (
              <tr><td colSpan={7} className="text-center text-slate-400 py-6">暂无分配记录（用户完成付费并生成优化简历后产生）</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReconcileTab({ adminRole }: { adminRole: string }) {
  const todayShanghai = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' });
  const [bizDate, setBizDate] = useState(todayShanghai);
  const [result, setResult] = useState<any>(null);
  const [list, setList] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const canWrite = hasPermission(adminRole as any, 'finance', 'write');

  const loadList = useCallback(() => {
    apiFetch('/api/admin/finance/reconciliations').then((d) => setList(d.reconciliations)).catch((e) => setError(e.message));
  }, []);
  useEffect(() => { loadList(); }, [loadList]);

  const run = async () => {
    setError(''); setMsg(''); setResult(null); setBusy(true);
    try {
      const d = await apiFetch('/api/admin/finance/reconcile', { method: 'POST', body: JSON.stringify({ bizDate }) });
      setResult(d);
    } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  };

  const close = async () => {
    setError(''); setMsg(''); setBusy(true);
    try {
      await apiFetch(`/api/admin/finance/reconcile/${bizDate}/close`, { method: 'POST' });
      setMsg(`${bizDate} 已关账并锁定`); await run(); loadList();
    } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  };

  const reopen = async (d: string) => {
    const reason = window.prompt(`重开 ${d} 需填写原因（将记入审计日志）：`);
    if (!reason || !reason.trim()) return;
    setError(''); setMsg(''); setBusy(true);
    try {
      await apiFetch(`/api/admin/finance/reconcile/${d}/reopen`, { method: 'POST', body: JSON.stringify({ reason: reason.trim() }) });
      setMsg(`${d} 已重开`); loadList();
      if (d === bizDate) run();
    } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  };

  const s = result?.summary;

  return (
    <div>
      <h2 className="text-lg font-bold text-slate-900 mb-4">对账 · 结算报表</h2>
      <p className="text-xs text-slate-400 mb-4">按业务日（Asia/Shanghai）比对「支付/退款源表」与「资金账本」；关账 = 快照 + 锁定，重开需财务复核并记录原因。</p>

      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-slate-600 mb-1">业务日</label>
          <input type="date" className="border border-slate-300 rounded-lg px-3 py-2 text-sm" value={bizDate} onChange={(e) => setBizDate(e.target.value)} />
        </div>
        <button onClick={run} disabled={busy} className="bg-slate-900 text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50">运行对账</button>
        {result && !result.locked && canWrite && (
          <button onClick={close} disabled={busy} className="bg-emerald-600 text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50">关账并锁定</button>
        )}
        {result?.locked && <span className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-500">已关账（只读）</span>}
      </div>
      {msg && <p className="text-sm text-green-600 mb-3">{msg}</p>}
      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      {s && (
        <>
          <div className="mb-2">
            {s.balanced
              ? <span className="text-sm px-2 py-1 rounded-full bg-green-100 text-green-700">✓ 平账</span>
              : <span className="text-sm px-2 py-1 rounded-full bg-red-100 text-red-700">✗ 存在差异</span>}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Card label="支付成功笔数" value={String(s.paymentCount)} />
            <Card label="支付源表金额" value={fmtMoney(s.paymentsSum)} sub={`账本 ${fmtMoney(s.ledgerReceivedSum)}`} />
            <Card label="退款成功笔数" value={String(s.refundCount)} />
            <Card label="退款源表金额" value={fmtMoney(s.refundsSum)} sub={`账本 ${fmtMoney(s.ledgerRefundSum)}`} />
          </div>
          {result.discrepancies && !s.balanced && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 text-xs text-red-700">
              <p className="font-semibold mb-1">差异清单</p>
              <pre className="whitespace-pre-wrap">{JSON.stringify(result.discrepancies, null, 2)}</pre>
            </div>
          )}
        </>
      )}

      <h3 className="font-semibold text-sm mb-2 text-slate-700">已保存的对账/关账记录</h3>
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-xs">
            <tr>
              <th className="text-left px-3 py-2">业务日</th>
              <th className="text-left px-3 py-2">状态</th>
              <th className="text-left px-3 py-2">平账</th>
              <th className="text-left px-3 py-2">关账人</th>
              <th className="text-left px-3 py-2">关账时间</th>
              <th className="text-left px-3 py-2">操作</th>
            </tr>
          </thead>
          <tbody>
            {list.map((r: any) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="px-3 py-2 font-mono text-xs">{r.bizDate}</td>
                <td className="px-3 py-2">{r.status === 'CLOSED' ? '已关账' : r.status === 'REVIEWING' ? '复核中' : '开放'}</td>
                <td className="px-3 py-2">{r.summary ? (r.summary.balanced ? '✓' : '✗') : '-'}</td>
                <td className="px-3 py-2 text-slate-500">{r.closedByAdmin || '-'}</td>
                <td className="px-3 py-2 text-slate-500">{fmtDate(r.closedAt)}</td>
                <td className="px-3 py-2">
                  {r.status === 'CLOSED' && canWrite && (
                    <button onClick={() => reopen(r.bizDate)} className="text-xs text-blue-600 hover:underline">重开</button>
                  )}
                </td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr><td colSpan={6} className="text-center text-slate-400 py-6">暂无关账记录</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── 余额管理 Tab ──────────────────────────────────────────────────────────────
function WalletManagementTab() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [txData, setTxData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [txType, setTxType] = useState('');
  const [error, setError] = useState('');

  const [giftUserId, setGiftUserId] = useState('');
  const [giftAmount, setGiftAmount] = useState('');
  const [giftReason, setGiftReason] = useState('');
  const [giftLoading, setGiftLoading] = useState(false);
  const [giftMsg, setGiftMsg] = useState('');

  const [reverseId, setReverseId] = useState('');
  const [reverseReason, setReverseReason] = useState('');
  const [reverseLoading, setReverseLoading] = useState(false);
  const [reverseMsg, setReverseMsg] = useState('');

  const loadTx = useCallback(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: '20' });
    if (txType) params.set('type', txType);
    if (search) params.set('uid', search);
    apiFetch(`/api/admin/wallet/transactions?${params}`)
      .then((d) => { setTxData(d.data); setTotal(d.total); })
      .catch((e) => setError(e.message));
  }, [page, txType, search]);

  useEffect(() => { loadTx(); }, [loadTx]);

  const handleGift = async () => {
    setGiftLoading(true); setGiftMsg('');
    try {
      const uidNum = parseInt(giftUserId.trim(), 10);
      if (isNaN(uidNum) || uidNum <= 0) {
        setGiftMsg('失败：用户 ID 必须是数字（在用户列表中查看 ID 列）');
        setGiftLoading(false);
        return;
      }
      const amountCents = Math.round(parseFloat(giftAmount) * 100);
      if (isNaN(amountCents) || amountCents <= 0) {
        setGiftMsg('失败：金额格式不正确');
        setGiftLoading(false);
        return;
      }
      await apiFetch(`/api/admin/users/${uidNum}/wallet/gift`, {
        method: 'POST',
        body: JSON.stringify({ amountCents, reason: giftReason }),
      });
      setGiftMsg(`赠送成功！已向用户 ID=${uidNum} 赠送 ${(amountCents / 100).toFixed(2)} 元`);
      setGiftAmount(''); setGiftReason(''); setGiftUserId('');
      loadTx();
    } catch (e: any) { setGiftMsg(`失败：${e.message}`); }
    setGiftLoading(false);
  };

  const handleReverse = async () => {
    setReverseLoading(true); setReverseMsg('');
    try {
      await apiFetch(`/api/admin/wallet/transactions/${reverseId}/reverse`, {
        method: 'POST',
        body: JSON.stringify({ reason: reverseReason }),
      });
      setReverseMsg(`冲正成功！流水 ID=${reverseId}`);
      setReverseId(''); setReverseReason('');
      loadTx();
    } catch (e: any) { setReverseMsg(`失败：${e.message}`); }
    setReverseLoading(false);
  };

  const TX_LABELS: Record<string, string> = {
    ADMIN_GIFT: '人工赠送', REGISTER_GIFT: '注册赠送', CONSUMPTION: '消费扣减',
    GIFT_REVERSAL: '赠送冲正', REFUND_RETURN: '退款返还',
  };

  return (
    <div>
      <h2 className="text-lg font-bold text-slate-900 mb-4">余额管理</h2>

      {/* 人工赠送 */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4">
        <h3 className="font-semibold text-slate-800 mb-3">人工赠送余额</h3>
        <div className="flex flex-wrap gap-2 items-end">
          <div>
            <label className="text-xs text-slate-500 block mb-1">用户 ID (数字)</label>
            <input className="border rounded px-2 py-1 text-sm w-28" placeholder="用户ID" value={giftUserId} onChange={(e) => setGiftUserId(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">金额（元，≤500）</label>
            <input className="border rounded px-2 py-1 text-sm w-24" placeholder="如 20.00" type="number" min="0.01" max="500" step="0.01" value={giftAmount} onChange={(e) => setGiftAmount(e.target.value)} />
          </div>
          <div className="flex-1 min-w-48">
            <label className="text-xs text-slate-500 block mb-1">赠送原因（必填）</label>
            <input className="border rounded px-2 py-1 text-sm w-full" placeholder="如：活动补偿、客服关怀" value={giftReason} onChange={(e) => setGiftReason(e.target.value)} />
          </div>
          <button
            onClick={handleGift}
            disabled={giftLoading || !giftUserId || !giftAmount || !giftReason}
            className="px-3 py-1.5 bg-green-600 text-white rounded text-sm disabled:opacity-50"
          >{giftLoading ? '处理中…' : '确认赠送'}</button>
        </div>
        {giftMsg && <p className={`mt-2 text-sm ${giftMsg.startsWith('失败') ? 'text-red-600' : 'text-green-600'}`}>{giftMsg}</p>}
      </div>

      {/* 冲正 */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4">
        <h3 className="font-semibold text-slate-800 mb-3">赠送冲正（仅限 finance / super_admin）</h3>
        <div className="flex flex-wrap gap-2 items-end">
          <div>
            <label className="text-xs text-slate-500 block mb-1">原流水 ID</label>
            <input className="border rounded px-2 py-1 text-sm w-28" placeholder="流水ID" value={reverseId} onChange={(e) => setReverseId(e.target.value)} />
          </div>
          <div className="flex-1 min-w-48">
            <label className="text-xs text-slate-500 block mb-1">冲正原因（必填）</label>
            <input className="border rounded px-2 py-1 text-sm w-full" placeholder="如：误操作、活动取消" value={reverseReason} onChange={(e) => setReverseReason(e.target.value)} />
          </div>
          <button
            onClick={handleReverse}
            disabled={reverseLoading || !reverseId || !reverseReason}
            className="px-3 py-1.5 bg-red-600 text-white rounded text-sm disabled:opacity-50"
          >{reverseLoading ? '处理中…' : '确认冲正'}</button>
        </div>
        {reverseMsg && <p className={`mt-2 text-sm ${reverseMsg.startsWith('失败') ? 'text-red-600' : 'text-green-600'}`}>{reverseMsg}</p>}
      </div>

      {/* 流水列表 */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex flex-wrap gap-2 items-center mb-3">
          <h3 className="font-semibold text-slate-800">全局余额流水</h3>
          <input className="border rounded px-2 py-1 text-sm w-40" placeholder="按用户UID筛选" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          <select className="border rounded px-2 py-1 text-sm" value={txType} onChange={(e) => { setTxType(e.target.value); setPage(1); }}>
            <option value="">全部类型</option>
            {Object.entries(TX_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <span className="text-xs text-slate-500">共 {total} 条</span>
        </div>
        {error && <p className="text-red-600 text-sm mb-2">{error}</p>}
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 text-left">
                {['ID','用户UID','类型','金额(分)','余额后(分)','说明','操作人','时间'].map((h) => (
                  <th key={h} className="px-2 py-2 border-b border-slate-200 font-medium text-slate-600">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {txData.map((r) => (
                <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-2 py-1.5 font-mono">{r.id}</td>
                  <td className="px-2 py-1.5">{r.uid ?? r.userId}</td>
                  <td className="px-2 py-1.5">
                    <span className={`px-1.5 py-0.5 rounded text-xs ${r.txType === 'GIFT_REVERSAL' ? 'bg-red-100 text-red-700' : r.amountCents > 0 ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
                      {TX_LABELS[r.txType] ?? r.txType}
                    </span>
                  </td>
                  <td className={`px-2 py-1.5 font-mono ${r.amountCents > 0 ? 'text-green-700' : 'text-red-600'}`}>{r.amountCents > 0 ? '+' : ''}{r.amountCents}</td>
                  <td className="px-2 py-1.5 font-mono">{r.balanceAfterCents}</td>
                  <td className="px-2 py-1.5 max-w-48 truncate" title={r.description}>{r.description ?? '-'}</td>
                  <td className="px-2 py-1.5">{r.operatorId ?? 'SYSTEM'}</td>
                  <td className="px-2 py-1.5 text-slate-500">{r.createdAt ? new Date(r.createdAt).toLocaleString('zh-CN') : '-'}</td>
                </tr>
              ))}
              {txData.length === 0 && <tr><td colSpan={8} className="text-center py-6 text-slate-400 text-sm">暂无流水数据</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="flex gap-2 mt-3 justify-end">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1 border rounded text-sm disabled:opacity-40">上一页</button>
          <span className="text-sm text-slate-500 self-center">第 {page} 页</span>
          <button disabled={txData.length < 20} onClick={() => setPage(p => p + 1)} className="px-3 py-1 border rounded text-sm disabled:opacity-40">下一页</button>
        </div>
      </div>
    </div>
  );
}

// ─── 注册赠送配置 Tab ─────────────────────────────────────────────────────────
function GiftCampaignTab() {
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const [form, setForm] = useState({
    enabled: false,
    giftAmountYuan: '20.00',
    copywriting: '',
    ctaText: '立即体验',
    targetUrl: '/optimize',
    startAt: '',
    endAt: '',
  });

  useEffect(() => {
    apiFetch('/api/admin/gift-campaigns/register')
      .then((d) => {
        if (d) {
          setConfig(d);
          setForm({
            enabled: d.enabled,
            giftAmountYuan: (d.giftAmountCents / 100).toFixed(2),
            copywriting: d.copywriting ?? '',
            ctaText: d.ctaText ?? '立即体验',
            targetUrl: d.targetUrl ?? '/optimize',
            startAt: d.startAt ? d.startAt.slice(0, 10) : '',
            endAt: d.endAt ? d.endAt.slice(0, 10) : '',
          });
        }
      })
      .catch((e) => setMsg(e.message))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true); setMsg('');
    try {
      const giftAmountCents = Math.round(parseFloat(form.giftAmountYuan) * 100);
      if (isNaN(giftAmountCents) || giftAmountCents < 0) throw new Error('金额格式错误');
      const payload: any = {
        enabled: form.enabled,
        giftAmountCents,
        copywriting: form.copywriting || null,
        ctaText: form.ctaText || null,
        targetUrl: form.targetUrl || null,
        startAt: form.startAt || null,
        endAt: form.endAt || null,
      };
      const updated = await apiFetch('/api/admin/gift-campaigns/register', { method: 'PUT', body: JSON.stringify(payload) });
      setConfig(updated);
      setMsg('保存成功！');
    } catch (e: any) { setMsg(`保存失败：${e.message}`); }
    setSaving(false);
  };

  if (loading) return <p className="text-slate-500 text-sm">加载中…</p>;

  return (
    <div>
      <h2 className="text-lg font-bold text-slate-900 mb-4">注册赠送配置</h2>
      <div className="bg-white rounded-xl border border-slate-200 p-6 max-w-2xl">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <label className="font-medium text-sm text-slate-700 w-32">活动开关</label>
            <button
              onClick={() => setForm(f => ({ ...f, enabled: !f.enabled }))}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.enabled ? 'bg-green-500' : 'bg-slate-300'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
            <span className={`text-sm font-medium ${form.enabled ? 'text-green-600' : 'text-slate-400'}`}>{form.enabled ? '已开启' : '已关闭'}</span>
          </div>

          <div className="flex items-center gap-3">
            <label className="font-medium text-sm text-slate-700 w-32">赠送金额（元）</label>
            <input className="border rounded px-3 py-1.5 text-sm w-32" type="number" min="0" step="0.01" value={form.giftAmountYuan} onChange={(e) => setForm(f => ({ ...f, giftAmountYuan: e.target.value }))} />
            <span className="text-xs text-slate-400">= {Math.round(parseFloat(form.giftAmountYuan || '0') * 100)} 分</span>
          </div>

          <div className="flex items-center gap-3">
            <label className="font-medium text-sm text-slate-700 w-32">到账文案</label>
            <input className="border rounded px-3 py-1.5 text-sm flex-1" placeholder="支持 {amount} 变量" value={form.copywriting} onChange={(e) => setForm(f => ({ ...f, copywriting: e.target.value }))} />
          </div>

          <div className="flex items-center gap-3">
            <label className="font-medium text-sm text-slate-700 w-32">引导按钮文案</label>
            <input className="border rounded px-3 py-1.5 text-sm w-40" value={form.ctaText} onChange={(e) => setForm(f => ({ ...f, ctaText: e.target.value }))} />
          </div>

          <div className="flex items-center gap-3">
            <label className="font-medium text-sm text-slate-700 w-32">跳转页面路径</label>
            <input className="border rounded px-3 py-1.5 text-sm w-48" value={form.targetUrl} onChange={(e) => setForm(f => ({ ...f, targetUrl: e.target.value }))} />
          </div>

          <div className="flex items-center gap-3">
            <label className="font-medium text-sm text-slate-700 w-32">活动开始日期</label>
            <input type="date" className="border rounded px-3 py-1.5 text-sm" value={form.startAt} onChange={(e) => setForm(f => ({ ...f, startAt: e.target.value }))} />
            <span className="text-xs text-slate-400">（留空 = 立即生效）</span>
          </div>

          <div className="flex items-center gap-3">
            <label className="font-medium text-sm text-slate-700 w-32">活动结束日期</label>
            <input type="date" className="border rounded px-3 py-1.5 text-sm" value={form.endAt} onChange={(e) => setForm(f => ({ ...f, endAt: e.target.value }))} />
            <span className="text-xs text-slate-400">（留空 = 永久有效）</span>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded text-sm disabled:opacity-50">
            {saving ? '保存中…' : '保存配置'}
          </button>
          {msg && <p className={`text-sm ${msg.startsWith('保存失败') ? 'text-red-600' : 'text-green-600'}`}>{msg}</p>}
        </div>

        {config && (
          <div className="mt-4 pt-4 border-t border-slate-100 text-xs text-slate-400">
            最后更新：{config.updatedByAdmin ?? '—'} @ {config.updatedAt ? new Date(config.updatedAt).toLocaleString('zh-CN') : '—'}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 营销费用台账 Tab ─────────────────────────────────────────────────────────
function MarketingExpenseTab() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [expenseType, setExpenseType] = useState('');
  const [uidSearch, setUidSearch] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: '20' });
    if (expenseType) params.set('type', expenseType);
    if (uidSearch) params.set('uid', uidSearch);
    apiFetch(`/api/admin/marketing-expenses?${params}`)
      .then((d) => { setData(d.data); setTotal(d.total); })
      .catch((e) => setError(e.message));
  }, [page, expenseType, uidSearch]);

  useEffect(() => { load(); }, [load]);

  const TYPE_LABELS: Record<string, string> = {
    ADMIN_GIFT: '人工赠送', REGISTER_GIFT: '注册赠送', GIFT_REVERSAL: '赠送冲正',
  };

  const totalShown = data.reduce((sum, r) => sum + r.amountCents, 0);

  return (
    <div>
      <h2 className="text-lg font-bold text-slate-900 mb-4">营销费用台账</h2>
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex flex-wrap gap-2 items-center mb-3">
          <input className="border rounded px-2 py-1 text-sm w-40" placeholder="按用户UID筛选" value={uidSearch} onChange={(e) => { setUidSearch(e.target.value); setPage(1); }} />
          <select className="border rounded px-2 py-1 text-sm" value={expenseType} onChange={(e) => { setExpenseType(e.target.value); setPage(1); }}>
            <option value="">全部类型</option>
            {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <span className="text-xs text-slate-500">共 {total} 条 · 当页合计 {(totalShown / 100).toFixed(2)} 元</span>
        </div>
        {error && <p className="text-red-600 text-sm mb-2">{error}</p>}
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 text-left">
                {['ID','费用类型','金额(元)','用户UID','关联流水ID','操作人','状态','原因','时间'].map((h) => (
                  <th key={h} className="px-2 py-2 border-b border-slate-200 font-medium text-slate-600">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-2 py-1.5 font-mono">{r.id}</td>
                  <td className="px-2 py-1.5">
                    <span className={`px-1.5 py-0.5 rounded text-xs ${r.expenseType === 'GIFT_REVERSAL' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                      {TYPE_LABELS[r.expenseType] ?? r.expenseType}
                    </span>
                  </td>
                  <td className={`px-2 py-1.5 font-mono ${r.amountCents < 0 ? 'text-red-600' : 'text-green-700'}`}>{(r.amountCents / 100).toFixed(2)}</td>
                  <td className="px-2 py-1.5">{r.uid ?? r.userId ?? '-'}</td>
                  <td className="px-2 py-1.5 font-mono">{r.walletTransactionId ?? '-'}</td>
                  <td className="px-2 py-1.5">{r.operatorId ?? 'SYSTEM'}</td>
                  <td className="px-2 py-1.5">
                    <span className={`px-1.5 py-0.5 rounded text-xs ${r.status === 'SETTLED' ? 'bg-green-100 text-green-700' : r.status === 'REVERSED' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}>
                      {r.status === 'SETTLED' ? '已入账' : r.status === 'REVERSED' ? '已冲正' : r.status}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 max-w-40 truncate" title={r.reason}>{r.reason ?? '-'}</td>
                  <td className="px-2 py-1.5 text-slate-500">{r.createdAt ? new Date(r.createdAt).toLocaleString('zh-CN') : '-'}</td>
                </tr>
              ))}
              {data.length === 0 && <tr><td colSpan={9} className="text-center py-6 text-slate-400 text-sm">暂无营销费用记录</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="flex gap-2 mt-3 justify-end">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1 border rounded text-sm disabled:opacity-40">上一页</button>
          <span className="text-sm text-slate-500 self-center">第 {page} 页</span>
          <button disabled={data.length < 20} onClick={() => setPage(p => p + 1)} className="px-3 py-1 border rounded text-sm disabled:opacity-40">下一页</button>
        </div>
      </div>
    </div>
  );
}

function PlannedTab({ title }: { title: string }) {
  return (
    <div>
      <h2 className="text-lg font-bold text-slate-900 mb-2">{title}</h2>
      <div className="bg-white rounded-xl border border-dashed border-slate-300 p-10 text-center">
        <p className="text-slate-400 text-sm">该模块为 PRD 规划中的页面，将在后续阶段（Phase 2/3）实现。</p>
        <p className="text-slate-300 text-xs mt-2">当前阶段（Phase 1）仅落地信息架构与权限骨架。</p>
      </div>
    </div>
  );
}

export default function AdminApp() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [adminName, setAdminName] = useState('');
  const [adminRole, setAdminRole] = useState('');
  const [page, setPage] = useState<PageKey>('overview');

  const checkAuth = useCallback(() => {
    if (!localStorage.getItem(TOKEN_KEY)) {
      setAuthed(false);
      return;
    }
    apiFetch('/api/admin/me')
      .then((d) => {
        setAdminName(d.username); setAdminRole(d.role); setAuthed(true);
        // 若当前页对该角色不可见，回落到第一个可见页
        const allPages = NAV.flatMap((g) => g.pages);
        setPage((cur) => {
          const curPage = allPages.find((p) => p.key === cur);
          if (curPage && pageVisible(curPage, d.role)) return cur;
          return allPages.find((p) => pageVisible(p, d.role))?.key ?? 'overview';
        });
      })
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
      <Nav page={page} setPage={setPage} onLogout={logout} adminName={adminName} adminRole={adminRole} />
      <div className="flex-1 p-6 overflow-x-auto">
        {page === 'overview' && <OverviewTab />}
        {page === 'todos' && <ApprovalsTab adminUsername={adminName} adminRole={adminRole} />}
        {page === 'users' && <UsersTab />}
        {page === 'tickets' && <TicketsTab />}
        {page === 'tasks' && <TasksTab />}
        {page === 'orders' && <PaymentsTab />}
        {page === 'refunds' && <RefundsTab adminUsername={adminName} adminRole={adminRole} />}
        {page === 'referrals' && <ReferralsTab />}
        {page === 'finance' && <FinanceTab />}
        {page === 'site' && <ConfigTab />}
        {page === 'notifications' && <NotificationsTab />}
        {page === 'ai' && <AiTab />}
        {page === 'risk' && <RiskTab />}
        {page === 'accounts' && <AccountsTab />}
        {page === 'audit' && <AuditTab />}
        {page === 'security' && <SecurityTab />}
        {page === 'monitor' && <PlannedTab title="实时监控" />}
        {page === 'benefits' && <BenefitsTab />}
        {page === 'wallet' && <WalletManagementTab />}
        {page === 'giftCampaign' && <GiftCampaignTab />}
        {page === 'marketingExpense' && <MarketingExpenseTab />}
        {page === 'privacy' && <PlannedTab title="隐私请求" />}
        {page === 'results' && <PlannedTab title="结果版本" />}
        {page === 'qc' && <PlannedTab title="质量抽检" />}
        {page === 'failures' && <PlannedTab title="失败队列" />}
        {page === 'files' && <PlannedTab title="文件管理" />}
        {page === 'products' && <ProductsTab />}
        {page === 'allocation' && <AllocationTab />}
        {page === 'reconcile' && <ReconcileTab adminRole={adminRole} />}
        {page === 'seo' && <PlannedTab title="SEO" />}
        {page === 'routing' && <PlannedTab title="路由 · 评测" />}
        {page === 'jd' && <PlannedTab title="JD来源" />}
        {page === 'funnel' && <PlannedTab title="漏斗 · 渠道" />}
        {page === 'campaigns' && <PlannedTab title="活动" />}
        {page === 'blacklist' && <PlannedTab title="黑名单" />}
        {page === 'system' && <PlannedTab title="Webhook · 队列 · 健康 · 集成" />}
      </div>
    </div>
  );
}
