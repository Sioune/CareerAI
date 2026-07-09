import React, { useState } from "react";
import {
  X,
  Search,
  BarChart3,
  UploadCloud,
  CheckCircle2,
  FileText,
  Download,
  History,
  Bell,
  User,
  Settings,
  Sparkles,
  ChevronDown,
  ChevronRight,
  BookOpen,
  HelpCircle,
  Shield,
  Gift,
  Edit,
  RefreshCw,
  Check,
  AlertCircle,
} from "lucide-react";

interface HelpCenterProps {
  onClose: () => void;
  lang: "zh" | "en";
}

interface Section {
  id: string;
  icon: React.ReactNode;
  title: string;
  color: string;
  steps?: { title: string; desc: string }[];
  faqs?: { q: string; a: string }[];
  items?: string[];
}

export default function HelpCenter({ onClose, lang }: HelpCenterProps) {
  const [activeSection, setActiveSection] = useState<string>("overview");
  const [expandedFaq, setExpandedFaq] = useState<string | null>(null);

  const zh = lang === "zh";

  const sections: Section[] = [
    {
      id: "overview",
      icon: <Sparkles className="w-4 h-4" />,
      title: zh ? "系统概览" : "System Overview",
      color: "blue",
    },
    {
      id: "account",
      icon: <User className="w-4 h-4" />,
      title: zh ? "账户管理" : "Account",
      color: "slate",
    },
    {
      id: "role",
      icon: <Search className="w-4 h-4" />,
      title: zh ? "目标岗位分析" : "Role Analysis",
      color: "violet",
    },
    {
      id: "jd",
      icon: <BarChart3 className="w-4 h-4" />,
      title: zh ? "岗位画像报告" : "JD Profile",
      color: "indigo",
    },
    {
      id: "upload",
      icon: <UploadCloud className="w-4 h-4" />,
      title: zh ? "上传简历" : "Upload Resume",
      color: "sky",
    },
    {
      id: "match",
      icon: <CheckCircle2 className="w-4 h-4" />,
      title: zh ? "差距匹配分析" : "Gap Analysis",
      color: "emerald",
    },
    {
      id: "rewrite",
      icon: <Edit className="w-4 h-4" />,
      title: zh ? "AI 改写简历" : "AI Rewrite",
      color: "amber",
    },
    {
      id: "export",
      icon: <Download className="w-4 h-4" />,
      title: zh ? "导出功能" : "Export",
      color: "rose",
    },
    {
      id: "history",
      icon: <History className="w-4 h-4" />,
      title: zh ? "历史记录" : "History",
      color: "slate",
    },
    {
      id: "notify",
      icon: <Bell className="w-4 h-4" />,
      title: zh ? "通知中心" : "Notifications",
      color: "orange",
    },
    {
      id: "faq",
      icon: <HelpCircle className="w-4 h-4" />,
      title: zh ? "常见问题" : "FAQ",
      color: "teal",
    },
  ];

  const colorMap: Record<string, string> = {
    blue: "bg-blue-50 text-blue-700 border-blue-200",
    slate: "bg-slate-50 text-slate-700 border-slate-200",
    violet: "bg-violet-50 text-violet-700 border-violet-200",
    indigo: "bg-indigo-50 text-indigo-700 border-indigo-200",
    sky: "bg-sky-50 text-sky-700 border-sky-200",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    rose: "bg-rose-50 text-rose-700 border-rose-200",
    orange: "bg-orange-50 text-orange-700 border-orange-200",
    teal: "bg-teal-50 text-teal-700 border-teal-200",
  };

  const dotMap: Record<string, string> = {
    blue: "bg-blue-500",
    slate: "bg-slate-500",
    violet: "bg-violet-500",
    indigo: "bg-indigo-500",
    sky: "bg-sky-500",
    emerald: "bg-emerald-500",
    amber: "bg-amber-500",
    rose: "bg-rose-500",
    orange: "bg-orange-500",
    teal: "bg-teal-500",
  };

  const activeColor = sections.find((s) => s.id === activeSection)?.color ?? "blue";

  const renderContent = () => {
    switch (activeSection) {
      case "overview":
        return (
          <div className="space-y-6">
            <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl p-6 text-white">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-lg leading-tight">CareerAI</h3>
                  <p className="text-blue-200 text-xs font-bold uppercase tracking-wider">
                    {zh ? "AI 高管专版 V0.4 PRO" : "Executive AI Edition V0.4 PRO"}
                  </p>
                </div>
              </div>
              <p className="text-blue-100 text-sm leading-relaxed">
                {zh
                  ? "CareerAI 是一款面向高管及资深职场人的 AI 简历优化平台，通过实时岗位画像分析、大模型差距矩阵评分与靶向改写引擎，帮助您在激烈竞争中脱颖而出。"
                  : "CareerAI is an AI-powered resume optimizer for executives and senior professionals. It delivers real-time JD profiling, LLM-driven gap analysis, and precision rewriting to give you a decisive edge."}
              </p>
            </div>

            <div>
              <h4 className="text-xs font-extrabold text-slate-500 uppercase tracking-widest mb-4">
                {zh ? "五步核心流程" : "5-Step Core Workflow"}
              </h4>
              <div className="space-y-3">
                {[
                  {
                    step: "01",
                    icon: <Search className="w-4 h-4" />,
                    color: "violet",
                    title: zh ? "输入目标岗位" : "Enter Target Role",
                    desc: zh
                      ? "输入您意向冲击的高阶岗位名称，可选填行业、城市、职级等筛选参数，系统将联网实时检索市场岗位画像。"
                      : "Enter your target role with optional industry, location, and seniority filters. The system queries live JD data from multiple sources.",
                  },
                  {
                    step: "02",
                    icon: <BarChart3 className="w-4 h-4" />,
                    color: "indigo",
                    title: zh ? "查阅岗位画像报告" : "Review JD Profile Report",
                    desc: zh
                      ? "系统自动生成该岗位的必备技能、高频关键词、加分项及薪资区间等全维度画像报告，供您评估与校准目标。"
                      : "The system auto-generates a full JD profile: mandatory skills, high-frequency keywords, preferred qualifications, and salary benchmarks.",
                  },
                  {
                    step: "03",
                    icon: <UploadCloud className="w-4 h-4" />,
                    color: "sky",
                    title: zh ? "上传您的简历" : "Upload Your Resume",
                    desc: zh
                      ? "支持 PDF / DOCX 文件上传或直接粘贴文本，也可使用内置示例简历快速体验系统完整流程。"
                      : "Upload PDF/DOCX or paste plain text. Use the built-in sample resume to explore the full workflow instantly.",
                  },
                  {
                    step: "04",
                    icon: <CheckCircle2 className="w-4 h-4" />,
                    color: "emerald",
                    title: zh ? "差距匹配分析" : "Gap Analysis & Match Score",
                    desc: zh
                      ? "AI 多维度评分，量化您的岗位匹配度（0–100分），逐条列出优势项与差距项，并给出关键词覆盖建议。"
                      : "AI scores your fit (0–100), listing strengths and gaps in detail, plus missing keyword suggestions.",
                  },
                  {
                    step: "05",
                    icon: <Edit className="w-4 h-4" />,
                    color: "amber",
                    title: zh ? "AI 改写 + 导出" : "AI Rewrite & Export",
                    desc: zh
                      ? "AI 自动生成标准版、高管版、AI产品版三套优化简历，逐条建议可一键采纳、撤销、AI重编。完成后导出 PDF / Word 或一键下载求职大礼包。"
                      : "AI generates Standard, Executive, and AI Product versions. Accept, undo, or regenerate suggestions per bullet. Export PDF/Word or download the full package.",
                  },
                ].map((item) => (
                  <div key={item.step} className="flex gap-4 items-start">
                    <div
                      className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-xs font-extrabold ${colorMap[item.color]}`}
                    >
                      {item.step}
                    </div>
                    <div>
                      <p className="font-bold text-sm text-slate-800">{item.title}</p>
                      <p className="text-xs text-slate-500 leading-relaxed mt-0.5">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-4 h-4 text-slate-500" />
                <span className="text-xs font-extrabold text-slate-600 uppercase tracking-wider">
                  {zh ? "数据隐私保障" : "Privacy Guarantee"}
                </span>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                {zh
                  ? "所有上传简历均进行手机号/邮箱脱敏处理，数据绝对不参与任何基础大模型训练，全程采用 AES-256 端到端加密传输存储。"
                  : "All uploaded CVs are desensitized (phone/email redacted). Data is never used for model training. All transfers use AES-256 end-to-end encryption."}
              </p>
            </div>
          </div>
        );

      case "account":
        return (
          <div className="space-y-5">
            <InfoBlock
              title={zh ? "注册账户" : "Register"}
              color="slate"
              items={
                zh
                  ? [
                      "点击登录页下方「立即注册」进入注册页。",
                      "填写用户名和密码（密码至少6位），提交后自动登录。",
                      "账户数据安全存储在 PostgreSQL 数据库中，仅用于个人使用。",
                    ]
                  : [
                      "Click 'Register Now' at the bottom of the login screen.",
                      "Enter username and password (min. 6 chars). You'll be auto-logged in.",
                      "Your data is stored securely in PostgreSQL and used only by you.",
                    ]
              }
            />
            <InfoBlock
              title={zh ? "登录 / 退出" : "Login / Logout"}
              color="slate"
              items={
                zh
                  ? [
                      "输入用户名和密码后点击「登录」按钮。",
                      "右上角点击用户头像图标 → 弹出菜单中点击「退出登录」。",
                      "退出后本地会话清除，数据安全保留在服务器端。",
                    ]
                  : [
                      "Enter username and password, then click 'Login'.",
                      "Click the user avatar in the top-right → 'Logout' in the dropdown.",
                      "The local session is cleared; your data stays safely on the server.",
                    ]
              }
            />
            <InfoBlock
              title={zh ? "语言切换" : "Language Toggle"}
              color="slate"
              items={
                zh
                  ? [
                      "页面右上角有「中 / EN」双语切换按钮。",
                      "切换后界面文字实时变更，当前任务数据不受影响。",
                    ]
                  : [
                      "Click the '中 / EN' toggle in the top-right to switch language.",
                      "The UI updates instantly; your task data is unaffected.",
                    ]
              }
            />
            <InfoBlock
              title={zh ? "未登录可以使用吗？" : "Guest Mode"}
              color="slate"
              items={
                zh
                  ? [
                      "未登录状态下可完整体验全部分析功能。",
                      "分析结果和历史记录仅保存在浏览器本地，不会同步到云端。",
                      "注册后历史数据将与账户绑定，支持跨设备访问。",
                    ]
                  : [
                      "All analysis features are fully accessible without login.",
                      "Results are stored locally in the browser only (no cloud sync).",
                      "Register to persist history across devices.",
                    ]
              }
            />
          </div>
        );

      case "role":
        return (
          <div className="space-y-5">
            <InfoBlock
              title={zh ? "输入目标岗位" : "Enter Target Role"}
              color="violet"
              items={
                zh
                  ? [
                      "在首页大文本框中输入您意向冲击的岗位名称，例如：AI 产品总监、大模型算法专家、AI 业务总经理。",
                      "点击「行业方向」可按 B端SaaS / 金融 / 医疗等细分赛道过滤岗位画像。",
                      "「工作城市」筛选支持北京 / 上海 / 深圳 / 广州等主要城市。",
                      "「意向职级」可选：总监/负责人、副总裁/VP、总经理、高级技术专家。",
                    ]
                  : [
                      "Type your target role in the main text box, e.g., AI Product Director, LLM Algorithm Expert.",
                      "Use the Industry dropdown to filter by B2B SaaS, Finance, Healthcare, etc.",
                      "Filter by City: Beijing, Shanghai, Shenzhen, and more.",
                      "Select Seniority: Director/Head, VP, GM, or Senior Tech Expert.",
                    ]
              }
            />
            <InfoBlock
              title={zh ? "热门岗位快速选择" : "Trending Role Shortcuts"}
              color="violet"
              items={
                zh
                  ? [
                      "输入框下方展示当前市场最热门的高管AI岗位标签，点击即可快速填入输入框。",
                      "热门岗位包含：AI 产品总监、大模型团队负责人、AI 商业化总经理等。",
                    ]
                  : [
                      "Below the input box, trending role chips are shown. Click any to auto-fill.",
                      "Examples: AI Product Director, LLM Team Lead, AI Commercialization GM.",
                    ]
              }
            />
            <InfoBlock
              title={zh ? "分析启动" : "Start Analysis"}
              color="violet"
              items={
                zh
                  ? [
                      "点击「分析目标岗位」按钮（或回车），系统开始联网实时检索，进度条实时更新。",
                      "分析通常耗时 5–15 秒，完成后自动跳转至「岗位画像报告」标签。",
                      "分析结果自动保存至历史记录，后续可随时回查。",
                    ]
                  : [
                      "Click 'Analyze Target Role' (or press Enter). A progress bar shows live status.",
                      "Analysis typically takes 5–15 seconds, then auto-navigates to the JD Profile tab.",
                      "Results are auto-saved to your history for later review.",
                    ]
              }
            />
          </div>
        );

      case "jd":
        return (
          <div className="space-y-5">
            <InfoBlock
              title={zh ? "市场画像总结" : "Market Summary"}
              color="indigo"
              items={
                zh
                  ? [
                      "报告顶部的「市场画像总结」是对该职位全景需求的 AI 提炼，包含岗位背景、典型公司类型、候选人画像特征。",
                      "数据来源标注了聚合的 JD 数量和时间范围。",
                    ]
                  : [
                      "The 'Market Summary' at the top is an AI synthesis of the full JD landscape for the role.",
                      "The data source label shows how many JDs were aggregated and over what timeframe.",
                    ]
              }
            />
            <InfoBlock
              title={zh ? "必备硬性要求" : "Mandatory Requirements"}
              color="indigo"
              items={
                zh
                  ? [
                      "列出该岗位在技术栈、学历、经验年限等方面的硬性门槛要求。",
                      "每项标注了出现频率（高 / 中 / 低），帮助您判断优先补强方向。",
                    ]
                  : [
                      "Hard requirements on tech stack, education, and years of experience.",
                      "Each item shows frequency (High/Medium/Low) to guide your prioritization.",
                    ]
              }
            />
            <InfoBlock
              title={zh ? "高频技能分布" : "High-Frequency Skills"}
              color="indigo"
              items={
                zh
                  ? [
                      "可视化展示该岗位在各类 JD 中出现频率最高的核心技能关键词。",
                      "技能词汇的颜色深浅和大小代表其在市场上出现的频次权重。",
                      "在后续上传简历后，系统会自动将这些关键词与您的简历进行比对覆盖率分析。",
                    ]
                  : [
                      "Visual breakdown of the most common core skill keywords across JDs.",
                      "Color intensity and size indicate frequency weight in the market.",
                      "After uploading your resume, the system auto-checks your coverage of these keywords.",
                    ]
              }
            />
            <InfoBlock
              title={zh ? "加分及优先考量" : "Preferred / Plus Skills"}
              color="indigo"
              items={
                zh
                  ? [
                      "列出招聘方明确标注为「优先」「加分」的软性技能、证书或经历。",
                      "这些项目虽非必备，但在简历改写时 AI 会优先突出与这些项目的相关性。",
                    ]
                  : [
                      "Lists items recruiters mark as 'preferred' or 'bonus', such as certifications or soft skills.",
                      "The AI prioritizes surfacing these in your rewritten resume.",
                    ]
              }
            />
            <InfoBlock
              title={zh ? "进入简历匹配" : "Proceed to Resume Matching"}
              color="indigo"
              items={
                zh
                  ? [
                      "报告底部有「进入简历匹配上传」按钮，点击后进入简历上传步骤。",
                      "也可在左侧导航栏点击「上传简历」直接跳转。",
                    ]
                  : [
                      "The 'Proceed to Upload Resume' button at the bottom navigates to the upload step.",
                      "Or click 'Upload Resume' in the left sidebar to jump directly.",
                    ]
              }
            />
          </div>
        );

      case "upload":
        return (
          <div className="space-y-5">
            <InfoBlock
              title={zh ? "支持的格式" : "Supported Formats"}
              color="sky"
              items={
                zh
                  ? [
                      "PDF 文件（.pdf）：直接上传，系统自动提取文字内容。",
                      "Word 文件（.docx）：直接上传，系统自动解析格式化内容。",
                      "纯文本粘贴：将简历内容直接粘贴至文本框，适合无文件场景。",
                      "示例简历：点击「使用示例简历」按钮可快速加载内置的高质量中文示例简历体验完整流程。",
                    ]
                  : [
                      "PDF (.pdf): Upload directly; the system auto-extracts text.",
                      "Word (.docx): Upload directly; formatted content is parsed.",
                      "Plain text paste: Paste directly into the text area.",
                      "Sample resume: Click 'Use Sample Resume' to load a built-in high-quality CV.",
                    ]
              }
            />
            <InfoBlock
              title={zh ? "文件上传方式" : "How to Upload"}
              color="sky"
              items={
                zh
                  ? [
                      "拖拽：将文件直接拖入上传区域（带虚线边框的灰色区域）。",
                      "点击选择：点击「选择本地文件」链接，弹出系统文件选择框。",
                      "最大支持文件大小：10 MB。",
                    ]
                  : [
                      "Drag & drop: Drag the file onto the dashed upload area.",
                      "Click to select: Click 'select a file' to open the system file picker.",
                      "Max supported file size: 10 MB.",
                    ]
              }
            />
            <InfoBlock
              title={zh ? "上传后操作" : "After Upload"}
              color="sky"
              items={
                zh
                  ? [
                      "上传成功后，文本区域会展示系统解析出的简历内容，供您核查确认。",
                      "如内容有偏差，可直接在文本框内手动编辑修正。",
                      "确认无误后点击「开始差距匹配分析」按钮，进入 AI 评分流程。",
                    ]
                  : [
                      "After upload, the parsed text is shown in the text area for you to review.",
                      "If content is incorrect, edit it directly in the text box.",
                      "Click 'Start Gap Analysis' to begin the AI scoring process.",
                    ]
              }
            />
          </div>
        );

      case "match":
        return (
          <div className="space-y-5">
            <InfoBlock
              title={zh ? "匹配分数说明" : "Match Score Explained"}
              color="emerald"
              items={
                zh
                  ? [
                      "AI 综合评估您的简历与目标岗位 JD 的匹配程度，给出 0–100 的量化分数。",
                      "80分以上：匹配度极高，可直接进入改写优化环节。",
                      "60–79分：中等匹配，改写后竞争力将显著提升。",
                      "60分以下：存在明显差距，AI 改写和针对性内容补充将大幅提升命中率。",
                    ]
                  : [
                      "AI scores your resume-to-JD alignment from 0–100.",
                      "80+: Excellent fit — proceed to rewriting for polish.",
                      "60–79: Good fit — rewriting will significantly boost your edge.",
                      "Below 60: Significant gaps — AI rewriting and content additions will substantially improve results.",
                    ]
              }
            />
            <InfoBlock
              title={zh ? "优势项 / 差距项" : "Strengths & Gaps"}
              color="emerald"
              items={
                zh
                  ? [
                      "「优势项」：您的简历中已覆盖且高度匹配岗位要求的技能、经历和成就。",
                      "「差距项」：岗位 JD 中频繁出现但您的简历中缺失或表达不足的内容。",
                      "每项差距均附有改进建议说明，指导后续改写方向。",
                    ]
                  : [
                      "'Strengths': Skills, experience, and achievements in your CV that strongly match the JD.",
                      "'Gaps': Keywords and requirements in the JD that are missing or underrepresented in your CV.",
                      "Each gap includes an improvement suggestion for the rewriting step.",
                    ]
              }
            />
            <InfoBlock
              title={zh ? "关键词覆盖分析" : "Keyword Coverage"}
              color="emerald"
              items={
                zh
                  ? [
                      "系统将岗位画像报告中提炼的高频关键词与您的简历逐一比对，标注「已覆盖 / 缺失」状态。",
                      "「缺失关键词」建议可在改写阶段由 AI 自然植入相关表达，或手动在简历中补充真实经历说明。",
                    ]
                  : [
                      "The system checks every high-frequency keyword from the JD profile against your resume, marking each as 'covered' or 'missing'.",
                      "Missing keywords will be naturally incorporated by the AI during the rewrite phase.",
                    ]
              }
            />
            <InfoBlock
              title={zh ? "进入 AI 改写" : "Proceed to AI Rewrite"}
              color="emerald"
              items={
                zh
                  ? [
                      "点击「解锁高管级 AI 改写」按钮，系统将启动大模型全量重构简历流程。",
                      "系统会生成标准版、高管版、AI产品版三套定向优化简历。",
                    ]
                  : [
                      "Click 'Unlock Executive AI Rewrite'. The LLM begins reconstructing your resume.",
                      "Three versions are generated: Standard, Executive, and AI Product.",
                    ]
              }
            />
          </div>
        );

      case "rewrite":
        return (
          <div className="space-y-5">
            <InfoBlock
              title={zh ? "三套版本说明" : "Three Resume Versions"}
              color="amber"
              items={
                zh
                  ? [
                      "标准优化版：在保持原始表述风格的基础上，系统性增强关键词密度和量化成果表达。",
                      "高管改写版：采用 C-Level 领导力语言体系，突出 P&L 责任、跨职能影响力和战略执行深度。",
                      "AI产品定向版：专为 AI/大模型方向岗位优化，深度突出技术判断力、产业落地经验和商业化能力。",
                    ]
                  : [
                      "Standard: Systematically enhances keyword density and quantified outcomes while keeping your original tone.",
                      "Executive: Uses C-Level leadership language, highlighting P&L ownership, cross-functional influence, and strategic depth.",
                      "AI Product: Tailored for AI/LLM roles — emphasizes technical judgment, industry deployment, and commercialization.",
                    ]
              }
            />
            <InfoBlock
              title={zh ? "AI 优化建议卡片" : "AI Suggestion Cards"}
              color="amber"
              items={
                zh
                  ? [
                      "左侧展示 AI 生成的逐条改写建议，每条建议包含原文（灰色背景）和改写版本（蓝色背景）。",
                      "建议按章节分组：个人简介、核心能力、工作经历、项目经历等。",
                      "右侧「重构简历预览」实时反映所有已采纳建议后的最终效果。",
                    ]
                  : [
                      "The left panel shows AI suggestion cards with original text (gray) and rewrite (blue).",
                      "Suggestions are grouped by section: Summary, Core Capabilities, Experience, Projects, etc.",
                      "The right 'Resume Preview' panel updates in real-time as you accept suggestions.",
                    ]
              }
            />
            <InfoBlock
              title={zh ? "建议操作说明" : "Suggestion Actions"}
              color="amber"
              items={
                zh
                  ? [
                      "「采纳到右侧」：将 AI 改写内容即时替换简历对应章节，并自动同步保存至数据库。右侧预览立即更新。",
                      "「↩ 撤销」：点击已采纳建议卡片右下角的「↩ 撤销」，简历恢复至采纳前的原始状态，实时同步数据库。",
                      "「AI 重编」：对当前 AI 改写结果不满意？点击重新调用大模型生成新的改写版本。",
                      "「忽略」：跳过当前建议，建议卡片变灰，不影响简历内容。可随时点击「恢复建议」撤销忽略。",
                      "直接编辑：对已采纳的建议，可在卡片内的文本框直接修改内容，失去焦点后自动保存。",
                    ]
                  : [
                      "'Accept': Instantly applies the AI rewrite to the resume section and auto-saves to the database. Preview updates immediately.",
                      "'↩ Undo': Restores the section to its pre-accept state (the exact content shown before accepting). Synced to the database.",
                      "'Regenerate': Unhappy with the current suggestion? Calls the AI to generate a new rewrite.",
                      "'Ignore': Skip the suggestion. The card turns gray and has no effect on the resume. Click 'Restore' to reactivate.",
                      "Direct edit: For accepted suggestions, you can edit the text in the card's text area. Auto-saved on blur.",
                    ]
              }
            />
            <InfoBlock
              title={zh ? "版本切换" : "Switching Versions"}
              color="amber"
              items={
                zh
                  ? [
                      "在「重构简历预览」区域顶部，有标准版 / 高管版 / AI产品版三个标签按钮，点击即可切换预览和建议列表。",
                      "不同版本的建议列表相互独立，可分别采纳/撤销。",
                      "导出时可选择导出当前版本或一次性导出全部三个版本（大礼包）。",
                    ]
                  : [
                      "Use the Standard / Executive / AI Product tabs above the preview to switch between versions.",
                      "Each version has an independent suggestion list — accept/undo actions are version-specific.",
                      "You can export the current version or all three at once via the full package.",
                    ]
              }
            />
            <InfoBlock
              title={zh ? "直接编辑预览区" : "Edit Preview Directly"}
              color="amber"
              items={
                zh
                  ? [
                      "点击右侧预览区右上角「编辑简历」按钮，可切换至可编辑的富文本视图。",
                      "在编辑模式下可自由修改简历任意字段，修改内容会即时保存至当前版本。",
                      "点击「保存」可将编辑结果同步至数据库。",
                    ]
                  : [
                      "Click 'Edit Resume' in the top-right of the preview panel to enter edit mode.",
                      "Freely edit any field in the resume; changes are saved to the current version.",
                      "Click 'Save' to persist edits to the database.",
                    ]
              }
            />
          </div>
        );

      case "export":
        return (
          <div className="space-y-5">
            <InfoBlock
              title={zh ? "导出 PDF" : "Export PDF"}
              color="rose"
              items={
                zh
                  ? [
                      "点击右侧预览区工具栏中的「导出 PDF」按钮，系统在服务端使用 Puppeteer + Chromium 生成高保真 PDF 文件。",
                      "PDF 使用内嵌 Noto Sans SC 字体，确保中文字符完整正常显示，无乱码。",
                      "生成完成后自动下载至本地，文件名格式：姓名_目标岗位_优化版.pdf。",
                    ]
                  : [
                      "Click 'Export PDF' in the toolbar. The server generates a high-fidelity PDF via Puppeteer + Chromium.",
                      "PDFs use embedded Noto Sans SC font to ensure CJK characters render correctly.",
                      "The file auto-downloads, named: Name_Role_Optimized.pdf.",
                    ]
              }
            />
            <InfoBlock
              title={zh ? "导出 Word (.docx)" : "Export Word (.docx)"}
              color="rose"
              items={
                zh
                  ? [
                      "点击「导出 Word」按钮，系统生成标准 .docx 格式文件，支持在 Microsoft Word、WPS 等软件中进一步编辑。",
                      "Word 版本保留标题、段落、加粗等基础格式，便于二次加工。",
                    ]
                  : [
                      "Click 'Export Word'. The server generates a .docx file, editable in Microsoft Word or WPS.",
                      "The Word version retains headings, paragraphs, and bold formatting for easy editing.",
                    ]
              }
            />
            <InfoBlock
              title={zh ? "专属求职大礼包 (.zip)" : "Full Job-Search Package (.zip)"}
              color="rose"
              items={
                zh
                  ? [
                      "点击「专属求职大礼包 (.zip)」按钮，系统打包生成一个压缩包，包含以下文件：",
                      "简历（PDF + Word）× 3 个版本（标准版、高管版、AI产品版），共 6 份简历文件。",
                      "岗位市场画像报告（PDF）：完整的岗位研究报告。",
                      "差距匹配分析报告（PDF）：您的简历与目标岗位的差距矩阵评分报告。",
                      "压缩包文件按编号命名，下载后解压即可获取全部材料，一站式求职资料包。",
                    ]
                  : [
                      "Click 'Full Job-Search Package (.zip)'. The server packages the following files:",
                      "Resume (PDF + Word) × 3 versions (Standard, Executive, AI Product) = 6 resume files.",
                      "JD Market Profile Report (PDF): full JD research findings.",
                      "Gap Analysis Report (PDF): your resume-to-JD gap matrix scorecard.",
                      "Files are numbered for easy organization. One-click download = complete job application kit.",
                    ]
              }
            />
          </div>
        );

      case "history":
        return (
          <div className="space-y-5">
            <InfoBlock
              title={zh ? "查看历史任务" : "View History"}
              color="slate"
              items={
                zh
                  ? [
                      "点击顶部导航栏「历史检索」或左侧侧边栏「历史」按钮，展开历史任务下拉面板。",
                      "每条历史记录显示目标岗位名称、分析时间和当前完成状态。",
                      "「已生成」「已上传」「已匹配」「已完成」等状态标签反映任务的推进阶段。",
                    ]
                  : [
                      "Click 'History' in the top nav or sidebar to open the history panel.",
                      "Each record shows the target role, analysis time, and current completion status.",
                      "Status tags (Profiled, Uploaded, Matched, Finalized) reflect the task stage.",
                    ]
              }
            />
            <InfoBlock
              title={zh ? "继续编辑历史任务" : "Resume a Past Task"}
              color="slate"
              items={
                zh
                  ? [
                      "点击历史记录列表中任意一条，系统将加载该任务的所有数据，包括岗位画像、差距分析和改写结果。",
                      "您可以继续上次未完成的操作，或重新导出文件。",
                    ]
                  : [
                      "Click any history entry. The system loads all data for that task: JD profile, gap analysis, and rewrite results.",
                      "Continue where you left off, or re-export files.",
                    ]
              }
            />
            <InfoBlock
              title={zh ? "删除历史任务" : "Delete a Task"}
              color="slate"
              items={
                zh
                  ? [
                      "在历史任务下拉列表中，每条记录右侧有垃圾桶图标，点击后弹出确认提示。",
                      "确认删除后，该任务的所有数据（岗位画像、简历分析、改写结果）将永久删除，不可恢复。",
                    ]
                  : [
                      "Click the trash icon to the right of any history item. A confirmation prompt appears.",
                      "Deletion is permanent — the JD profile, gap analysis, and rewrite data are all removed.",
                    ]
              }
            />
          </div>
        );

      case "notify":
        return (
          <div className="space-y-5">
            <InfoBlock
              title={zh ? "通知中心" : "Notification Center"}
              color="orange"
              items={
                zh
                  ? [
                      "点击顶部导航栏右侧的铃铛图标 🔔 打开通知面板。",
                      "红色小圆点表示有未读通知，数字标注未读数量。",
                      "通知类型包括：AI 分析完成提醒、系统公告、版本功能更新等。",
                    ]
                  : [
                      "Click the 🔔 bell icon in the top-right to open the notification panel.",
                      "A red dot and count badge indicate unread notifications.",
                      "Notification types include: AI analysis complete, system announcements, feature updates.",
                    ]
              }
            />
            <InfoBlock
              title={zh ? "标记为已读" : "Mark as Read"}
              color="orange"
              items={
                zh
                  ? [
                      "点击通知面板右上角「全部忽略」将所有通知标记为已读。",
                      "已读通知的红点消失，面板数字徽章清零。",
                    ]
                  : [
                      "Click 'Mark all read' in the top-right of the notification panel.",
                      "The red dot disappears and the badge count resets to zero.",
                    ]
              }
            />
          </div>
        );

      case "faq":
        const faqs = zh
          ? [
              {
                q: "AI 改写会编造我没有的经历吗？",
                a: "不会。AI 只对您已有的简历内容进行表达升级和语言优化，不会凭空添加任何不实内容。在保护事实真实性的前提下，AI 会将普通描述改写为更有力度的高阶领导力表达。",
              },
              {
                q: "为什么采纳建议后右侧预览没有变化？",
                a: "请确认您点击的是「采纳到右侧」按钮（蓝色按钮），而不是「忽略」或「AI 重编」。如采纳后仍无变化，请尝试刷新页面，历史数据会自动恢复。",
              },
              {
                q: "导出的 PDF 中出现乱码怎么办？",
                a: "系统已内置 Noto Sans SC 中文字体并在 PDF 生成时自动嵌入，正常情况下中文字符能正常显示。若仍出现乱码，建议使用 Chrome 或 Edge 浏览器并重试。",
              },
              {
                q: "大礼包 .zip 解压后包含哪些文件？",
                a: "包含：标准版简历 PDF、标准版简历 DOCX、高管版简历 PDF、高管版简历 DOCX、AI产品版简历 PDF、AI产品版简历 DOCX、岗位市场画像报告 PDF、差距匹配分析报告 PDF，共 8 个文件。",
              },
              {
                q: "历史任务会永久保存吗？",
                a: "登录账户后，历史任务会持久化保存在服务器端 PostgreSQL 数据库中，支持跨设备访问。未登录情况下任务数据仅保存在浏览器本地，清除浏览器数据后会丢失。",
              },
              {
                q: "可以同时分析多个不同岗位吗？",
                a: "可以。每次输入新的目标岗位会创建独立的分析任务，旧任务自动保存至历史记录。您可以随时在历史记录中切换查阅不同岗位的分析结果。",
              },
              {
                q: "AI 重编与刷新页面有什么区别？",
                a: "「AI 重编」仅对当前建议卡片对应的单条内容重新调用 AI 生成新版本，其余所有已采纳/已忽略的建议状态保持不变。刷新页面会保留所有已持久化到数据库的操作结果。",
              },
              {
                q: "支持英文简历吗？",
                a: "系统同时支持中英双语界面，上传英文简历后 AI 可对英文内容进行同等质量的分析和改写。岗位数据检索当前以中文市场数据为主，英文岗位支持正在扩展中。",
              },
            ]
          : [
              {
                q: "Will the AI fabricate experience I don't have?",
                a: "Never. The AI only enhances and elevates existing content in your resume — it never adds fictitious experience. It upgrades ordinary descriptions to high-impact executive language while preserving factual accuracy.",
              },
              {
                q: "Why didn't the resume preview update after I accepted a suggestion?",
                a: "Make sure you clicked the blue 'Accept' button, not 'Ignore' or 'Regenerate'. If the preview still doesn't update, try refreshing — all persisted data will be restored automatically.",
              },
              {
                q: "The exported PDF shows garbled text — what should I do?",
                a: "The system embeds the Noto Sans SC font at PDF generation time to ensure correct CJK rendering. If garbled text appears, try using Chrome or Edge and retry the export.",
              },
              {
                q: "What files are in the .zip package?",
                a: "8 files total: Standard Resume PDF & DOCX, Executive Resume PDF & DOCX, AI Product Resume PDF & DOCX, JD Market Profile Report PDF, Gap Analysis Report PDF.",
              },
              {
                q: "Are history tasks saved permanently?",
                a: "When logged in, tasks are persisted in the server's PostgreSQL database and accessible across devices. Without login, data is stored in the browser only and lost if browser storage is cleared.",
              },
              {
                q: "Can I analyze multiple roles at once?",
                a: "Yes. Each new role creates an independent task, auto-saved to history. Switch between them anytime from the History panel.",
              },
            ];

        return (
          <div className="space-y-3">
            {faqs.map((faq, idx) => (
              <div key={idx} className="border border-slate-200 rounded-xl overflow-hidden">
                <button
                  onClick={() => setExpandedFaq(expandedFaq === `${idx}` ? null : `${idx}`)}
                  className="w-full flex items-center justify-between px-4 py-3.5 text-left hover:bg-slate-50 transition-colors"
                >
                  <span className="text-sm font-semibold text-slate-800 pr-2">{faq.q}</span>
                  {expandedFaq === `${idx}` ? (
                    <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                  )}
                </button>
                {expandedFaq === `${idx}` && (
                  <div className="px-4 pb-4 bg-slate-50 border-t border-slate-100">
                    <p className="text-sm text-slate-600 leading-relaxed pt-3">{faq.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-[90vh] flex flex-col overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-900 to-slate-800 rounded-t-2xl shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center">
              <BookOpen className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              <h2 className="font-extrabold text-white text-sm leading-tight">
                {zh ? "CareerAI 操作手册" : "CareerAI User Guide"}
              </h2>
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">
                {zh ? "全功能图文指引 V0.4 PRO" : "Full Feature Guide V0.4 PRO"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar Nav */}
          <nav className="w-52 shrink-0 border-r border-slate-100 bg-slate-50/60 p-3 overflow-y-auto">
            <p className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest px-2 mb-2">
              {zh ? "目录" : "Contents"}
            </p>
            {sections.map((section) => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-all mb-0.5 ${
                  activeSection === section.id
                    ? `${colorMap[section.color]} font-bold shadow-sm`
                    : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                }`}
              >
                <span className={activeSection === section.id ? "" : "opacity-60"}>{section.icon}</span>
                <span className="text-xs truncate">{section.title}</span>
                {activeSection === section.id && (
                  <ChevronRight className="w-3 h-3 ml-auto shrink-0" />
                )}
              </button>
            ))}
          </nav>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {/* Section header */}
            <div className="flex items-center gap-3 mb-5">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center border ${colorMap[activeColor]}`}>
                {sections.find((s) => s.id === activeSection)?.icon}
              </div>
              <div>
                <h3 className="font-extrabold text-slate-900 text-base leading-tight">
                  {sections.find((s) => s.id === activeSection)?.title}
                </h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                  {zh ? "CareerAI 操作手册" : "CareerAI User Guide"}
                </p>
              </div>
            </div>

            {renderContent()}
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoBlock({
  title,
  color,
  items,
}: {
  title: string;
  color: string;
  items: string[];
}) {
  const colorMap: Record<string, string> = {
    blue: "border-blue-200 bg-blue-50/50",
    slate: "border-slate-200 bg-slate-50/50",
    violet: "border-violet-200 bg-violet-50/50",
    indigo: "border-indigo-200 bg-indigo-50/50",
    sky: "border-sky-200 bg-sky-50/50",
    emerald: "border-emerald-200 bg-emerald-50/50",
    amber: "border-amber-200 bg-amber-50/50",
    rose: "border-rose-200 bg-rose-50/50",
    orange: "border-orange-200 bg-orange-50/50",
    teal: "border-teal-200 bg-teal-50/50",
  };
  const dotMap: Record<string, string> = {
    blue: "bg-blue-400",
    slate: "bg-slate-400",
    violet: "bg-violet-400",
    indigo: "bg-indigo-400",
    sky: "bg-sky-400",
    emerald: "bg-emerald-400",
    amber: "bg-amber-400",
    rose: "bg-rose-400",
    orange: "bg-orange-400",
    teal: "bg-teal-400",
  };
  const titleMap: Record<string, string> = {
    blue: "text-blue-700",
    slate: "text-slate-700",
    violet: "text-violet-700",
    indigo: "text-indigo-700",
    sky: "text-sky-700",
    emerald: "text-emerald-700",
    amber: "text-amber-700",
    rose: "text-rose-700",
    orange: "text-orange-700",
    teal: "text-teal-700",
  };

  return (
    <div className={`border rounded-xl p-4 ${colorMap[color]}`}>
      <h4 className={`font-extrabold text-sm mb-3 ${titleMap[color]}`}>{title}</h4>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2.5 items-start">
            <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${dotMap[color]}`} />
            <span className="text-sm text-slate-600 leading-relaxed">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
