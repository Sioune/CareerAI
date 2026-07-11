// ─────────────────────────────────────────────────────────────────────────────
// CareerAI 后台 —— 角色与权限（PRD v1.0 §2.1 / §2.3）
// 单一事实来源：server.ts 与 admin UI 均从此文件导入，避免前后端权限漂移。
// ─────────────────────────────────────────────────────────────────────────────

// PRD §2.1 后台用户角色（8 个）
export const ROLES = [
  'super_admin',       // 超级管理员
  'operations',        // 运营管理员
  'customer_service',  // 客服
  'finance',           // 财务
  'ai_ops',            // AI运营/算法
  'content',           // 内容/品牌运营
  'auditor',           // 审计/只读
  'devops',            // 研发运维
] as const;

export type Role = typeof ROLES[number];

export const ROLE_LABEL: Record<string, string> = {
  super_admin: '超级管理员',
  operations: '运营管理员',
  customer_service: '客服',
  finance: '财务',
  ai_ops: 'AI运营/算法',
  content: '内容/品牌运营',
  auditor: '审计/只读',
  devops: '研发运维',
};

export const ROLE_SCOPE: Record<string, string> = {
  super_admin: '可访问全部模块；高风险动作仍需二次确认/审批。',
  operations: '用户运营、任务处理、结果抽检、活动配置；不查看完整财务结算，不管理密钥。',
  customer_service: '处理咨询、失败任务、补偿权益、退款申请；联系方式默认脱敏。',
  finance: '订单、支付、退款、结算、对账、成本与毛利；不查看完整简历正文。',
  ai_ops: '模型路由、提示词、评测、成本优化；简历与JD默认去标识化，不可操作支付退款。',
  content: '网站品牌、页面文案、SEO、公告、邮件模板；不可查看用户简历/支付明细/密钥。',
  auditor: '查看经营、权限与操作记录，支持稽核；只读，敏感字段继续脱敏。',
  devops: 'Webhook、队列、错误、系统健康与集成排障；仅技术诊断。',
};

// 权限模块（对应 PRD §2.3 权限矩阵的行 + 少量拆分）
export type PermModule =
  | 'overview'   // 经营看板
  | 'users'      // 用户资料
  | 'tasks'      // 任务/结果
  | 'products'   // 商品/价格
  | 'payments'   // 支付/退款
  | 'finance'    // 财务/账本
  | 'ai'         // 模型/提示词
  | 'site'       // 网站/CMS
  | 'growth'     // 增长/风控
  | 'tickets'    // 客服工单
  | 'audit'      // 审计日志
  | 'rbac'       // 权限/账号/密钥
  | 'approvals'  // 审批中心
  | 'system';    // 系统/运维（Webhook/队列/健康/集成）

export const MODULE_LABEL: Record<PermModule, string> = {
  overview: '经营看板',
  users: '用户资料',
  tasks: '任务/结果',
  products: '商品/价格',
  payments: '支付/退款',
  finance: '财务/账本',
  ai: '模型/提示词',
  site: '网站/CMS',
  growth: '增长/风控',
  tickets: '客服工单',
  audit: '审计日志',
  rbac: '权限/密钥',
  approvals: '审批中心',
  system: '系统/运维',
};

export type Access = 'none' | 'read' | 'write';

// PRD §2.3 权限矩阵（建议默认），收敛为 none/read/write 三级。
// super_admin 恒为全权限（见 hasPermission），此表中略去。
// write 隐含 read。细粒度执行（如退款审批必须财务且非本人）在具体接口再加约束。
const MATRIX: Record<PermModule, Partial<Record<Role, Access>>> = {
  // 经营看板：全员可读（客服=摘要, AI=成本视图, 研发=系统视图 —— 统一按 read 处理）
  overview:  { operations: 'read',  customer_service: 'read', finance: 'read',  ai_ops: 'read',  content: 'read',  auditor: 'read', devops: 'read' },
  // 用户资料：运营=读/运营动作(write)；客服/审计=脱敏读；财务=交易必要字段；AI=去标识化；内容=无；研发=临时读
  users:     { operations: 'write', customer_service: 'read', finance: 'read',  ai_ops: 'read',  content: 'none',  auditor: 'read', devops: 'read' },
  // 任务/结果：运营/AI=write；客服=读(补偿走审批)；财务=摘要；审计/研发=只读/诊断；内容=无
  tasks:     { operations: 'write', customer_service: 'read', finance: 'read',  ai_ops: 'write', content: 'none',  auditor: 'read', devops: 'read' },
  // 商品/价格：运营=提案(write)；财务=读/校验；AI/内容/审计=读；研发=无（发布审批仍需 super）
  products:  { operations: 'write', customer_service: 'read', finance: 'read',  ai_ops: 'read',  content: 'read',  auditor: 'read', devops: 'none' },
  // 支付/退款：客服=发起申请(write)；财务=审批/执行(write)；运营/审计/研发=只读；AI/内容=无
  payments:  { operations: 'read',  customer_service: 'write', finance: 'write', ai_ops: 'none',  content: 'none',  auditor: 'read', devops: 'read' },
  // 财务/账本：财务=全(write)；运营=摘要；AI=成本明细；审计/研发=只读；客服/内容=无
  finance:   { operations: 'read',  customer_service: 'none', finance: 'write', ai_ops: 'read',  content: 'none',  auditor: 'read', devops: 'read' },
  // 模型/提示词：AI=创建/测试/发布申请(write)；运营/审计/研发=读；财务=成本只读；客服/内容=无
  ai:        { operations: 'read',  customer_service: 'none', finance: 'read',  ai_ops: 'write', content: 'none',  auditor: 'read', devops: 'read' },
  // 网站/CMS：运营=运营配置(write)；内容=创建/发布申请(write)；客服/财务/AI/审计=读；研发=无
  site:      { operations: 'write', customer_service: 'read', finance: 'read',  ai_ops: 'read',  content: 'write', auditor: 'read', devops: 'none' },
  // 增长/风控（PRD 无独立矩阵行）：运营=write；其余可读；内容=读
  growth:    { operations: 'write', customer_service: 'read', finance: 'read',  ai_ops: 'read',  content: 'read',  auditor: 'read', devops: 'read' },
  // 客服工单（用户与客户下）：客服/运营=write；审计=读；其余无
  tickets:   { operations: 'write', customer_service: 'write', finance: 'none', ai_ops: 'none',  content: 'none',  auditor: 'read', devops: 'none' },
  // 审计日志：审计=全只读；财务/研发=范围只读；super=全。运营/客服的“自身范围”视图 Phase 后续再做
  audit:     { operations: 'none',  customer_service: 'none', finance: 'read',  ai_ops: 'none',  content: 'none',  auditor: 'read', devops: 'read' },
  // 权限/密钥：super=全；审计=审计只读；研发=技术配置只读；其余无
  rbac:      { operations: 'none',  customer_service: 'none', finance: 'none',  ai_ops: 'none',  content: 'none',  auditor: 'read', devops: 'read' },
  // 审批中心：财务=审批(write)；运营/客服=可见自身发起；审计=读；其余无
  approvals: { operations: 'read',  customer_service: 'read', finance: 'write', ai_ops: 'none',  content: 'none',  auditor: 'read', devops: 'none' },
  // 系统/运维：研发=技术配置(write)；审计=只读；其余无
  system:    { operations: 'none',  customer_service: 'none', finance: 'none',  ai_ops: 'none',  content: 'none',  auditor: 'read', devops: 'write' },
};

export function accessLevel(role: string, module: PermModule): Access {
  if (role === 'super_admin') return 'write';
  return MATRIX[module]?.[role as Role] ?? 'none';
}

export function hasPermission(role: string, module: PermModule, action: 'read' | 'write'): boolean {
  const level = accessLevel(role, module);
  if (level === 'none') return false;
  if (action === 'read') return level === 'read' || level === 'write';
  return level === 'write';
}
