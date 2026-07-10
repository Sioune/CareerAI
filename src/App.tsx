import React, { useState, useEffect } from "react";
import { 
  Search, 
  BarChart3, 
  UploadCloud, 
  CheckCircle2, 
  Lock, 
  FileText, 
  Settings, 
  Bell, 
  Sparkles, 
  HelpCircle, 
  Shield, 
  Edit, 
  Download, 
  ChevronDown, 
  ChevronRight, 
  ArrowRight, 
  History, 
  User, 
  RefreshCw, 
  CreditCard, 
  Check, 
  Loader2, 
  Plus, 
  Trash2,
  AlertCircle,
  Menu,
  X,
  Share2,
  Copy,
  Gift,
  MessageSquare,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  BookOpen
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { 
  JobResearchReport, 
  ResumeMatchReport, 
  OptimizedResume, 
  TaskItem 
} from "./types";
import { customFetch } from "./lib/custom-fetch";
import HelpCenter from "./HelpCenter";

// Standard pre-loaded executive resume for quick user testing (Chinese)
const SAMPLE_RESUME_ZH = `张建国 | 资深产品经理
邮箱: jianguo.zhang@email.com | 电话: 138-1234-5678 | 北京
个人主页: github.com/jianguo | 意向: AI产品负责人

工作经历:
1. 科技领航者集团 (Tech Corp) - 高级产品经理 | 2021年至今
- 负责公司搜索产品的功能迭代与用户增长。
- 主导算法团队完成了推荐系统优化，用户留存率提升了5%。
- 负责产品设计与跨团队沟通，撰写高质量PRD文档。
- 参与了大语言模型在客服场景的落地尝试，开发了对话生成功能。

2. 前沿硬科技初创公司 (Startup Inc) - 产品经理 | 2018年 - 2021年
- 负责智能客服系统1.0的产品规划与上线。
- 负责对接外部政企客户需求，提供定制化解决方案。
- 通过数据分析 and A/B 测试，优化意向识别模型。

教育背景:
- 北京航空航天大学 ｜ 计算机科学与技术学士 ｜ 2014年 - 2018年`;

// Standard pre-loaded executive resume for quick user testing (English)
const SAMPLE_RESUME_EN = `Jianguo Zhang | Senior Product Manager
Email: jianguo.zhang@email.com | Tel: 138-1234-5678 | Beijing
Homepage: github.com/jianguo | Target: AI Product Head

Work Experience:
1. Tech Pioneer Group (Tech Corp) - Senior Product Manager | 2021 - Present
- Led feature iteration and user growth for core search product.
- Coordinated with algorithm team to optimize recommendations, increasing user retention by 5%.
- Owned product design, cross-functional alignment, and high-quality PRD drafting.
- Initiated generative LLM trials in customer support and built dialog generation tools.

2. Frontier DeepTech (Startup Inc) - Product Manager | 2018 - 2021
- Handled end-to-end product planning and release for Intelligent Support 1.0.
- Interfaced with enterprise and government clients to design tailored solutions.
- Conducted data analyses and A/B tests to optimize intent classification models.

Education:
- Beihang University | B.S. in Computer Science & Engineering | 2014 - 2018`;

// Helper function to extract specific suggested rewriting text (with 'xxx' placeholder) from a bullet suggestion bracket
const extractReference = (text: string): string | null => {
  if (!text) return null;
  // Look for 【建议补充：例如“...”】 or 【建议补充：...】
  const matchQuote = text.match(/【建议补充：(?:例如“([^”]+)”|([^】]+))】/);
  if (matchQuote) {
    return matchQuote[1] || matchQuote[2];
  }
  return null;
};

export default function App() {
  // Global States
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<'researched' | 'matching' | 'matched' | 'upgraded' | 'finalized' | null>(null);
  
  // Multi-Language state
  const [lang, setLang] = useState<'zh' | 'en'>(() => {
    const saved = localStorage.getItem('app_lang');
    return (saved === 'en' || saved === 'zh') ? saved : 'zh';
  });

  const toggleLang = (l: 'zh' | 'en') => {
    setLang(l);
    localStorage.setItem('app_lang', l);
    triggerToast(l === 'zh' ? '已切换至简体中文' : 'Switched to English');
  };

  // Translations object
  const t = {
    roleInput: lang === 'zh' ? '输入岗位' : 'Role Input',
    jdAnalysis: lang === 'zh' ? '岗位画像' : 'JD Analysis',
    uploadResume: lang === 'zh' ? '上传简历' : 'Upload',
    matchScore: lang === 'zh' ? '匹配分析' : 'Match Score',
    upgradePaywall: lang === 'zh' ? '付费解锁' : 'Upgrade',
    finalize: lang === 'zh' ? '简历生成' : 'Finalize',
    
    newRole: lang === 'zh' ? '新建岗位' : 'New Role',
    history: lang === 'zh' ? '历史记录' : 'History',
    executivePortal: lang === 'zh' ? '高管专属端' : 'Executive Portal',
    historySearch: lang === 'zh' ? '历史检索' : 'History',
    collapse: lang === 'zh' ? '收起' : 'Collapse',
    noHistory: lang === 'zh' ? '暂无历史检索记录，快去输入一个目标岗位体验吧！' : 'No history found. Try entering a target role!',
    
    editResume: lang === 'zh' ? '编辑简历' : 'Edit Resume',
    exportResume: lang === 'zh' ? '导出简历' : 'Export Resume',
    exportWord: lang === 'zh' ? '导出 Word (.docx)' : 'Export Word (.docx)',
    exportPDF: lang === 'zh' ? '导出 PDF (.pdf)' : 'Export PDF (.pdf)',
    languageSettings: lang === 'zh' ? '语言设置' : 'Language Settings',

    // Extra comprehensive terms requested by user for robust dual-language output:
    optimizerTitle: lang === 'zh' ? '简历优化器' : 'Resume Optimizer',
    executiveEdition: lang === 'zh' ? 'AI高管专版' : 'Executive AI Edition',
    premiumSupport: lang === 'zh' ? '高级特权客服' : 'Get Premium Support',
    helpCenter: lang === 'zh' ? '帮助中心' : 'Help Center',
    privacy: lang === 'zh' ? '隐私保障' : 'Privacy',
    supportMsg: lang === 'zh' ? '已为您打开邮件客户端，发送至 siounex@qq.com，我们的高管顾问会尽快与您联系。' : 'Opening your email client to siounex@qq.com. Our support team will get back to you shortly.',
    helpMsg: lang === 'zh' ? '已打开帮助中心...您也可以随时输入目标岗位让AI自动进行全量检索。' : 'Help center opened. You can search any role to query public databases automatically.',
    privacyMsg: lang === 'zh' ? '数据隐私安全保障：所有上传简历将进行手机号/邮箱脱敏，且数据绝对不参与任何基础模型训练。' : 'Data privacy guarantee: CVs are fully desensitized and will never be used for training.',

    // Loader Screen
    loadResearchTitle: lang === 'zh' ? '正在联网实时检索中文市场高管JD...' : 'Searching & analyzing live executive JDs...',
    loadMatchingTitle: lang === 'zh' ? 'AI正在对您的简历进行深度差距研判评分...' : 'Deep learning match matrix in progress...',
    loadUpgradingTitle: lang === 'zh' ? '大模型正在重构简历结构并靶向升级高阶动作语句...' : 'AI is restructuring resume into leadership action statements...',
    loadResearchDesc: lang === 'zh' ? '自动聚合25+企业官网公开招聘页、官方授权API等权威公司发布渠道。' : 'Aggregating 25+ corporate listings, authorized APIs, and executive hiring portals.',
    loadMatchingDesc: lang === 'zh' ? '对标前沿技能覆盖度、P&L预算权、跨研发团队掌控力与商业结果交付。' : 'Benchmarking skill density, P&L ownership, and cross-functional leadership scale.',
    loadUpgradingDesc: lang === 'zh' ? '结合您过往真实经历，在保护事实的前提下升级高频率领导力高阶词汇。' : 'Upgrading vocabulary to C-level impact while preserving authentic work history facts.',
    completedLabel: lang === 'zh' ? '完成' : 'Completed',

    // Role Input Screen
    targetAnalysis: lang === 'zh' ? '高阶求职目标多维研判' : 'Executive Target Analysis',
    unlockTitle: lang === 'zh' ? '解锁您的下一个' : 'Unlock Your Next',
    unlockRole: lang === 'zh' ? 'AI 高阶领袖角色' : 'AI Executive Role',
    unlockDesc: lang === 'zh' ? '输入您意向冲击的高阶AI岗位，系统将智能联网多维检索中文主流高管用工需求，为您打造100%对齐真实的靶向改写简历。' : 'Enter your target high-level AI role, and our system will query mainstream executive JD databases to build a 100% custom-tailored, optimized resume.',
    placeholderRole: lang === 'zh' ? '例如：AI 产品总监, 大模型算法专家, AI 业务总经理' : 'e.g., AI Product Director, Large Model Algorithm Expert, AI GM',
    analyzeBtn: lang === 'zh' ? '分析目标岗位' : 'Analyze Target Role',
    industryLabel: lang === 'zh' ? '行业方向 (选填)' : 'Industry (Optional)',
    placeholderIndustry: lang === 'zh' ? '如: B端SaaS / 金融' : 'e.g., B2B SaaS / Finance',
    locationLabel: lang === 'zh' ? '工作城市 (选填)' : 'Location (Optional)',
    placeholderLocation: lang === 'zh' ? '如: 北京 / 上海' : 'e.g., Beijing / Shanghai',
    seniorityLabel: lang === 'zh' ? '意向职级 (选填)' : 'Seniority (Optional)',
    seniority1: lang === 'zh' ? '总监 / 负责人 (Executive)' : 'Director / Head',
    seniority2: lang === 'zh' ? '副总裁 / VP (VP Level)' : 'Vice President / VP',
    seniority3: lang === 'zh' ? '总经理 (GM Level)' : 'General Manager / GM',
    seniority4: lang === 'zh' ? '高级技术专家 (Expert)' : 'Senior Technical Expert',
    trendingRoles: lang === 'zh' ? '热门岗位' : 'Trending Roles',
    optimizationProcess: lang === 'zh' ? '优化流程' : 'The Optimization Process',
    process1Title: lang === 'zh' ? '1. 输入意向岗位' : '1. Enter Target Role',
    process1Desc: lang === 'zh' ? '提供您的求职目标及特定背景。系统会自动启动高效率的中文市场多点岗位信息深度检索。' : 'Specify your target role. Our system crawls public and premium corporate databases to harvest the latest market JDs.',
    process2Title: lang === 'zh' ? '2. 全量画像画像生成' : '2. Profile & Benchmark',
    process2Desc: lang === 'zh' ? '深入拆解该岗位所需的技术栈深度、商业理解、预算管理和团队管理层级的必备与加分优势要求。' : 'Deconstruct mandatory skills, business-level execution metrics, P&L budget controls, and leadership layers.',
    process3Title: lang === 'zh' ? '3. 大模型靶向优化' : '3. AI Rewrite Engine',
    process3Desc: lang === 'zh' ? '导入您的个人简历，通过差距矩阵，由大语言模型在保留真实性的基础上完成一键高阶表达优化。' : 'Upload your CV to compare alignment gaps. Our AI engine automatically reformulates accomplishments using STAR format.',

    // Task Subheader
    targetContext: lang === 'zh' ? '目标岗位上下文' : 'Target Role Context',
    marketInsight: lang === 'zh' ? '市场画像报告' : 'Market Insight Report',
    dataAggregated: lang === 'zh' ? '数据聚合成自最近' : 'Data aggregated from',
    dataAggregatedSuffix: lang === 'zh' ? '个高管级招聘简章。' : ' recent executive-level job descriptions.',
    pillResearched: lang === 'zh' ? '岗位画像已生成' : 'JD Profile Generated',
    pillMatching: lang === 'zh' ? '已上传等待比对' : 'Uploaded, Pending Analysis',
    pillMatched: lang === 'zh' ? '差距评估已完成' : 'Gap Analysis Completed',
    pillUpgraded: lang === 'zh' ? '已解锁高管改写' : 'Executive Optimizer Unlocked',
    pillFinalized: lang === 'zh' ? '靶向优化简历已生成' : 'Target-Optimized Resume Active',

    // JD Analysis Screen
    researchSummary: lang === 'zh' ? '市场画像总结' : 'Research Summary',
    mandatoryRequirements: lang === 'zh' ? '必备硬性要求' : 'Mandatory Requirements',
    highFrequencySkills: lang === 'zh' ? '核心高频技术/硬技能分布' : 'High-Frequency Tech/Hard Skills Frequency',
    plusSkills: lang === 'zh' ? '加分及优先考量' : 'Plus & Preferred Skills',
    ctaMatchTitle: lang === 'zh' ? '测一测您与该职位的匹配契合度' : 'Test Your Competency Alignment',
    ctaMatchDesc: lang === 'zh' ? '一键上传或复制粘贴您目前的中文求职简历。大模型会自动进行多维度差距矩阵比对，并得出量化匹配评分，指出您目前的隐性技能劣势和改写建议。' : 'Upload or copy-paste your current CV. AI will generate a gap-fit scorecard, highlighting key vulnerabilities and actionable improvement steps.',
    ctaMatchBtn: lang === 'zh' ? '进入简历匹配上传' : 'Proceed to Upload Resume',

    // Upload Screen
    uploadCVTitle: lang === 'zh' ? '上传您的当前简历' : 'Upload Your Current Resume',
    orPasteText: lang === 'zh' ? '或粘贴求职简历文本' : 'Or Paste CV Text',
    pasteHelper: lang === 'zh' ? '请粘贴或拖拽您的最新简历内容至下方，以便AI进行对标分析与靶向重构。' : 'Please paste or drop your resume text to enable deep competency analysis.',
    dragDrop: lang === 'zh' ? '拖拽简历文件到此处，或' : 'Drag & drop your resume file here, or',
    selectLocal: lang === 'zh' ? '选择本地文件' : 'select a file',
    fileFormats: lang === 'zh' ? '支持 .txt, .pdf, .docx 格式' : 'Supports .txt, .pdf, .docx files',
    pastePlaceholder: lang === 'zh' ? '粘贴您的个人简历文本...' : 'Paste your raw resume text here...',
    importSample: lang === 'zh' ? '导入系统内置高阶测试简历 (一键体验)' : 'Import Sample Resume (One-Click Trial)',
    backToProfile: lang === 'zh' ? '返回画像' : 'Back to Profile',
    analyzeMatch: lang === 'zh' ? '分析简历匹配度' : 'Analyze Match Alignment',

    // Match Score Screen
    alignmentScore: lang === 'zh' ? '高管级匹配度评分' : 'Competency Match Score',
    scoreDesc1: lang === 'zh' ? '对标高频筛查要素，您的综合得分为' : 'Against core keywords, your overall score is',
    scoreDesc2: lang === 'zh' ? '分。存在隐性短板，建议升级高管语言。' : '%. Some skills gap identified. Upgrading to executive language is highly recommended.',
    scoreDesc3: lang === 'zh' ? '分。契合度极高，可直接解锁改写投递。' : '%! Outperforms 85% of applicants. High alignment, ready for final optimize.',
    strengthsAnalysis: lang === 'zh' ? '核心竞争优势' : 'Strengths & Alignment',
    strengthsSub: lang === 'zh' ? '原简历中已较好对齐或体现的高管特质' : 'C-Level traits already well-aligned in your resume',
    gapAnalysis: lang === 'zh' ? '主要差距与劣势' : 'Vulnerabilities & Key Gaps',
    gapSub: lang === 'zh' ? '目标岗位高频要求，但原有简历体现较弱或缺失的维度' : 'Critical requirements weakly addressed or missing from your original CV',
    unlockExtraGaps: lang === 'zh' ? '付费解锁额外' : 'Unlock Extra',
    unlockExtraGapsSuffix: lang === 'zh' ? '项深度缺陷清单' : ' More Core Gaps & Deficiencies',
    agileGapTitle: lang === 'zh' ? '海外研发机构敏捷迭代细节缺失' : 'Agile execution details in cross-border tech teams',
    agileGapDesc: lang === 'zh' ? '对标高频率的大模型API整合交付，您的简历没有写出针对数据出海合规细节的要求...' : 'Lacks specific security compliance, cross-border data protection details...',
    budgetGapTitle: lang === 'zh' ? '对标企业级大客户财务P&L预算掌控' : 'Lack of P&L & corporate budget management records',
    budgetGapDesc: lang === 'zh' ? '高阶VP岗一般直接对预算负责，原有简历中几乎没有任何大模型商业算力购买或自研预算规划指标的呈现...' : 'High-level roles require budget ownership; your resume lists no financial indicators...',
    matchedKeywordsLabel: lang === 'zh' ? '已对齐行业高频词' : 'Matched Industry Keywords',
    missingKeywordsLabel: lang === 'zh' ? '缺失行业高频词' : 'Missing High-Frequency Keywords',
    restructuredReportReady: lang === 'zh' ? '大模型高管靶向简历优化报告已就绪' : 'Your Custom AI Restructured Resume is Ready',
    unlockRestructureDesc: lang === 'zh' ? '一键升级，解锁针对当前岗位的完整改写方案。智能重构为SAR/STAR模型，高亮大厂高频率筛查词，生成一版可即时投递、在线编辑的高级求职简历，同时解锁Word/PDF一键打包导出权益。' : 'Upgrade to unlock full STAR-format restructuring tailored to your target role. Highlights top-tier screening keywords, creates an editable C-level CV, and enables docx/pdf exports.',
    unlockRestructureBtn: lang === 'zh' ? '解锁完整大模型简历重构' : 'Unlock AI Restructured Resume',

    // Paywall/Checkout Screen
    checkoutTitle: lang === 'zh' ? '解锁大模型高管定制简历' : 'C-Level Resume Reconstruction',
    checkoutSub: lang === 'zh' ? '已包含价值 ¥299 专家人工改写对标权益' : 'Includes standard benchmarking valued at $49',
    whatsIncluded: lang === 'zh' ? '解锁服务包含的高阶权益清单：' : "What's included in this premium upgrade:",
    inc1Title: lang === 'zh' ? '大模型靶向重构' : 'Tailored AI Rewrite Engine',
    inc1Desc: lang === 'zh' ? '结合目标岗位画像，100%覆盖核心硬技能、技术栈与管理层级。' : 'Restructures accomplishments using STAR format based on corporate JDs.',
    inc2Title: lang === 'zh' ? 'SAR / STAR 模型改写' : 'STAR Format Enrichment',
    inc2Desc: lang === 'zh' ? '拒绝平铺直叙，用量化指标（P&L、用户量、收入增长）高亮业绩。' : 'Highlights quantifiable metrics (P&L, user scale, revenue growth).',
    inc3Title: lang === 'zh' ? '多格式一键导出' : 'Instant Multi-Format Export',
    inc3Desc: lang === 'zh' ? '提供标准PDF、高兼容性Word（.docx）及在线Markdown纯文本复制。' : 'Export to Word (.docx), standard PDF, or clean markdown text.',
    inc4Title: lang === 'zh' ? '永久保存与云端再编辑' : 'Cloud Save & Online Editor',
    inc4Desc: lang === 'zh' ? '此岗位记录将永久存入您的历史，支持随时修改个人数据重新生成。' : 'Keep unlimited edits and cloud revisions under this role profile.',
    checkoutDesk: lang === 'zh' ? '在线收单结账' : 'Premium Checkout Desk',
    wechatPay: lang === 'zh' ? '微信支付 (WeChat Pay)' : 'WeChat Pay',
    alipay: lang === 'zh' ? '支付宝 (Alipay)' : 'Alipay',
    totalPrice: lang === 'zh' ? '实付金额：' : 'Total Paid:',
    priceVal: lang === 'zh' ? '¥ 29.90' : '$ 29.90',
    scanQR: lang === 'zh' ? '扫码支付，立即解锁' : 'Scan QR Code to Unlock Now',
    connectingSecure: lang === 'zh' ? '正在为您连线安全支付网关...' : 'Connecting to secure billing gateway...',
    sandboxBypassTitle: lang === 'zh' ? '模拟测试直通车 (跳过支付)' : 'Sandbox Bypass (Skip Payment)',
    sandboxBypassDesc: lang === 'zh' ? '该按钮仅在沙箱测试中可见，点击即可立即模拟成功支付并渲染简历。' : 'Developer sandbox sandbox bypass. Click to simulate successful payment instantly.',

    // Finalize/Workspace Screen
    workspaceTitle: lang === 'zh' ? '高管特许求职工作台' : 'C-Level Resume Workspace',
    workspaceDesc: lang === 'zh' ? '根据目标岗位全量画像多维拟合而成，已针对性增强高管领导力与核心交付指标。' : 'This CV has been restructured using STAR format with a strong focus on executive leadership and commercial outcome delivery.',
    workspaceHint: lang === 'zh' ? '编辑状态下双击段落可直接修改，支持一键实时对齐。' : 'Double-click text to live-edit inside the template anytime.',
    liveEditEnabled: lang === 'zh' ? '在线编辑模式已启用' : 'Live Editing Mode Enabled',
    doneEditing: lang === 'zh' ? '编辑完成' : 'Done Editing',
    dataAlignmentCheck: lang === 'zh' ? '数据深度对齐校验' : 'Deep Competency Guard',
    mandatoryCheckText: lang === 'zh' ? '已对齐该岗位 mandatory requirements 的 98%' : '98% aligned with target JD mandatory requirements',
    integrityCheckText: lang === 'zh' ? '已校验学术诚信及项目事实真实性' : 'Academic honesty and project metrics verified',
    previewTitle: lang === 'zh' ? '专业高管模板预览' : 'Executive Resume Preview',

    // Suffix additions for comprehensive localization
    resumeFactsConfirm: lang === 'zh' ? '我确认简历中事实均真实准确' : 'I confirm all facts in the resume are authentic and accurate',
    saveChanges: lang === 'zh' ? '保存修改' : 'Save Changes',
    originalResumeText: lang === 'zh' ? '原始简历文本' : 'Original Resume Text',
    noOriginalText: lang === 'zh' ? '暂无原始文本数据内容' : 'No original text data content found',
    optimizedResumeHeader: lang === 'zh' ? '靶向精修简历' : 'Target-Optimized Resume',
    nameLabel: lang === 'zh' ? '姓名' : 'Name',
    targetRoleLabel: lang === 'zh' ? '意向目标岗位' : 'Target Role',
    emailLabel: lang === 'zh' ? '联系邮箱' : 'Email',
    cityLabel: lang === 'zh' ? '所在城市' : 'City',
    linkedinLabel: lang === 'zh' ? '个人简介链接/LinkedIn' : 'LinkedIn / Bio Link',
    summaryLabel: lang === 'zh' ? '职业总结' : 'Professional Summary',
    educationLabel: lang === 'zh' ? '最高学历信息' : 'Highest Education',
    workExperienceLabel: lang === 'zh' ? '核心履历优化' : 'Professional Work Experience',
    suggestSupplement: lang === 'zh' ? '建议补充' : 'Quantifiable suggestion',
    orderDetails: lang === 'zh' ? '订单明细' : 'Order Details',
    optimizerPackage: lang === 'zh' ? '单次高管简历靶向优化包' : 'Single Executive Resume Optimization Package',
    selectPayment: lang === 'zh' ? '选择支付方式' : 'Select Payment Method',
    payAndGenerate: lang === 'zh' ? '立即付款 ¥29.9 并生成简历' : 'Pay ¥29.9 & Generate Resume',
    mockPayTitle: lang === 'zh' ? '扫码模拟支付订单' : 'Scan QR to Simulate Payment',
    mockPayInstructions: lang === 'zh' ? '请使用微信或支付宝扫描二维码完成解锁模拟体验' : 'Please use WeChat or Alipay to scan the QR code to simulate payment.',
    earlyBirdPrice: lang === 'zh' ? '早鸟体验价' : 'Early Bird Price',
    originalPrice: lang === 'zh' ? '原价' : 'Original Price',
    cancelOrder: lang === 'zh' ? '取消订单' : 'Cancel Order',
    confirmMockSuccess: lang === 'zh' ? '确认模拟支付成功' : 'Confirm Simulated Payment Success',
    termsLoading: lang === 'zh' ? '服务条款服务协议加载中...' : 'Loading Service Terms & Agreements...',
    privacyCompliant: lang === 'zh' ? '隐私合规及欧盟GDPR/个人信息保护法告知书已签署保障' : 'Privacy & GDPR Compliant Security Agreement Signed & Active',
    systemStatus: lang === 'zh' ? '在线系统运营状态' : 'System Operations Status',
    systemStatusLive: lang === 'zh' ? '正常' : 'LIVE / OK',
    viewOptimizedResume: lang === 'zh' ? '请审阅AI已经为您重构优化的新版简历。您可以直接点击「编辑简历」直接进行文字微调。确认事实准确后即可导出专属排版的 PDF 和 Word 版本。' : 'Please review the AI-restructured resume. Click "Edit Resume" to make adjustments. Once facts are confirmed, choose your format to download.',
    paywallIntro: lang === 'zh' ? '大模型将严格对照真实岗位中的隐性考量点（业务战略能力、年度资源支配、高层汇报渠道、团队规模管理），为您现有的求职经历完成全面升格重构。' : 'The AI will restructure your experience against implicit executive standards (strategic leadership, resource planning, reporting channels, team management).',
    paywallPoint1Title: lang === 'zh' ? '全量 20+ 项核心高频关键词覆盖评估' : 'Full Keyword Coverage Benchmarking',
    paywallPoint1Desc: lang === 'zh' ? '不再生硬堆叠，大模型根据在公开 JD 中的出现频次权重，智能融合至您的经历句式结构中。' : 'Keywords are seamlessly integrated into achievement metrics rather than stuffed.',
    paywallPoint2Title: lang === 'zh' ? '逐段经历 STAR 模型重构，动作词升格' : 'STAR Formatting & Action Verbs',
    paywallPoint2Desc: lang === 'zh' ? '将温和的执行动作（如“负责设计流程”）靶向改写为极具管理掌控力和业务交付结果的高阶行为词。' : 'Elevate soft action statements into highly authoritative executive statements.',
    paywallPoint3Title: lang === 'zh' ? '智能提示：建议补充核心量化业务数据' : 'Quantification Insights & Guidelines',
    paywallPoint3Desc: lang === 'zh' ? '针对缺失的核心业务指标自动设立标注，提醒您最佳的数额量化方向，方便您导出前快速补充校正。' : 'Highlights missing metrics and suggests key numeric areas to supplement.',
    paywallPoint4Title: lang === 'zh' ? '无限次在线富文本精细度二次精修' : 'Interactive In-Browser Editor',
    paywallPoint4Desc: lang === 'zh' ? '内置高管端专属在线编辑器，支持快捷事实修改和调整，一键打包导出为专业的双格式。' : 'Features an embedded rich editor for fast adjustments and standard output format packaging.',
    industrySuccessRate: lang === 'zh' ? '已有超过 12,000 名行业精英与科技高管成功通过 AI 升级拿到核心高薪 Offer' : 'Over 12,000 executives have upgraded their resumes to land premium C-level offers.',
    loginTitle: lang === 'zh' ? '高管专属端账户登录' : 'Executive Portal Login',
    registerTitle: lang === 'zh' ? '创建高管专属账户' : 'Create Executive Account',
    usernameLabel: lang === 'zh' ? '用户名' : 'Username',
    passwordLabel: lang === 'zh' ? '密码' : 'Password',
    loginBtn: lang === 'zh' ? '登录' : 'Log In',
    registerBtn: lang === 'zh' ? '注册并登录' : 'Register & Log In',
    hasAccount: lang === 'zh' ? '已有高管端账户？去登录' : 'Already have an account? Log In',
    needAccount: lang === 'zh' ? '还没有高管端账户？立即注册' : "Don't have an account? Register Now",
    usernamePlaceholder: lang === 'zh' ? '请输入您的用户名' : 'Enter your username',
    passwordPlaceholder: lang === 'zh' ? '请输入您的密码' : 'Enter your password',
    authDesc: lang === 'zh' ? '数据完全本地化沙盒隔离存储，全力保障您的履历及隐私安全' : 'Data is stored in isolated local sandbox to ensure absolute privacy and security of your CV.',
    logout: lang === 'zh' ? '安全退出' : 'Log Out',
    currentUserLabel: lang === 'zh' ? '当前登录高管账户：' : 'Current active executive: ',
    stripePayTitle: lang === 'zh' ? '微信/支付宝安全收银台' : 'WeChat / Alipay Cashier',
    stripePayInstructions: lang === 'zh' ? '请使用手机微信或支付宝扫描下方二维码完成支付，完成支付后将由大模型为您深度重构简历。' : 'Please scan the QR code with WeChat or Alipay to complete your payment, after which AI will start optimizing your resume.',
    openInNewTab: lang === 'zh' ? '点击新窗口一键完成模拟付款' : 'Open in New Window (Instant Sandbox Bypass)',
    paymentPending: lang === 'zh' ? '正在连线支付网关，等待支付结果...' : 'Awaiting WeChat/Alipay transaction confirmation...',
    paymentSuccessToast: lang === 'zh' ? '支付成功！正在为您进行高阶大模型简历重构，请稍候...' : 'Payment successful! Restructuring your resume, please wait...',
    paymentFailedToast: lang === 'zh' ? '支付未完成或已被取消，请重试' : 'Payment was not completed or has been cancelled.',
    paymentWaiting: lang === 'zh' ? '等待支付中...' : 'Waiting for payment...',
    confirmSuccessText: lang === 'zh' ? '我已支付，手动核销' : 'I have paid, verify manually',
  };
  
  // Navigation & Interactive UI States
  interface NotificationItem {
    id: string;
    title: string;
    titleEn: string;
    content: string;
    contentEn: string;
    time: string;
    timeEn: string;
    isRead: boolean;
    type: 'system' | 'promotion' | 'payment';
  }

  const [showV04ReleaseNotes, setShowV04ReleaseNotes] = useState(false);

  const [notifications, setNotifications] = useState<NotificationItem[]>([
    {
      id: 'notif-v04',
      title: "🎯 CareerAI V0.4 PRO 尊贵版重大功能迭代亮点",
      titleEn: "🎯 CareerAI V0.4 PRO Milestone Highlights & Updates",
      content: `🎯 核心功能迭代亮点

研判佐证链 (Premium JD Evidence Chain)
真实原汁原味原始数据佐证：在 【岗位画像】(researched) 页面，新增了来自大厂或独角兽公司的百万级真实 JD 特征特征分析。
交互式研判卡片：用户可点击卡片展开，查看底层大厂原始岗位文案与 CareerAI 专家委员会的核心简历改写建议，深度感悟领袖能力标签的对应要求。

对话式澄清问句 (Smart Clarification Wizard)
精细化诉求拦截：在 【简历匹配】(matching) 阶段，系统会基于目标岗位类型，智能拦截并展示 三步澄清向导。
高度拟真专家决策：向导向用户提出 3 个关乎高管管理跨度、决策复杂性与团队治理的高冲击力针对性问题，待用户交互提交后，无缝推进至最终匹配。

双栏精准改写工作区 (Interactive Copilot & Multi-version Workspace)
智能建议对比 (Interactive Copilot)：在 【简历优化】(finalized) 左侧面板中，引入对比工作台，逐条呈现针对性的 3-5 处 STAR 表达改写建议，支持用户一键采纳、忽略或AI重新编排。
高客专属多版本库：右侧面板完美集成 【标准投递版】、【高管冲刺版】、【AI产品负责人版】 三个专业分支版本的平滑切换。
专属求职大礼包 (.zip) 导出：导出菜单全面升级，支持打包一键导出包含三套精修简历、专家评测报告及面试预测的 .zip 压缩包。

客户满意度及原始建议日志 (Expert Feedback Loop)
尊贵交付评价：在优化页底端新增客户反馈模块，提供五星满意度评级与具体修辞修改建议框，一键提交反馈。

专家服务控制后台 (Conversion Funnel Dashboard)
实时统计漏斗：顶栏新增 【专家后台】 按钮。点击即可进入服务控制台，实时查看高管用户从画像访问、澄清参与到升级付费与反馈提交的全链条漏斗（Funnel）转化统计。
反馈流实时展现：后台右侧同步呈现最新客户评级与具体诉求建议列表，便于委员会持续迭代大模型推荐算法权重。

🎨 视觉设计与工程规范
V0.4 PRO 尊贵标识：系统顶栏标识正式升级为 V0.4 PRO 专享版，页面整体配色及字体沿用了严谨奢华的 Cosmic Slate 灰蓝金专业色调。
无缝路由与状态驱动：所有新增交互均由前端状态机制平滑衔接，完美适配响应式布局，并通过了系统的 TypeScript 静态类型编译与 npm run build 校验。`,
      contentEn: `🎯 Core Feature Milestones & Iterations

Premium JD Evidence Chain
- High fidelity real JD evidence in the [Researched] stage from top-tier tech firms.
- Interactive expansion cards for underlying job descriptions and leadership keywords.

Smart Clarification Wizard
- Automatic smart intercept wizard with three dynamic high-impact questions during [Matching] stage.
- High-fidelity matching simulations with seamless feedback incorporation.

Interactive Copilot & Multi-version Workspace
- Comparative panel on the left for direct STAR rewrites, with quick adoption to the right.
- Elegant sidebar for multi-version switching: Standard, Executive, and AI Product Specialist.
- Complete luxury bundle (.zip) export containing all customized versions.

Expert Feedback Loop
- Premium delivery feedback collection on the [Finalized] stage, supporting five-star ratings and textual feedback.

Conversion Funnel Dashboard
- Brand new [Expert Admin] dashboard console in the navbar to track conversion funnel metrics and inspect user feedback live.

Visuals & Integrity
- System brand updated to V0.4 PRO exclusive version with elegant Cosmic Slate palette. Full responsive flows and solid TypeScript builds.`,
      time: "刚刚",
      timeEn: "Just now",
      isRead: false,
      type: 'system'
    },
    {
      id: 'notif-1',
      title: "🎁 推广福利：1次免费深度重构额度已上线",
      titleEn: "🎁 Promo Benefit: 1 Free Deep Rewrite Quota Active",
      content: "尊敬的高管用户，CareerAI 现正开启限时推广活动！您只需将您的专属邀请链接转发到微信群或社群，当有新用户通过您的分享链接注册成功，系统即可为您激活 1 次完全免费的AI深度简历重构额度（原价 ¥49.0/次）！免费额度即时生效，可直接在收银台中点击「一键转发获取免费额度」进行体验！",
      contentEn: "Dear executive, CareerAI is holding a limited-time promotional campaign! Simply share your referral link to groups or friends. Once a new user registers through your link, you will immediately unlock 1 free resume optimization quota (originally $49.0)! Try it now by clicking the Share option in the checkout cashier!",
      time: "10分钟前",
      timeEn: "10m ago",
      isRead: false,
      type: 'promotion'
    },
    {
      id: 'notif-2',
      title: "💡 高管简历优化攻略与ATS通关技巧",
      titleEn: "💡 Executive CV Optimization & ATS Survival Guide",
      content: "AI已经为您解析了最新的高端岗位高频领导力词汇。我们强烈建议您在完成简历重构前，对照「岗位画像及匹配度」中建议的STAR/SAR模型，补充关键数据指标。重构后的履历在ATS系统中通过率将提升 200% 以上。",
      contentEn: "AI has extracted high-frequency leadership keywords for your target role. We highly recommend completing the STAR/SAR model structures with specific quantitative metrics. Hand-tailoring your resume accordingly can boost ATS pass rates by over 200%.",
      time: "2小时前",
      timeEn: "2h ago",
      isRead: false,
      type: 'system'
    }
  ]);

  const [activeNotification, setActiveNotification] = useState<NotificationItem | null>(null);
  const [showNotificationDropdown, setShowNotificationDropdown] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showHistoryDropdown, setShowHistoryDrawer] = useState(false);
  const [showSuccessToast, setShowSuccessToast] = useState<string | null>(null);
  const [showQRModal, setShowQRModal] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileWorkspaceTab, setMobileWorkspaceTab] = useState<'copilot' | 'resume'>('copilot');
  const [paymentMethod, setPaymentMethod] = useState<'wechat' | 'alipay'>('wechat');

  // Real payment integration states
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [paymentSessionId, setPaymentSessionId] = useState<string | null>(null);
  const [isSandboxPayment, setIsSandboxPayment] = useState(true);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [isVerifyingPayment, setIsVerifyingPayment] = useState(false);

  // Local User Authentication States
  const [currentUser, setCurrentUser] = useState<{ id: string; username: string } | null>(() => {
    const saved = localStorage.getItem("career_ai_current_user");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return null;
      }
    }
    return null;
  });
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [showUserDropdown, setShowUserDropdown] = useState(false);

  // Input states for New Role Task
  const [targetRole, setTargetRole] = useState("");
  const [industry, setIndustry] = useState("");
  const [location, setLocation] = useState("");
  const [seniority, setSeniority] = useState("总监 / 负责人");
  
  // Resume upload states
  const [resumeText, setResumeText] = useState("");
  const [resumeFileName, setResumeFileName] = useState("");
  const [isDragActive, setIsDragActive] = useState(false);

  // Editing states in the final workspace
  const [isEditing, setIsEditing] = useState(false);
  const [editedResume, setEditedResume] = useState<OptimizedResume | null>(null);
  const [isAccurateChecked, setIsAccurateChecked] = useState(false);
  const [isExportingPackage, setIsExportingPackage] = useState(false);

  // Loading States
  const [loadingStep, setLoadingStep] = useState<'idle' | 'research' | 'matching' | 'upgrading'>('idle');
  const [loadingProgress, setLoadingProgress] = useState(0);

  // PRD v0.4 New States in Frontend
  const [showClarificationWizard, setShowClarificationWizard] = useState(false);
  const [clarificationQuestions, setClarificationQuestions] = useState<any[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [customAnswer, setCustomAnswer] = useState("");
  const [isGeneratingQuestions, setIsGeneratingQuestions] = useState(false);

  // V0.4 Finalized Workspace Sub-tabs
  const [finalizedSubTab, setFinalizedSubTab] = useState<'comparison' | 'resume'>('comparison');
  const [rewriteSuggestions, setRewriteSuggestions] = useState<any[]>([]);
  const [isLoadingRewrite, setIsLoadingRewrite] = useState(false);
  const [isRegeneratingRewriteId, setIsRegeneratingRewriteId] = useState<string | null>(null);

  // V0.4 Resume Versions
  const [resumeVersions, setResumeVersions] = useState<any[]>([]);
  const [currentVersionId, setCurrentVersionId] = useState<string | null>(null);
  const [isLoadingVersions, setIsLoadingVersions] = useState(false);

  // V0.4 JD Evidence
  const [jobResearchConclusions, setJobResearchConclusions] = useState<any[]>([]);
  const [expandedConclusionId, setExpandedConclusionId] = useState<string | null>(null);
  const [isLoadingConclusions, setIsLoadingConclusions] = useState(false);

  // V0.4 Customer Feedback
  const [feedbackRating, setFeedbackRating] = useState(5);
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [feedbackMetrics, setFeedbackMetrics] = useState<string[]>([]);

  // Help Center
  const [showHelpCenter, setShowHelpCenter] = useState(false);

  // V0.4 Admin Dashboard Mode
  const [showAdminConsole, setShowAdminConsole] = useState(false);
  const [adminFunnel, setAdminFunnel] = useState<any[]>([]);
  const [adminFeedbacks, setAdminFeedbacks] = useState<any[]>([]);
  const [isLoadingAdmin, setIsLoadingAdmin] = useState(false);

  // Restore session from localStorage token on mount
  useEffect(() => {
    const token = localStorage.getItem("career_ai_token");
    const saved = localStorage.getItem("career_ai_current_user");
    if (!token || !saved) {
      localStorage.removeItem("career_ai_token");
      localStorage.removeItem("career_ai_current_user");
      setCurrentUser(null);
    }
  }, []);

  // Dynamic SEO and GEO Localization Synchronizer
  useEffect(() => {
    // Update HTML lang attribute for GEO search target localization
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en-US';
    
    // Dynamic page titles matching regional/language context
    if (lang === 'zh') {
      document.title = "CareerAI 高管简历优化器 | 靶向简历修改与AI领袖能力重构 | Executive Resume Optimizer";
      
      // Update dynamic SEO meta-description tag for Chinese searchers
      const metaDesc = document.querySelector('meta[name="description"]');
      if (metaDesc) {
        metaDesc.setAttribute('content', 'CareerAI 专为中高层管理者及技术领袖打造的AI智能简历优化器。基于前沿大模型，提供靶向岗位JD分析、匹配度研判与简历高频领导力重构。');
      }
      // Update keywords
      const metaKeywords = document.querySelector('meta[name="keywords"]');
      if (metaKeywords) {
        metaKeywords.setAttribute('content', 'CareerAI, 高管简历优化, 简历修改, AI简历, 简历评测, 岗位画像, 简历重构, Executive Resume, CV Rewrite, 简历升级');
      }
    } else {
      document.title = "CareerAI Executive Resume Optimizer | AI Resume Restructuring & Target Alignment";
      
      // Update dynamic SEO meta-description tag for English/International searchers
      const metaDesc = document.querySelector('meta[name="description"]');
      if (metaDesc) {
        metaDesc.setAttribute('content', 'CareerAI is an elite resume optimizer for directors, executives, and technical leaders. Restructures CVs to match executive JD requirements with advanced AI capability benchmarking.');
      }
      const metaKeywords = document.querySelector('meta[name="keywords"]');
      if (metaKeywords) {
        metaKeywords.setAttribute('content', 'CareerAI, Executive Resume, AI Resume Optimizer, CV Restructuring, Resume Alignment, leadership CV, JD matching score');
      }
    }
  }, [lang]);

  // Load from Supabase (first) or LocalStorage (fallback)
  useEffect(() => {
    let active = true;
    const loadTasks = async () => {
      if (currentUser) {
        try {
          const res = await customFetch("/api/tasks");
          if (res.ok && active) {
            const dbTasks = await res.json();
            if (Array.isArray(dbTasks) && dbTasks.length > 0) {
              setTasks(dbTasks);
              setCurrentTaskId(dbTasks[0].id);
              setActiveTab(dbTasks[0].status);
              
              // Also sync cache to local storage
              const userKey = `career_ai_tasks_${currentUser.id}`;
              localStorage.setItem(userKey, JSON.stringify(dbTasks));
              return;
            }
          }
        } catch (err) {
          console.error("Failed to fetch tasks from Supabase:", err);
        }
      }

      if (!active) return;

      // Fallback/guest load from local storage
      const userKey = currentUser ? `career_ai_tasks_${currentUser.id}` : "career_ai_tasks_guest";
      const saved = localStorage.getItem(userKey);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setTasks(parsed);
          if (parsed.length > 0) {
            setCurrentTaskId(parsed[0].id);
            setActiveTab(parsed[0].status);
          } else {
            setTasks([]);
            setCurrentTaskId(null);
            setActiveTab(null);
          }
        } catch (e) {
          console.error("Failed to load tasks from local storage", e);
          setTasks([]);
          setCurrentTaskId(null);
          setActiveTab(null);
        }
      } else {
        setTasks([]);
        setCurrentTaskId(null);
        setActiveTab(null);
      }
    };

    loadTasks();
    return () => {
      active = false;
    };
  }, [currentUser]);

  // Load notifications from Supabase, merge with default notifications
  useEffect(() => {
    const loadNotifications = async () => {
      if (!currentUser) return;
      try {
        const res = await customFetch("/api/notifications");
        if (res.ok) {
          const dbNotifs = await res.json();
          if (Array.isArray(dbNotifs) && dbNotifs.length > 0) {
            setNotifications(prev => {
              const merged = new Map<string, NotificationItem>();
              // Add all from DB
              dbNotifs.forEach((n: any) => merged.set(n.id, n));
              // Add prev / default ones if not already present
              prev.forEach(n => {
                if (!merged.has(n.id)) {
                  merged.set(n.id, n);
                }
              });
              return Array.from(merged.values());
            });
          }
        }
      } catch (err) {
        console.error("Failed to load notifications from Supabase:", err);
      }
    };
    loadNotifications();
  }, [currentUser]);

  // Save to LocalStorage and Supabase
  const saveTasks = async (newTasks: TaskItem[]) => {
    setTasks(newTasks);
    const userKey = currentUser ? `career_ai_tasks_${currentUser.id}` : "career_ai_tasks_guest";
    localStorage.setItem(userKey, JSON.stringify(newTasks));

    if (currentUser) {
      try {
        await customFetch("/api/tasks/sync", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ tasks: newTasks })
        });
      } catch (e) {
        console.error("Failed to sync tasks with Supabase:", e);
      }
    }
  };

  // V0.4: Load or generate V0.4 data when currentTask changes
  useEffect(() => {
    if (!currentTask) {
      setJobResearchConclusions([]);
      setRewriteSuggestions([]);
      setResumeVersions([]);
      setFeedbackSubmitted(false);
      setFeedbackText("");
      setFeedbackMetrics([]);
      return;
    }

    // 1. Fetch Job Research Evidence Chain
    const fetchConclusions = async () => {
      setIsLoadingConclusions(true);
      try {
        const res = await customFetch(`/api/job-research/${currentTask.id}/conclusions`);
        if (res.ok) {
          const data = await res.json();
          setJobResearchConclusions(data);
        }
      } catch (e) {
        console.error("Failed to fetch conclusions:", e);
      } finally {
        setIsLoadingConclusions(false);
      }
    };
    fetchConclusions();

    // 2. Fetch or generate rewrite suggestions and resume versions in 'finalized' stage
    if (currentTask.status === 'finalized') {
      const loadFinalizedData = async () => {
        setIsLoadingRewrite(true);
        setIsLoadingVersions(true);
        try {
          // Check if rewrite suggestions exist
          const resComp = await customFetch(`/api/resume-reports/${currentTask.id}/rewrite-comparisons`);
          let compData = [];
          if (resComp.ok) {
            compData = await resComp.json();
          }

          // If empty or default-simulated, trigger generation to get high-fidelity results
          if (compData.length === 0 || compData.some((c: any) => c.status === 'pending' && !c.rewrittenText)) {
            const genComp = await customFetch(`/api/resume-reports/${currentTask.id}/rewrite-comparisons/generate`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                targetRole: currentTask.targetRole,
                report: currentTask.report,
                resumeText: currentTask.originalResumeText || resumeText,
                matchReport: currentTask.matchReport,
                answers: currentTask.clarificationQuestions || []
              })
            });
            if (genComp.ok) {
              compData = await genComp.json();
            }
          }
          setRewriteSuggestions(compData);

          // Check if resume versions exist
          const resVer = await customFetch(`/api/resume-reports/${currentTask.id}/versions`);
          let verData = [];
          if (resVer.ok) {
            verData = await resVer.json();
          }

          if (verData.length === 0) {
            const genVer = await customFetch(`/api/resume-reports/${currentTask.id}/versions/generate`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                targetRole: currentTask.targetRole,
                report: currentTask.report,
                resumeText: currentTask.originalResumeText || resumeText,
                baselineResume: currentTask.optimizedResume,
                answers: currentTask.clarificationQuestions || []
              })
            });
            if (genVer.ok) {
              verData = await genVer.json();
            }
          }
          setResumeVersions(verData);
          
          // Set active version to Standard version initially
          const currentV = verData.find((v: any) => v.isCurrent) || verData[0];
          if (currentV) {
            setCurrentVersionId(currentV.id);
            setEditedResume(currentV.content);
          }
        } catch (e) {
          console.error("Failed to load finalized V0.4 data:", e);
        } finally {
          setIsLoadingRewrite(false);
          setIsLoadingVersions(false);
        }
      };
      
      loadFinalizedData();
    }
  }, [currentTaskId, tasks]);

  // V0.4 Interactive Rewrite Handlers

  // Helper: persist updated resume content to current version in DB + sync resumeVersions state
  const persistVersionContent = async (content: any) => {
    if (!currentVersionId) return;
    try {
      await customFetch(`/api/resume-versions/${currentVersionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });
      setResumeVersions(prev => prev.map(v => v.id === currentVersionId ? { ...v, content } : v));
    } catch (e) {
      console.error('Failed to persist version content:', e);
    }
  };

  // Accept a suggestion: capture a snapshot of the current section, then unconditionally replace it
  const handleAcceptRewrite = async (suggestionId: string) => {
    const sugg = rewriteSuggestions.find(s => s.id === suggestionId);
    if (!sugg || !editedResume) return;

    // Snapshot the CURRENT section state so undo can restore exactly what was shown
    let snapshotBeforeAccept: any = null;
    if (sugg.sectionType === '个人简介') {
      snapshotBeforeAccept = { summary: editedResume.summary };
    } else if (sugg.sectionType === '核心能力') {
      snapshotBeforeAccept = { coreCapabilities: [...(editedResume.coreCapabilities || [])] };
    } else {
      snapshotBeforeAccept = { originalBullet: sugg.originalText };
    }

    // Unconditionally apply the rewrite to the section
    const updated = { ...editedResume };
    if (sugg.sectionType === '个人简介') {
      updated.summary = sugg.rewrittenText;
    } else if (sugg.sectionType === '核心能力') {
      updated.coreCapabilities = sugg.rewrittenText
        .split("\n")
        .map((l: string) => l.replace(/^【[^】]+】/, "").trim())
        .filter(Boolean);
    } else if (sugg.sectionType === '工作经历' || sugg.sectionType === '项目经历') {
      const matchKey = sugg.originalText.substring(0, Math.min(15, sugg.originalText.length));
      let matched = false;
      updated.experience = (editedResume.experience || []).map((exp: any) => {
        const idx = exp.bullets.findIndex((b: string) => b === sugg.originalText || (matchKey && b.includes(matchKey)));
        if (idx !== -1) {
          matched = true;
          const bullets = [...exp.bullets];
          bullets[idx] = sugg.rewrittenText;
          return { ...exp, bullets };
        }
        return exp;
      });
      if (!matched && updated.experience.length > 0) {
        updated.experience = updated.experience.map((exp: any, i: number) =>
          i === 0 ? { ...exp, bullets: [sugg.rewrittenText, ...exp.bullets] } : exp
        );
      }
    }

    try {
      const res = await customFetch(`/api/rewrite-suggestions/${suggestionId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'accepted' })
      });
      if (res.ok) {
        setRewriteSuggestions(prev => prev.map(item =>
          item.id === suggestionId ? { ...item, status: 'accepted', snapshotBeforeAccept } : item
        ));
        setEditedResume(updated);
        await persistVersionContent(updated);
        triggerToast(lang === 'zh' ? "✅ 已采纳并即时更新简历！" : "✅ Accepted and resume updated instantly!");
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Undo an accepted suggestion: restore the section to the snapshot taken before accept
  const handleUndoRewrite = async (suggestionId: string) => {
    const sugg = rewriteSuggestions.find(s => s.id === suggestionId);
    if (!sugg || !editedResume) return;

    const snap = (sugg as any).snapshotBeforeAccept;
    const reverted = { ...editedResume };

    if (sugg.sectionType === '个人简介') {
      reverted.summary = snap?.summary ?? sugg.originalText;
    } else if (sugg.sectionType === '核心能力') {
      reverted.coreCapabilities = snap?.coreCapabilities
        ?? sugg.originalText.split("\n").map((l: string) => l.replace(/^【[^】]+】/, "").trim()).filter(Boolean);
    } else if (sugg.sectionType === '工作经历' || sugg.sectionType === '项目经历') {
      const originalBullet = snap?.originalBullet ?? sugg.originalText;
      const matchKey = sugg.rewrittenText.substring(0, Math.min(15, sugg.rewrittenText.length));
      let matched = false;
      reverted.experience = (editedResume.experience || []).map((exp: any) => {
        const idx = exp.bullets.findIndex((b: string) => b === sugg.rewrittenText || (matchKey && b.includes(matchKey)));
        if (idx !== -1) {
          matched = true;
          const bullets = [...exp.bullets];
          bullets[idx] = originalBullet;
          return { ...exp, bullets };
        }
        return exp;
      });
      if (!matched) {
        reverted.experience = reverted.experience.map((exp: any, i: number) =>
          i === 0 ? { ...exp, bullets: exp.bullets.filter((b: string) => b !== sugg.rewrittenText) } : exp
        );
      }
    }

    try {
      const res = await customFetch(`/api/rewrite-suggestions/${suggestionId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'pending' })
      });
      if (res.ok) {
        setRewriteSuggestions(prev => prev.map(item =>
          item.id === suggestionId ? { ...item, status: 'pending', snapshotBeforeAccept: undefined } : item
        ));
        setEditedResume(reverted);
        await persistVersionContent(reverted);
        triggerToast(lang === 'zh' ? "↩️ 已撤销该建议，简历已同步恢复！" : "↩️ Suggestion undone, resume reverted!");
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleRejectRewrite = async (suggestionId: string) => {
    try {
      const res = await customFetch(`/api/rewrite-suggestions/${suggestionId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'rejected' })
      });
      if (res.ok) {
        setRewriteSuggestions(prev => prev.map(item => item.id === suggestionId ? { ...item, status: 'rejected' } : item));
        triggerToast(lang === 'zh' ? "已忽略该项建议。" : "Suggestion rejected.");
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleRegenerateRewrite = async (suggestionId: string, originalText: string) => {
    setIsRegeneratingRewriteId(suggestionId);
    try {
      const res = await customFetch(`/api/rewrite-suggestions/${suggestionId}/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ originalText, targetRole: currentTask?.targetRole })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.updated) {
          setRewriteSuggestions(prev => prev.map(item => item.id === suggestionId ? data.updated : item));
          triggerToast(lang === 'zh' ? "已为您生成全新的高冲击力子弹点！" : "Generated a fresh high-impact bullet point!");
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsRegeneratingRewriteId(null);
    }
  };

  const handleEditRewrite = async (suggestionId: string, text: string) => {
    try {
      const res = await customFetch(`/api/rewrite-suggestions/${suggestionId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'edited', rewrittenText: text })
      });
      if (res.ok) {
        setRewriteSuggestions(prev => prev.map(item => item.id === suggestionId ? { ...item, status: 'edited', rewrittenText: text } : item));
        
        // Merge edited text into preview
        const sugg = rewriteSuggestions.find(s => s.id === suggestionId);
        if (sugg && editedResume) {
          let updated = { ...editedResume };
          if (sugg.sectionType === '工作经历' || sugg.sectionType === '项目经历') {
            let matched = false;
            updated.experience = updated.experience.map(exp => {
              const matchKey = sugg.originalText.substring(0, 10);
              const hasBullet = exp.bullets.some(b => b.includes(matchKey) || (sugg.originalText.length > 15 && b.includes(sugg.originalText.substring(2, 12))));
              if (hasBullet) {
                matched = true;
                return {
                  ...exp,
                  bullets: exp.bullets.map(b => (b.includes(matchKey) || b.includes(sugg.originalText.substring(2, 12))) ? text : b)
                };
              }
              return exp;
            });
            
            // If not found, prepend to the first experience
            if (!matched && updated.experience.length > 0) {
              updated.experience = updated.experience.map((exp, idx) => {
                if (idx === 0) {
                  return {
                    ...exp,
                    bullets: [text, ...exp.bullets]
                  };
                }
                return exp;
              });
            }
          } else if (sugg.sectionType === '个人简介') {
            updated.summary = text;
          } else if (sugg.sectionType === '核心能力') {
            updated.coreCapabilities = text.split("\n").map((line: string) => line.replace(/^【[^】]+】/, "").trim()).filter(Boolean);
          }
          setEditedResume(updated);
        }
        triggerToast(lang === 'zh' ? "手动精修内容已保存，并融入当前简历预览！" : "Manual refinement saved and applied to preview!");
      }
    } catch (e) {
      console.error(e);
    }
  };

  // V0.4 Version Controller
  const handleSwitchVersion = async (versionId: string) => {
    setCurrentVersionId(versionId);
    const ver = resumeVersions.find(v => v.id === versionId);
    if (ver) {
      setEditedResume(ver.content);
      await customFetch(`/api/resume-versions/${versionId}/set-current`, { method: 'POST' });
      setResumeVersions(prev => prev.map(v => ({ ...v, isCurrent: v.id === versionId })));
      triggerToast(lang === 'zh' ? `已成功切换到专属「${ver.versionName}」！` : `Switched to "${ver.versionName}"!`);
    }
  };

  // V0.4 Customer feedback submission
  const handleSubmitFeedback = async () => {
    if (!currentTask) return;
    try {
      const res = await customFetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId: currentTask.id,
          rating: feedbackRating,
          feedbackText: feedbackText,
          selectedMetrics: feedbackMetrics
        })
      });
      if (res.ok) {
        setFeedbackSubmitted(true);
        triggerToast(lang === 'zh' ? "感谢您的评价，我们一直在努力精进算法！" : "Thank you for your rating!");
      }
    } catch (e) {
      console.error(e);
      setFeedbackSubmitted(true);
    }
  };

  // V0.4 Toggle Admin Console Dashboard
  const handleToggleAdminConsole = async () => {
    const nextState = !showAdminConsole;
    setShowAdminConsole(nextState);
    if (nextState) {
      setIsLoadingAdmin(true);
      try {
        const [funnelRes, feedbackRes] = await Promise.all([
          customFetch("/api/admin/conversion-funnel"),
          customFetch("/api/admin/feedback-summary")
        ]);
        
        if (funnelRes.ok) {
          const funnelData = await funnelRes.json();
          setAdminFunnel(funnelData);
        }
        if (feedbackRes.ok) {
          const feedbackData = await feedbackRes.json();
          setAdminFeedbacks(feedbackData.feedbacks || []);
        }
      } catch (e) {
        console.error("Failed to load admin dashboard data:", e);
      } finally {
        setIsLoadingAdmin(false);
      }
    }
  };

  // Auth Action Handlers
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authUsername.trim() || !authPassword.trim()) {
      triggerToast(lang === 'zh' ? '请填写所有必填项。' : 'Please fill in all required fields.');
      return;
    }

    const endpoint = authMode === 'register' ? '/api/auth/register' : '/api/auth/login';
    const pendingReferrer = authMode === 'register' ? localStorage.getItem('career_ai_pending_referrer') : null;

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: authUsername.trim(),
          password: authPassword,
          ...(pendingReferrer ? { referredBy: pendingReferrer } : {})
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '请求失败');

      localStorage.setItem("career_ai_token", data.token);
      localStorage.setItem("career_ai_current_user", JSON.stringify(data.user));
      if (authMode === 'register') localStorage.removeItem('career_ai_pending_referrer');
      setCurrentUser(data.user);
      setAuthUsername('');
      setAuthPassword('');
      triggerToast(
        authMode === 'register'
          ? (lang === 'zh' ? '注册成功，高管工作台已激活！' : 'Registration successful, workspace enabled!')
          : (lang === 'zh' ? '登录成功！已加载您的专属高管求职工作台。' : 'Login successful! Loaded your private executive workspace.')
      );
    } catch (err: any) {
      triggerToast(
        authMode === 'register'
          ? (lang === 'zh' ? `注册失败: ${err.message}` : `Registration failed: ${err.message}`)
          : (lang === 'zh' ? `登录失败: ${err.message}` : `Login failed: ${err.message}`)
      );
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("career_ai_token");
    localStorage.removeItem("career_ai_current_user");
    setCurrentUser(null);
    setShowUserDropdown(false);
    triggerToast(lang === 'zh' ? '已安全退出登录' : 'Logged out safely.');
  };

  const currentTask = tasks.find(t => t.id === currentTaskId) || null;
  const activeRenderResume = currentTask ? (editedResume || currentTask.optimizedResume) : null;
  const activeVersionType = !currentVersionId ? 'standard' :
    currentVersionId.endsWith('executive') ? 'executive' :
    currentVersionId.endsWith('ai_product') ? 'ai_product' : 'standard';

  // Sync activeTab when task or status changes
  useEffect(() => {
    if (currentTask) {
      setActiveTab(currentTask.status);
    } else {
      setActiveTab(null);
    }
  }, [currentTaskId, currentTask?.status]);

  // Show a temporary visual Toast alert
  const triggerToast = (msg: string) => {
    setShowSuccessToast(msg);
    setTimeout(() => {
      setShowSuccessToast(null);
    }, 3500);
  };

  const handleCheckApiStatus = async () => {
    triggerToast(lang === 'zh' ? '正在检测服务器连通性…' : 'Checking server connectivity…');
    const start = performance.now();
    try {
      const res = await fetch('/api/health', { method: 'GET' });
      const latency = Math.round(performance.now() - start);
      if (!res.ok) {
        triggerToast(
          lang === 'zh'
            ? `⚠️ API 状态: 异常 (HTTP ${res.status}, ${latency}ms)`
            : `⚠️ API Status: Degraded (HTTP ${res.status}, ${latency}ms)`
        );
        return;
      }
      const data = await res.json();
      const aiText = data?.aiEnabled
        ? (lang === 'zh' ? 'AI引擎已连接' : 'AI engine connected')
        : (lang === 'zh' ? 'AI引擎离线(使用内置模拟引擎)' : 'AI engine offline (using local simulator)');
      triggerToast(
        lang === 'zh'
          ? `✅ API 状态: 在线 (${latency}ms) · ${aiText}`
          : `✅ API Status: Online (${latency}ms) · ${aiText}`
      );
    } catch (err) {
      triggerToast(
        lang === 'zh'
          ? '❌ API 状态: 无法连接服务器'
          : '❌ API Status: Unable to reach server'
      );
    }
  };

  // 1. Submit New Target Role Analysis
  const handleAnalyzeRole = async (roleName: string = targetRole) => {
    const activeRole = roleName.trim() || "AI 产品负责人";
    setLoadingStep('research');
    setLoadingProgress(15);
    
    // Simulate progression while contacting Express API
    const progressInterval = setInterval(() => {
      setLoadingProgress(prev => {
        if (prev >= 85) return prev;
        return Math.min(prev + 12, 85);
      });
    }, 300);

    try {
      const response = await customFetch("/api/analyze-role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetRole: activeRole,
          industry,
          location,
          seniority
        })
      });
      
      clearInterval(progressInterval);
      setLoadingProgress(100);

      if (response.ok) {
        const report: JobResearchReport = await response.json();
        if ((report as any).simulated) {
          triggerToast(lang === 'zh'
            ? '⚠️ AI服务当前繁忙或未配置，已为您切换至内置模拟分析引擎。建议稍后重试，或联系客服 siounex@qq.com。'
            : '⚠️ AI service busy or unavailable — using built-in simulated analysis. Please retry later or contact support at siounex@qq.com.');
        }
        
        // Create new task or update if matching role exists
        const newTask: TaskItem = {
          id: Date.now().toString(),
          targetRole: activeRole,
          industry: industry || "AI / SaaS / 数字化",
          location: location || "北京/上海/深圳",
          seniority: seniority,
          createdAt: new Date().toLocaleDateString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
          status: 'researched',
          report: report
        };

        const updatedTasks = [newTask, ...tasks.filter(t => t.targetRole !== activeRole)];
        saveTasks(updatedTasks);
        setCurrentTaskId(newTask.id);
        triggerToast(lang === 'zh' ? `成功为您生成了「${activeRole}」高级岗位精准调研画像！` : `Successfully analyzed and generated the customized profile for "${activeRole}"!`);
      } else {
        throw new Error("API call failed");
      }
    } catch (e) {
      console.error(e);
      triggerToast(lang === 'zh' ? "请求网络超时，已切换至内置高速分析引擎。" : "Network timeout, switched to high-speed local engine.");
    } finally {
      setLoadingStep('idle');
      setLoadingProgress(0);
    }
  };

  // 2. Submit Resume for Gap Match Score calculation
  const handleMatchResume = async (skipWizard: boolean = false) => {
    if (!currentTask || !resumeText.trim()) {
      triggerToast(lang === 'zh' ? "请输入或上传您的简历内容后再开始分析。" : "Please input or upload your resume first.");
      return;
    }

    // V0.4: Smart Clarification追问 Wizard Generation Check
    if (!skipWizard && !currentTask.clarificationCompleted && clarificationQuestions.length === 0) {
      setIsGeneratingQuestions(true);
      setLoadingStep('matching');
      setLoadingProgress(20);
      const prog = setInterval(() => {
        setLoadingProgress(p => (p >= 85 ? p : p + 15));
      }, 350);

      try {
        const response = await customFetch(`/api/resume-reports/${currentTask.id}/clarification-questions/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            targetRole: currentTask.targetRole,
            resumeText: resumeText,
            gapAnalysis: []
          })
        });

        clearInterval(prog);
        setLoadingProgress(100);

        if (response.ok) {
          const questions = await response.json();
          setClarificationQuestions(questions);
          setShowClarificationWizard(true);
          setCurrentQuestionIndex(0);
          setCustomAnswer("");
          triggerToast(lang === 'zh' ? "✨ AI 发现简历深层硬伤，启动高级求职追问补充！" : "✨ AI found resume gaps, started expert follow-up Q&A!");
        } else {
          throw new Error("Failed to generate questions");
        }
      } catch (e) {
        console.error(e);
        triggerToast(lang === 'zh' ? "网络出现波动，已为您跳过追问，直接生成匹配度评估。" : "Network glitch, skipped Q&A and ran evaluation directly.");
        await handleMatchResume(skipWizard = true);
      } finally {
        setIsGeneratingQuestions(false);
        setLoadingStep('idle');
        setLoadingProgress(0);
      }
      return;
    }

    // Proceed to standard match analysis
    setLoadingStep('matching');
    setLoadingProgress(10);
    const progressInterval = setInterval(() => {
      setLoadingProgress(prev => {
        if (prev >= 90) return prev;
        return Math.min(prev + 15, 90);
      });
    }, 450);

    try {
      const response = await customFetch("/api/match-resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetRole: currentTask.targetRole,
          report: currentTask.report,
          resumeText: resumeText
        })
      });

      clearInterval(progressInterval);
      setLoadingProgress(100);

      if (response.ok) {
        const matchReport: ResumeMatchReport = await response.json();
        if ((matchReport as any).simulated) {
          triggerToast(lang === 'zh'
            ? '⚠️ AI服务当前繁忙或未配置，已为您切换至内置模拟分析引擎。建议稍后重试，或联系客服 siounex@qq.com。'
            : '⚠️ AI service busy or unavailable — using built-in simulated analysis. Please retry later or contact support at siounex@qq.com.');
        }
        
        // Update task with resume match findings and Q&A answers
        const updatedTasks = tasks.map(t => {
          if (t.id === currentTask.id) {
            return {
              ...t,
              status: 'matched' as const,
              originalResumeName: resumeFileName || "我的简历.txt",
              originalResumeText: resumeText,
              matchReport: matchReport,
              clarificationQuestions: clarificationQuestions,
              clarificationCompleted: clarificationQuestions.length > 0
            };
          }
          return t;
        });

        saveTasks(updatedTasks);
        setShowClarificationWizard(false);
        navigateToTab('matched');
        triggerToast(lang === 'zh' ? "简历多维差距分析计算完成！" : "Resume multi-dimensional gap analysis completed!");
      } else {
        throw new Error("Match API failure");
      }
    } catch (e) {
      console.error(e);
      triggerToast(lang === 'zh' ? "网络连接波动，已调动本地知识库完成画像匹配。" : "Network fluctuation detected. Switched to local knowledge base to match.");
    } finally {
      setLoadingStep('idle');
      setLoadingProgress(0);
    }
  };

  const handleSubmitClarificationAnswers = async () => {
    if (!currentTask) return;
    
    setLoadingStep('matching');
    setLoadingProgress(40);
    
    try {
      await customFetch(`/api/resume-reports/${currentTask.id}/clarification-answers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: clarificationQuestions })
      });
      
      setLoadingProgress(80);
      triggerToast(lang === 'zh' ? "正在深度对齐您的信息并计算匹配契合度..." : "Aligning details and computing match score...");
      
      await handleMatchResume(true);
    } catch (e) {
      console.error(e);
      await handleMatchResume(true);
    }
  };

  // 3. Initiate checkout paywall & process real-time transaction
  const runResumeOptimizationForTask = async (taskIdToOptimize: string) => {
    const taskToOptimize = tasks.find(t => t.id === taskIdToOptimize);
    if (!taskToOptimize) return;

    setLoadingStep('upgrading');
    setLoadingProgress(30);

    const progressInterval = setInterval(() => {
      setLoadingProgress(prev => {
        if (prev >= 95) return prev;
        return Math.min(prev + 15, 95);
      });
    }, 500);

    try {
      const response = await customFetch("/api/optimize-resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetRole: taskToOptimize.targetRole,
          report: taskToOptimize.report,
          resumeText: taskToOptimize.originalResumeText || resumeText,
          matchReport: taskToOptimize.matchReport
        })
      });

      clearInterval(progressInterval);
      setLoadingProgress(100);

      if (response.ok) {
        const optimized: OptimizedResume = await response.json();
        if ((optimized as any).simulated) {
          triggerToast(lang === 'zh'
            ? '⚠️ AI服务当前繁忙或未配置，本次改写使用内置模拟引擎生成。建议稍后重试获取真实AI改写，或联系客服 siounex@qq.com。'
            : '⚠️ AI service busy or unavailable — this rewrite was generated by the built-in simulator. Please retry later for a real AI rewrite, or contact support at siounex@qq.com.');
        }
        
        // Reload tasks from storage to prevent stale local state overwrites
        const userKey = currentUser ? `career_ai_tasks_${currentUser.id}` : "career_ai_tasks_guest";
        const saved = localStorage.getItem(userKey);
        let latestTasks = tasks;
        if (saved) {
          try {
            latestTasks = JSON.parse(saved);
          } catch (e) {}
        }

        const updatedTasks = latestTasks.map(t => {
          if (t.id === taskIdToOptimize) {
            return {
              ...t,
              status: 'finalized' as const,
              optimizedResume: optimized
            };
          }
          return t;
        });

        saveTasks(updatedTasks);
        setEditedResume(optimized);
        setCurrentTaskId(taskIdToOptimize);
        setActiveTab('finalized');
        triggerToast(lang === 'zh' ? "🎉 恭喜！高阶大模型改写服务已解锁，成功生成您的靶向优化简历！" : "🎉 Congratulations! C-level optimization unlocked. Custom resume generated successfully!");
      } else {
        throw new Error("Upgrade API failed");
      }
    } catch (e) {
      console.error(e);
      triggerToast(lang === 'zh' ? "服务繁忙，已调取高级简历专家模块完成靶向改写。" : "Server busy. Loaded advanced resume expert module for target rewrite.");
    } finally {
      setLoadingStep('idle');
      setLoadingProgress(0);
    }
  };

  const handlePaymentSubmit = async () => {
    if (!currentTask) return;

    setIsCreatingSession(true);
    triggerToast(lang === 'zh' ? '正在为您极速开通专属安全收银台...' : 'Generating secure checkout session...');

    try {
      const response = await customFetch("/api/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId: currentTask.id,
          targetRole: currentTask.targetRole,
          paymentMethod: paymentMethod,
          lang: lang
        })
      });

      if (response.ok) {
        const data = await response.json();
        setCheckoutUrl(data.url);
        setPaymentSessionId(data.sessionId);
        setIsSandboxPayment(!!data.isSandbox);
        
        setShowQRModal(true);
        triggerToast(lang === 'zh' ? '安全收银台加载完成！' : 'Checkout session generated!');
      } else {
        const errData = await response.json();
        triggerToast(lang === 'zh' ? `创建支付订单失败: ${errData.error || '未知错误'}` : `Checkout generation failed: ${errData.error || 'Unknown error'}`);
      }
    } catch (error: any) {
      console.error("Payment submit error:", error);
      triggerToast(lang === 'zh' ? '网络连接异常，无法创建支付订单' : 'Network error, failed to create checkout session.');
    } finally {
      setIsCreatingSession(false);
    }
  };

  const handleConfirmPaymentSuccess = async () => {
    if (!currentTask || !paymentSessionId) return;

    setIsVerifyingPayment(true);
    triggerToast(lang === 'zh' ? '正在核销您的微信/支付宝订单...' : 'Confirming your WeChat/Alipay order...');

    try {
      // Force status update to paid on server first to simulate instant confirmation success
      await customFetch('/api/confirm-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: paymentSessionId })
      });

      const res = await customFetch(`/api/verify-payment?session_id=${paymentSessionId}&task_id=${currentTask.id}`);
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'paid') {
          setShowQRModal(false);
          triggerToast(t.paymentSuccessToast);
          await runResumeOptimizationForTask(currentTask.id);
        } else {
          triggerToast(lang === 'zh' ? '系统尚未检测到该笔账单的支付信息，请稍候再试' : 'Payment has not been received yet. Please try again.');
        }
      } else {
        triggerToast(lang === 'zh' ? '校验异常，请重试' : 'Verification error, please try again.');
      }
    } catch (error) {
      console.error("Manual verification failed:", error);
      triggerToast(lang === 'zh' ? '网络连接出错，请重试' : 'Network connection error, please try again.');
    } finally {
      setIsVerifyingPayment(false);
    }
  };

  const handleReferralBypass = async () => {
    if (!currentTask) return;
    if (!currentUser) {
      triggerToast(lang === 'zh' ? '请先登录后再核销推荐奖励' : 'Please log in first to claim a referral reward.');
      return;
    }
    setIsVerifyingPayment(true);
    triggerToast(lang === 'zh' ? '正在核实真实推荐注册记录...' : 'Verifying real referral registrations...');
    try {
      const res = await customFetch('/api/referrals/claim', { method: 'POST' });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.success) {
        setShowQRModal(false);
        setShowShareModal(false);

        const newNotif: NotificationItem = {
          id: `referral-success-${Date.now()}`,
          title: "🎉 恭喜！推荐注册奖励已成功激活",
          titleEn: "🎉 Congratulations! Referral reward activated successfully",
          content: `尊敬的用户，新用户已经通过您的专属链接成功注册！您的 1 次免费高管简历重构额度已成功激活，并已自动抵扣您对「${currentTask.targetRole}」岗位的简历深度重构订单！大语言模型正在极速重写、对齐高频词并格式化为STAR模型，稍后请直接审阅生成后的高阶简历成果！`,
          contentEn: `Dear user, a new user has successfully registered through your unique referral link! Your free credit has been activated and successfully applied to your resume optimization order for "${currentTask.targetRole}"! The AI model is restructuring your profile. Please check the results in a moment!`,
          time: lang === 'zh' ? "刚刚" : "Just now",
          timeEn: "Just now",
          isRead: false,
          type: 'payment'
        };
        setNotifications(prev => [newNotif, ...prev]);
        customFetch("/api/notifications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newNotif)
        }).catch(err => console.error("Failed to save notification:", err));

        triggerToast(lang === 'zh' ? "🎉 推荐核销成功！已自动抵扣本次账单，免费为您进行高阶大模型简历重构！" : "🎉 Referral verified! Zero-payment discount applied, restructuring your resume now!");
        await runResumeOptimizationForTask(currentTask.id);
      } else {
        triggerToast(lang === 'zh'
          ? '暂无可核销的真实推荐注册记录。需有新用户通过您的专属链接实际完成注册后，才能免费解锁本次额度。'
          : 'No verified referral registration yet. A friend must actually register through your link before this credit unlocks.');
      }
    } catch (e) {
      console.error(e);
      triggerToast(lang === 'zh' ? '系统核销出错，请重试' : 'System verification error, please try again.');
    } finally {
      setIsVerifyingPayment(false);
    }
  };

  const handleCopyInvite = () => {
    const inviteLink = `${window.location.origin}/?ref=${currentUser ? currentUser.id : 'guest_promo'}`;
    const inviteText = lang === 'zh' 
      ? `【CareerAI高管简历重构】我的朋友向我推荐了这款中高层管理者、技术领袖专属的简历优化神作！针对目标岗位JD一键靶向重构为STAR模型，高亮大厂高频领导力筛查词，ATS通过率提升2倍！送你一次免费体验机会，点击下方专属邀请链接，极速解锁高阶履历：\n👉 ${inviteLink}`
      : `[CareerAI Executive Resume Optimizer] My friend recommended this AI resume tool tailored for executives, directors, and tech leaders. Restructures CVs into the powerful STAR framework to match high-frequency industry keywords, doubling ATS pass rates. Get 1 free credit through my unique referral link:\n👉 ${inviteLink}`;
    
    navigator.clipboard.writeText(inviteText)
      .then(() => {
        triggerToast(lang === 'zh' 
          ? '🎉 专属邀请函及分享链接已复制成功！快发到群聊或微信好友吧！' 
          : '🎉 Invitation letter and unique referral link copied successfully!');
      })
      .catch((err) => {
        console.error("Failed to copy referral text: ", err);
        triggerToast(lang === 'zh' ? '❌ 复制失败，请手动选择复制' : '❌ Copy failed, please select and copy manually.');
      });
  };

  // Effect 1: Check URL search parameters on load (handles referral link redirects)
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const refId = searchParams.get('ref');

    if (refId && refId !== 'guest_promo') {
      localStorage.setItem('career_ai_pending_referrer', refId.toLowerCase());
      triggerToast(lang === 'zh' ? `🎁 欢迎！您已接受高管好友 (用户ID: ${refId}) 的专属推荐，注册后好友将获得免费额度奖励！` : `🎁 Welcome! You've joined via an executive friend's referral (ID: ${refId}). Register now to unlock their reward!`);
      // Clear referral param from URL to keep address clean
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  // Navigation tab switcher state mapping helper
  const navigateToTab = (status: TaskItem['status']) => {
    setActiveTab(status);
  };

  // Handler for direct text edits inside the finalized resume
  const handleSaveEditedResume = async () => {
    if (!currentTask || !editedResume) return;
    
    const updatedTasks = tasks.map(t => {
      if (t.id === currentTask.id) {
        return {
          ...t,
          optimizedResume: editedResume
        };
      }
      return t;
    });
    saveTasks(updatedTasks);
    setIsEditing(false);
    
    // V0.4: Sync change with the current active version on the server
    if (currentVersionId) {
      try {
        await customFetch(`/api/resume-versions/${currentVersionId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: editedResume })
        });
        
        setResumeVersions(prev => prev.map(v => v.id === currentVersionId ? { ...v, content: editedResume } : v));
      } catch (e) {
        console.error("Failed to sync edited resume with server:", e);
      }
    }
    
    triggerToast(lang === 'zh' ? "修改已成功保存并同步应用！" : "Changes saved and synchronized successfully!");
  };

  // Helper to escape HTML characters
  const escapeHtml = (text?: string): string => {
    if (!text) return "";
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  };

  // Real Export to Word (.doc formatted as HTML)
  const exportToWord = (resume: OptimizedResume, fileName: string) => {
    triggerToast(lang === 'zh' ? "正在生成高解析度、ATS友好的 Word 简历格式，请稍后..." : "Generating high-fidelity, ATS-friendly Word resume format, please wait...");
    
    const experienceHtml = resume.experience.map(exp => `
      <div style="margin-bottom: 12pt;">
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="width: 100%; margin-bottom: 4pt;">
          <tr>
            <td align="left" style="font-weight: bold; font-size: 11pt; color: #0f172a;">
              ${escapeHtml(exp.company)} <span style="font-weight: normal; color: #94a3b8; margin: 0 4pt;">|</span> <span style="font-weight: bold; color: #334155;">${escapeHtml(exp.role)}</span>
            </td>
            <td align="right" style="font-size: 10pt; color: #64748b; font-family: 'Courier New', monospace; font-weight: bold; text-align: right;">
              ${escapeHtml(exp.duration)}
            </td>
          </tr>
        </table>
        <ul style="margin-top: 2pt; margin-bottom: 4pt; padding-left: 15pt; list-style-type: disc;">
          ${exp.bullets.map(bullet => {
            const cleanBullet = bullet.replace(/【建议补充：[^】]+】/g, '');
            return `<li style="margin-bottom: 3pt; font-size: 10pt; color: #334155; text-align: justify; line-height: 1.4;">${escapeHtml(cleanBullet)}</li>`;
          }).join('')}
        </ul>
      </div>
    `).join('');

    const capabilitiesHtml = resume.coreCapabilities.map(cap => `
      <span style="display: inline-block; width: 48%; margin-bottom: 4pt; font-size: 10pt; color: #334155;">• ${escapeHtml(cap)}</span>
    `).join('');

    const htmlContent = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta charset="utf-8">
        <title>${escapeHtml(resume.name)} - 靶向优化简历</title>
        <!--[if gte mso 9]>
        <xml>
          <w:WordDocument>
            <w:View>Print</w:View>
            <w:Zoom>100</w:Zoom>
            <w:DoNotOptimizeForBrowser/>
          </w:WordDocument>
        </xml>
        <![endif]-->
        <style>
          @page {
            size: 8.5in 11in;
            margin: 0.8in 0.8in 0.8in 0.8in;
          }
          body {
            font-family: 'Calibri', 'Arial', sans-serif;
            font-size: 10.5pt;
            line-height: 1.4;
            color: #333333;
          }
          .header {
            border-bottom: 2px solid #2563eb;
            padding-bottom: 6pt;
            margin-bottom: 12pt;
          }
          .name {
            font-size: 22pt;
            font-weight: bold;
            color: #1a1a1a;
            margin: 0;
          }
          .title {
            font-size: 12pt;
            font-weight: bold;
            color: #2563eb;
            margin: 2pt 0 4pt 0;
            text-transform: uppercase;
          }
          .contact {
            font-size: 9.5pt;
            color: #64748b;
            margin: 4pt 0 0 0;
          }
          .section-title {
            font-size: 11pt;
            font-weight: bold;
            color: #0f172a;
            border-bottom: 1px solid #e2e8f0;
            padding-bottom: 2pt;
            margin-top: 14pt;
            margin-bottom: 8pt;
            text-transform: uppercase;
            letter-spacing: 0.5pt;
          }
          .summary-text {
            font-size: 10pt;
            color: #334155;
            text-align: justify;
            line-height: 1.4;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1 class="name">${escapeHtml(resume.name)}</h1>
          <div class="title">${escapeHtml(resume.title)}</div>
          <div class="contact">
            ${escapeHtml(resume.email)} &nbsp;•&nbsp; ${escapeHtml(resume.location)}${resume.linkedin ? ` &nbsp;•&nbsp; ${escapeHtml(resume.linkedin)}` : ''}
          </div>
        </div>

        <div class="section-title">Professional Summary (职业总结)</div>
        <p class="summary-text">${escapeHtml(resume.summary)}</p>

        <div class="section-title">Core Capabilities (核心竞争力)</div>
        <div style="margin-bottom: 6pt;">
          ${capabilitiesHtml}
        </div>

        <div class="section-title">Work Experience (核心履历优化)</div>
        <div>
          ${experienceHtml}
        </div>

        <div class="section-title">Education (教育背景)</div>
        <p style="font-size: 10pt; color: #334155; font-weight: bold; margin: 0;">${escapeHtml(resume.education)}</p>

        <div class="section-title">Skills & Keywords (技能与关键词)</div>
        <p style="font-size: 10pt; color: #475569; margin: 0; line-height: 1.4;">${escapeHtml(resume.skills.join(', '))}</p>
      </body>
      </html>
    `;

    const blob = new Blob(['\ufeff' + htmlContent], { type: 'application/msword;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${fileName}.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    triggerToast(lang === 'zh' ? `🎉 Word版简历已生成并触发下载！` : `🎉 Word resume successfully generated and downloaded!`);
  };

  // Real Export to PDF using high-fidelity backend generator
  const exportToPDF = async (resume: OptimizedResume, targetRole: string) => {
    triggerToast(lang === 'zh' ? "正在生成高解析度、ATS友好的 PDF 简历，请稍后..." : "Generating high-fidelity, ATS-friendly PDF resume, please wait...");
    try {
      const response = await customFetch("/api/export-pdf", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          resume,
          targetRole
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${resume.name || "resume"}_${targetRole || "optimized"}_优化版.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      triggerToast(lang === 'zh' ? "🎉 PDF版简历已成功生成并触发下载！" : "🎉 PDF resume successfully generated and downloaded!");
    } catch (error) {
      console.error("Failed to export PDF:", error);
      triggerToast(lang === 'zh' ? "❌ 导出 PDF 失败，请稍后重试" : "❌ Failed to export PDF, please try again later.");
    }
  };

  const handleExportResume = (format: 'pdf' | 'word') => {
    if (!isAccurateChecked) {
      triggerToast(lang === 'zh' ? "⚠️ 请先勾选「我确认简历中的公司、岗位、项目均真实准确」后再导出。" : "⚠️ Please check \"I confirm all facts in the resume are authentic and accurate\" before exporting.");
      return;
    }
    if (!currentTask || !currentTask.optimizedResume) {
      triggerToast(lang === 'zh' ? "⚠️ 暂无可导出的优化简历，请先进行优化生成。" : "⚠️ There is no optimized resume to export yet, please generate it first.");
      return;
    }

    const resume = editedResume || currentTask.optimizedResume;
    const fileName = `${resume.name}_${currentTask.targetRole}_优化版`;

    if (format === 'word') {
      exportToWord(resume, fileName);
    } else if (format === 'pdf') {
      exportToPDF(resume, currentTask.targetRole);
    }
  };

  const handleExportFullPackage = async () => {
    if (!isAccurateChecked) {
      triggerToast(lang === 'zh' ? "⚠️ 请先勾选「我确认简历中的公司、岗位、项目均真实准确」后再导出。" : "⚠️ Please check \"I confirm all facts in the resume are authentic and accurate\" before exporting.");
      return;
    }
    if (!currentTask) return;

    setIsExportingPackage(true);
    triggerToast(lang === 'zh' ? '📦 正在打包求职大礼包，请稍候...' : '📦 Compiling your career package, please wait...');

    try {
      const response = await customFetch(`/api/resume-reports/${currentTask.id}/export/package`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resume: editedResume || currentTask.optimizedResume,
          versions: resumeVersions.length > 0 ? resumeVersions : undefined,
          targetRole: currentTask.targetRole,
          report: currentTask.report,
          matchReport: currentTask.matchReport
        })
      });

      if (!response.ok) throw new Error(`Export failed: ${response.status}`);

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const role = currentTask.targetRole || "optimized";
      link.download = `AI高阶岗位优化包_${role}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      triggerToast(lang === 'zh' ? '🎉 高管求职大礼包打包成功，开始下载！' : '🎉 Package compiled successfully, starting download!');
    } catch (e) {
      console.error(e);
      triggerToast(lang === 'zh' ? '❌ 打包导出失败，请稍后重试。' : '❌ Export failed, please try again.');
    } finally {
      setIsExportingPackage(false);
    }
  };

  // Pre-load executive sample resume for quick UI testing
  const loadQuickSampleResume = () => {
    setResumeText(lang === 'zh' ? SAMPLE_RESUME_ZH : SAMPLE_RESUME_EN);
    setResumeFileName(lang === 'zh' ? "张建国_资深产品经理简历_2026.txt" : "Jianguo_Zhang_Senior_Product_Manager_2026.txt");
    triggerToast(lang === 'zh' 
      ? "已加载高管求职原始简历样本，您可以点击「分析简历」测试大模型差距匹配评分！" 
      : "Loaded sample resume! Click 'Analyze Match' to evaluate competency gaps with AI."
    );
  };

  // File parsing and setting helper
  const parseAndSetFile = async (file: File) => {
    setResumeFileName(file.name);
    const reader = new FileReader();
    reader.onload = async (event) => {
      if (event.target && event.target.result && typeof event.target.result === "string") {
        try {
          const base64Data = event.target.result.split(',')[1];
          if (!base64Data) {
            triggerToast(`无法读取文件「${file.name}」的二进制数据`);
            return;
          }
          
          triggerToast(`已检测到「${file.name}」，正在进行深度文本解析...`);
          
          const response = await customFetch("/api/parse-file", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              fileName: file.name,
              fileData: base64Data,
            }),
          });
          
          if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error || "服务器解析出错");
          }
          
          const data = await response.json();
          if (data.text) {
            setResumeText(data.text);
            triggerToast(`文件「${file.name}」解析成功！已自动填充简历文本。`);
          } else {
            throw new Error("解析返回内容为空");
          }
        } catch (err: any) {
          console.error("File parse error:", err);
          triggerToast(`文件解析失败: ${err.message || err}`);
        }
      }
    };
    reader.onerror = () => {
      triggerToast(`读取本地文件「${file.name}」失败`);
    };
    reader.readAsDataURL(file);
  };

  // Drag and Drop files handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(true);
  };

  const handleDragLeave = () => {
    setIsDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      parseAndSetFile(e.dataTransfer.files[0]);
    }
  };

  const handleDeleteTask = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const filtered = tasks.filter(t => t.id !== id);
    saveTasks(filtered);
    if (currentTaskId === id) {
      setCurrentTaskId(filtered.length > 0 ? filtered[0].id : null);
    }
    triggerToast("已安全删除该项岗位历史解析记录。");
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans flex flex-col antialiased">
      
      {/* Dynamic Toast Alert */}
      <AnimatePresence>
        {showSuccessToast && (
          <motion.div 
            initial={{ opacity: 0, y: -50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="fixed top-5 left-1/2 -translate-x-1/2 z-[100] bg-slate-900 text-white px-5 py-3 rounded-xl shadow-xl flex items-center gap-3 border border-slate-700/50 w-[calc(100vw-2rem)] max-w-md"
          >
            <Sparkles className="w-5 h-5 text-emerald-400 shrink-0 animate-pulse" />
            <span className="text-xs sm:text-sm font-medium leading-relaxed">{showSuccessToast}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {!currentUser ? (
        <div className="flex-1 min-h-screen flex items-center justify-center p-4 bg-slate-50 relative overflow-hidden font-sans">
          {/* Decorative background grid */}
          <div className="absolute inset-0 bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] [background-size:16px_16px] opacity-60"></div>
          
          <motion.div 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-md bg-white border border-slate-200 shadow-xl rounded-2xl overflow-hidden relative z-10 flex flex-col"
          >
            {/* Header / Brand info */}
            <div className="bg-slate-900 text-white p-6 relative">
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-blue-400" />
                  <span className="font-sans font-bold text-lg tracking-tight text-white">CareerAI</span>
                  <span 
                    onClick={() => setShowV04ReleaseNotes(true)}
                    className="bg-amber-500/20 text-amber-300 font-mono text-[9px] px-2 py-0.5 rounded-full font-bold cursor-pointer hover:bg-amber-500/35 transition-colors"
                    title="点击查看 V0.4 PRO 版本亮点"
                  >
                    V0.4 PRO
                  </span>
                </div>
                {/* Language Switcher */}
                <div className="flex gap-1.5 bg-white/10 p-0.5 rounded-lg">
                  <button 
                    onClick={() => toggleLang('zh')}
                    className={`text-[9px] font-bold px-2 py-1 rounded transition-colors ${lang === 'zh' ? 'bg-white text-slate-900' : 'text-slate-300 hover:text-white'}`}
                  >
                    中
                  </button>
                  <button 
                    onClick={() => toggleLang('en')}
                    className={`text-[9px] font-bold px-2 py-1 rounded transition-colors ${lang === 'en' ? 'bg-white text-slate-900' : 'text-slate-300 hover:text-white'}`}
                  >
                    EN
                  </button>
                </div>
              </div>

              <h2 className="text-xl font-extrabold tracking-tight">
                {authMode === 'login' ? t.loginTitle : t.registerTitle}
              </h2>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                {t.authDesc}
              </p>
            </div>

            {/* Auth Form */}
            <form onSubmit={handleAuthSubmit} className="p-6 flex flex-col gap-4">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2">{t.usernameLabel}</label>
                <input 
                  type="text" 
                  value={authUsername}
                  onChange={(e) => setAuthUsername(e.target.value)}
                  placeholder={t.usernamePlaceholder}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-xl text-xs font-medium outline-hidden transition-all text-slate-800"
                  required
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2">{t.passwordLabel}</label>
                <input 
                  type="password" 
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  placeholder={t.passwordPlaceholder}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-xl text-xs font-medium outline-hidden transition-all text-slate-800"
                  required
                />
              </div>

              <button 
                type="submit"
                className="w-full mt-2 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center justify-center gap-1.5"
              >
                {authMode === 'login' ? t.loginBtn : t.registerBtn}
              </button>

              <div className="text-center mt-2 pt-4 border-t border-slate-100">
                <button 
                  type="button"
                  onClick={() => {
                    setAuthMode(authMode === 'login' ? 'register' : 'login');
                    setAuthUsername('');
                    setAuthPassword('');
                  }}
                  className="text-xs text-blue-600 hover:text-blue-700 font-bold transition-colors"
                >
                  {authMode === 'login' ? t.needAccount : t.hasAccount}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      ) : (
        <>

      {/* Global Top Navbar */}
      <header className="h-16 shrink-0 bg-white border-b border-slate-200 sticky top-0 z-40 flex justify-between items-center px-6 md:px-10 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="font-sans font-bold text-2xl tracking-tight text-blue-600">CareerAI</span>
          <span 
            onClick={() => setShowV04ReleaseNotes(true)}
            className="hidden sm:inline bg-amber-500/10 text-amber-600 border border-amber-500/25 hover:bg-amber-500/15 font-mono text-[10px] px-2.5 py-0.5 rounded-full font-bold cursor-pointer transition-all hover:scale-105 active:scale-95"
            title="点击查看 V0.4 PRO 版本亮点"
          >
            V0.4 PRO
          </span>
        </div>

        {/* Center Horizontal Nav for Desktop */}
        <nav className="hidden md:flex gap-8 h-full">
          <button 
            onClick={() => { setCurrentTaskId(null); }}
            className={`h-full flex items-center text-sm font-semibold transition-colors ${!currentTaskId ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-500 hover:text-slate-800'}`}
          >
            {t.newRole}
          </button>
          <button 
            onClick={() => setShowHistoryDrawer(!showHistoryDropdown)}
            className="h-full flex items-center text-sm font-semibold text-slate-500 hover:text-slate-800 transition-colors gap-2"
          >
            {t.history}
            {tasks.length > 0 && (
              <span className="bg-slate-200 text-slate-700 text-xs px-2 py-0.5 rounded-full font-bold">{tasks.length}</span>
            )}
          </button>
          <button
            onClick={() => setShowHelpCenter(true)}
            className="h-full flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-blue-600 transition-colors"
          >
            <HelpCircle className="w-4 h-4" />
            {t.helpCenter}
          </button>
        </nav>

        {/* Right Status Actions */}
        <div className="flex items-center gap-4">
          {/* Notification Center Bell & Dropdown */}
          <div className="relative">
            <button 
              onClick={() => setShowNotificationDropdown(!showNotificationDropdown)}
              className="relative p-2 text-slate-500 hover:bg-slate-100 rounded-full transition-colors"
            >
              <Bell className="w-5 h-5" />
              {notifications.some(n => !n.isRead) && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 border border-white rounded-full animate-bounce"></span>
              )}
            </button>

            <AnimatePresence>
              {showNotificationDropdown && (
                <>
                  {/* Backdrop overlay to close when clicking outside */}
                  <div className="fixed inset-0 z-40" onClick={() => setShowNotificationDropdown(false)}></div>
                  
                  <motion.div 
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="fixed top-16 left-4 right-4 sm:absolute sm:top-auto sm:left-auto sm:right-0 sm:mt-2 w-[calc(100vw-2rem)] max-w-sm sm:w-96 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 overflow-hidden"
                  >
                    <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                      <div className="flex items-center gap-2">
                        <Bell className="w-4 h-4 text-slate-700" />
                        <h4 className="font-bold text-slate-800 text-xs tracking-wide">
                          {lang === 'zh' ? '消息通知中心' : 'Notification Center'}
                        </h4>
                        {notifications.filter(n => !n.isRead).length > 0 && (
                          <span className="bg-rose-100 text-rose-700 font-extrabold text-[9px] px-1.5 py-0.5 rounded-full">
                            {notifications.filter(n => !n.isRead).length}
                          </span>
                        )}
                      </div>
                      <button 
                        onClick={async () => {
                          const previous = notifications;
                          setNotifications(notifications.map(n => ({ ...n, isRead: true })));
                          if (currentUser) {
                            try {
                              const res = await customFetch("/api/notifications/read-all", { method: "POST" });
                              if (!res.ok) throw new Error(`HTTP ${res.status}`);
                              triggerToast(lang === 'zh' ? '已标记所有消息为已读' : 'All marked as read');
                            } catch (err) {
                              console.error("Failed to read all notifications in DB:", err);
                              setNotifications(previous);
                              triggerToast(lang === 'zh' ? '同步失败，请检查网络后重试' : 'Sync failed, please retry.');
                            }
                          } else {
                            triggerToast(lang === 'zh' ? '已标记所有消息为已读' : 'All marked as read');
                          }
                        }}
                        className="text-[10px] font-bold text-blue-600 hover:text-blue-700 transition-colors"
                      >
                        {lang === 'zh' ? '全部忽略' : 'Mark all read'}
                      </button>
                    </div>

                    <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
                      {notifications.length === 0 ? (
                        <div className="p-6 text-center text-slate-400 text-xs">
                          {lang === 'zh' ? '暂无任何通知' : 'No notifications'}
                        </div>
                      ) : (
                        notifications.map((n) => (
                          <div 
                            key={n.id}
                            onClick={async () => {
                              // Optimistically mark as read locally
                              setNotifications(prev => prev.map(notif => notif.id === n.id ? { ...notif, isRead: true } : notif));
                              setActiveNotification(n);
                              setShowNotificationDropdown(false);
                              if (currentUser && !n.isRead) {
                                try {
                                  const res = await customFetch("/api/notifications", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ ...n, isRead: true })
                                  });
                                  if (!res.ok) throw new Error(`HTTP ${res.status}`);
                                } catch (err) {
                                  console.error("Failed to persist notification read status:", err);
                                  // Revert on failure so UI reflects real saved state
                                  setNotifications(prev => prev.map(notif => notif.id === n.id ? { ...notif, isRead: false } : notif));
                                  triggerToast(lang === 'zh' ? '已读状态未能保存，请检查网络后重试' : 'Failed to save read status, please retry.');
                                }
                              }
                            }}
                            className={`p-3.5 hover:bg-slate-50/80 transition-all cursor-pointer flex flex-col gap-1 text-left ${!n.isRead ? 'bg-blue-50/20' : ''}`}
                          >
                            <div className="flex justify-between items-start gap-2">
                              <span className={`font-bold text-xs ${!n.isRead ? 'text-slate-900' : 'text-slate-600'}`}>
                                {lang === 'zh' ? n.title : n.titleEn}
                              </span>
                              {!n.isRead && (
                                <span className="w-1.5 h-1.5 bg-blue-600 rounded-full shrink-0 mt-1.5"></span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed">
                              {lang === 'zh' ? n.content : n.contentEn}
                            </p>
                            <span className="text-[9px] text-slate-400 font-semibold font-mono mt-0.5">
                              {lang === 'zh' ? n.time : n.timeEn}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

          {/* Expert Admin Dashboard Toggle Button */}
          <button 
            onClick={handleToggleAdminConsole}
            className={`px-3 py-1.5 rounded-lg text-[10px] font-bold tracking-wider uppercase transition-all flex items-center gap-1.5 ${
              showAdminConsole 
                ? 'bg-blue-600 text-white shadow-md shadow-blue-200' 
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:inline">专家后台</span>
          </button>

          {/* Settings / Multi-Language Selector Dropdown (Hidden on mobile as it is inside the side-drawer) */}
          <div className="relative group hidden sm:block">
            <button className="p-2 text-slate-500 hover:bg-slate-100 rounded-full transition-colors flex items-center justify-center">
              <Settings className="w-5 h-5" />
            </button>
            <div className="absolute right-0 top-full pt-1.5 w-40 hidden group-hover:block z-30">
              <div className="bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden p-2">
                <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider px-2 py-1 border-b border-slate-100">
                  {t.languageSettings}
                </div>
                <button 
                  onClick={() => toggleLang('zh')}
                  className={`w-full text-left px-3 py-1.5 text-xs font-bold rounded-lg mt-1 flex items-center justify-between ${lang === 'zh' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}
                >
                  <span>简体中文</span>
                  {lang === 'zh' && <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>}
                </button>
                <button 
                  onClick={() => toggleLang('en')}
                  className={`w-full text-left px-3 py-1.5 text-xs font-bold rounded-lg mt-0.5 flex items-center justify-between ${lang === 'en' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}
                >
                  <span>English</span>
                  {lang === 'en' && <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>}
                </button>
              </div>
            </div>
          </div>

          <div className="h-8 w-[1px] bg-slate-200 hidden sm:block"></div>

          {/* User profile details */}
          {currentUser && (
            <div className="relative">
              <button 
                id="user-profile-menu-btn"
                onClick={() => setShowUserDropdown(!showUserDropdown)}
                className="flex items-center gap-3 cursor-pointer hover:bg-slate-50 p-1.5 rounded-xl transition-all"
              >
                <div className="w-8 h-8 rounded-full bg-blue-600 text-white overflow-hidden flex items-center justify-center font-bold text-sm">
                  {currentUser.username.substring(0, 2).toUpperCase()}
                </div>
                <div className="text-left hidden md:block">
                  <p className="text-xs font-bold text-slate-800 leading-tight">{currentUser.username}</p>
                  <p className="text-[9px] text-slate-400 font-bold font-mono uppercase mt-0.5">{t.executivePortal}</p>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              </button>

              {showUserDropdown && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowUserDropdown(false)} />
                  <div className="absolute right-0 top-full mt-2 w-48 bg-white border border-slate-200 rounded-xl shadow-lg p-2 z-50">
                    <div className="px-3 py-2 border-b border-slate-100">
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{t.currentUserLabel}</p>
                      <p className="text-xs font-bold text-slate-800 mt-1 truncate">{currentUser.username}</p>
                    </div>
                    <button 
                      onClick={handleLogout}
                      className="w-full text-left px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 rounded-lg mt-1 flex items-center gap-2 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5 shrink-0" />
                      <span>{t.logout}</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Mobile Menu Toggle Button */}
          <button 
            id="mobile-menu-toggle-btn"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 text-slate-600 hover:bg-slate-100 rounded-full transition-colors lg:hidden flex items-center justify-center"
            aria-label="Toggle Mobile Menu"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </header>

      {/* Mobile Sidebar & History Navigation Drawer */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 lg:hidden flex justify-end">
            {/* Backdrop Blur */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileMenuOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs"
            />

            {/* Slide-out Panel */}
            <motion.div 
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", bounce: 0, duration: 0.35 }}
              className="relative w-full max-w-[320px] h-full bg-white shadow-2xl flex flex-col z-10 border-l border-slate-100"
            >
              {/* Header inside drawer */}
              <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-blue-600" />
                  <span className="font-bold text-sm text-slate-900">{t.optimizerTitle}</span>
                </div>
                <button 
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1.5 hover:bg-slate-200 rounded-full text-slate-500 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Drawer Content */}
              <div className="p-5 flex flex-col gap-6 flex-grow overflow-y-auto">
                
                {/* 1. Quick Language switcher */}
                <div>
                  <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">{t.languageSettings}</h3>
                  <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-xl">
                    <button 
                      onClick={() => toggleLang('zh')}
                      className={`py-1.5 px-3 text-xs font-bold rounded-lg transition-all ${lang === 'zh' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
                    >
                      简体中文
                    </button>
                    <button 
                      onClick={() => toggleLang('en')}
                      className={`py-1.5 px-3 text-xs font-bold rounded-lg transition-all ${lang === 'en' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
                    >
                      English
                    </button>
                  </div>
                </div>

                {/* 2. Step progress selection */}
                <div>
                  <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">{lang === 'zh' ? '当前步骤进度' : 'Step Progress'}</h3>
                  <nav className="flex flex-col gap-1">
                    {[
                      { tab: 'role', label: t.roleInput, icon: Search, enabled: true },
                      { tab: 'researched', label: t.jdAnalysis, icon: BarChart3, enabled: !!currentTask },
                      { tab: 'matching', label: t.uploadResume, icon: UploadCloud, enabled: !!currentTask },
                      { tab: 'matched', label: t.matchScore, icon: CheckCircle2, enabled: currentTask && currentTask.matchReport },
                      { tab: 'finalized', label: t.finalize, icon: FileText, enabled: currentTask && currentTask.status === 'finalized' }
                    ].map((item, idx) => {
                      const Icon = item.icon;
                      const isActive = currentTask && (activeTab === item.tab || (!currentTaskId && item.tab === 'role'));
                      return (
                        <button 
                          key={idx}
                          disabled={!item.enabled}
                          onClick={() => {
                            if (item.tab === 'role') {
                              setCurrentTaskId(null);
                            } else {
                              navigateToTab(item.tab as any);
                            }
                            setMobileMenuOpen(false);
                          }}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left ${isActive ? 'bg-blue-50 text-blue-700 font-bold' : item.enabled ? 'text-slate-600 hover:bg-slate-50' : 'opacity-40 cursor-not-allowed text-slate-400'}`}
                        >
                          <Icon className="w-4.5 h-4.5 shrink-0" />
                          <span className="text-xs font-semibold">{item.label}</span>
                        </button>
                      );
                    })}
                  </nav>
                </div>

                {/* 3. History Section */}
                <div className="border-t border-slate-100 pt-5 flex-grow flex flex-col min-h-[220px]">
                  <div className="flex justify-between items-center mb-3">
                    <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t.history}</h3>
                    <button 
                      onClick={() => {
                        setCurrentTaskId(null);
                        setMobileMenuOpen(false);
                      }}
                      className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 transition-all"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{t.newRole}</span>
                    </button>
                  </div>

                  <div className="flex-grow overflow-y-auto max-h-[260px] pr-1 flex flex-col gap-2">
                    {tasks.length === 0 ? (
                      <div className="text-center py-6 border border-dashed border-slate-200 rounded-xl">
                        <History className="w-6 h-6 text-slate-300 mx-auto mb-2" />
                        <p className="text-[10px] text-slate-400 font-bold">{t.noHistory}</p>
                      </div>
                    ) : (
                      tasks.map((task) => (
                        <div 
                          key={task.id}
                          onClick={() => {
                            setCurrentTaskId(task.id);
                            setMobileMenuOpen(false);
                          }}
                          className={`group/task w-full p-3 rounded-xl border transition-all text-left cursor-pointer flex items-start gap-2.5 ${currentTaskId === task.id ? 'bg-blue-50/50 border-blue-200 shadow-xs' : 'bg-white border-slate-200 hover:bg-slate-50'}`}
                        >
                          <Sparkles className={`w-4 h-4 mt-0.5 shrink-0 ${currentTaskId === task.id ? 'text-blue-600' : 'text-slate-400'}`} />
                          <div className="flex-grow min-w-0">
                            <h4 className="text-xs font-bold text-slate-800 truncate leading-tight">{task.targetRole}</h4>
                            <p className="text-[9px] text-slate-400 font-bold mt-1 font-mono">{task.companyName}</p>
                          </div>
                          <button 
                            onClick={(e) => handleDeleteTask(task.id, e)}
                            className="p-1 hover:bg-rose-50 hover:text-rose-600 rounded text-slate-400 transition-colors"
                            aria-label="Delete History Entry"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Footer Section */}
                <div className="border-t border-slate-100 pt-5 mt-auto flex flex-col gap-3">
                  {currentUser && (
                    <div className="flex items-center justify-between gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100 mb-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-blue-600 text-white shrink-0 flex items-center justify-center font-bold text-xs">
                          {currentUser.username.substring(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider font-mono leading-none">ACTIVE USER</p>
                          <p className="text-xs font-bold text-slate-800 truncate mt-1">{currentUser.username}</p>
                        </div>
                      </div>
                      <button 
                        onClick={() => {
                          handleLogout();
                          setMobileMenuOpen(false);
                        }}
                        className="px-2.5 py-1.5 border border-rose-200 hover:bg-rose-50 text-rose-600 rounded-lg text-[10px] font-bold transition-colors shrink-0"
                      >
                        {t.logout}
                      </button>
                    </div>
                  )}

                  <button 
                    onClick={() => {
                      window.location.href = "mailto:siounex@qq.com?subject=" + encodeURIComponent(lang === 'zh' ? 'CareerAI 高管客服咨询' : 'CareerAI Executive Support Inquiry');
                      triggerToast(t.supportMsg);
                      setMobileMenuOpen(false);
                    }}
                    className="w-full py-2.5 px-4 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-colors text-center shadow-sm"
                  >
                    {t.premiumSupport}
                  </button>
                  <div className="flex justify-between px-2 text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                    <button onClick={() => { setShowHelpCenter(true); setMobileMenuOpen(false); }} className="hover:text-blue-600 transition-colors flex items-center gap-1">
                      <HelpCircle className="w-3 h-3" />{t.helpCenter}
                    </button>
                    <a href="/privacy" onClick={() => setMobileMenuOpen(false)} className="hover:text-blue-600 transition-colors">{t.privacy}</a>
                  </div>
                </div>

              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Main Multi-Pane Body */}
      <div className="flex-1 flex overflow-hidden relative">

        {/* Fixed Side Navigation */}
        <aside className={`w-[260px] bg-white border-r border-slate-200 shrink-0 p-5 flex flex-col overflow-y-auto hidden lg:flex`}>
          <div className="mb-8 flex items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
            <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center text-white">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-sm text-slate-900 leading-tight">{t.optimizerTitle}</h2>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">{t.executiveEdition}</p>
            </div>
          </div>

          <nav className="flex-grow flex flex-col gap-1.5">
            {/* 1. Role Input */}
            <button 
              onClick={() => { setCurrentTaskId(null); }}
              className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-xl transition-all duration-200 text-left ${!currentTask ? 'bg-blue-50 text-blue-700 font-bold shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              <Search className="w-5 h-5 shrink-0" />
              <span className="text-xs uppercase font-bold tracking-wider">{t.roleInput}</span>
            </button>

            {/* 2. JD Analysis */}
            <button 
              disabled={!currentTask}
              onClick={() => { if (currentTask) navigateToTab('researched'); }}
              className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-xl transition-all duration-200 text-left ${currentTask && (activeTab === 'researched') ? 'bg-blue-50 text-blue-700 font-bold shadow-sm' : currentTask ? 'text-slate-600 hover:bg-slate-50' : 'opacity-40 cursor-not-allowed text-slate-400'}`}
            >
              <BarChart3 className="w-5 h-5 shrink-0" />
              <span className="text-xs uppercase font-bold tracking-wider">{t.jdAnalysis}</span>
              {currentTask && currentTask.report && (
                <span className="ml-auto w-2 h-2 rounded-full bg-emerald-500"></span>
              )}
            </button>

            {/* 3. Upload */}
            <button 
              disabled={!currentTask}
              onClick={() => { if (currentTask) navigateToTab('matching'); }}
              className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-xl transition-all duration-200 text-left ${currentTask && (activeTab === 'matching') ? 'bg-blue-50 text-blue-700 font-bold shadow-sm' : currentTask ? 'text-slate-600 hover:bg-slate-50' : 'opacity-40 cursor-not-allowed text-slate-400'}`}
            >
              <UploadCloud className="w-5 h-5 shrink-0" />
              <span className="text-xs uppercase font-bold tracking-wider">{t.uploadResume}</span>
              {currentTask && currentTask.originalResumeText && (
                <span className="ml-auto w-2 h-2 rounded-full bg-emerald-500"></span>
              )}
            </button>

            {/* 4. Match Score */}
            <button 
              disabled={!currentTask || !currentTask.matchReport}
              onClick={() => { if (currentTask) navigateToTab('matched'); }}
              className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-xl transition-all duration-200 text-left ${currentTask && (activeTab === 'matched') ? 'bg-blue-50 text-blue-700 font-bold shadow-sm' : currentTask && currentTask.matchReport ? 'text-slate-600 hover:bg-slate-50' : 'opacity-40 cursor-not-allowed text-slate-400'}`}
            >
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              <span className="text-xs uppercase font-bold tracking-wider">{t.matchScore}</span>
              {currentTask && currentTask.matchReport && (
                <span className="ml-auto bg-emerald-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{currentTask.matchReport.matchScore}</span>
              )}
            </button>

            {/* 5. Finalize */}
            <button 
              disabled={!currentTask || currentTask.status !== 'finalized'}
              onClick={() => { if (currentTask) navigateToTab('finalized'); }}
              className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-xl transition-all duration-200 text-left ${currentTask && (activeTab === 'finalized') ? 'bg-blue-50 text-blue-700 font-bold shadow-sm' : currentTask && currentTask.status === 'finalized' ? 'text-slate-600 hover:bg-slate-50' : 'opacity-40 cursor-not-allowed text-slate-400'}`}
            >
              <FileText className="w-5 h-5 shrink-0" />
              <span className="text-xs uppercase font-bold tracking-wider">{t.finalize}</span>
            </button>
          </nav>

          {/* Fixed Side Navigation Bottom Help links */}
          <div className="mt-auto border-t border-slate-100 pt-5 flex flex-col gap-4">
            <button 
              onClick={() => {
                window.location.href = "mailto:siounex@qq.com?subject=" + encodeURIComponent(lang === 'zh' ? 'CareerAI 高管客服咨询' : 'CareerAI Executive Support Inquiry');
                triggerToast(t.supportMsg);
              }}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-colors shadow-sm"
            >
              {t.premiumSupport}
            </button>
            <div className="flex justify-between px-2 text-[10px] text-slate-500 font-bold uppercase tracking-wider">
              <button onClick={() => setShowHelpCenter(true)} className="hover:text-blue-600 transition-colors flex items-center gap-1">
                <HelpCircle className="w-3 h-3" />{t.helpCenter}
              </button>
              <a href="/privacy" className="hover:text-blue-600 transition-colors">{t.privacy}</a>
            </div>
          </div>
        </aside>

        {/* Main Fluid Container Stage */}
        <main className="flex-1 overflow-y-auto p-4 md:p-10 flex flex-col justify-between relative bg-slate-50">
          
          {/* Main loader screen for API calls */}
          {loadingStep !== 'idle' && (
            <div className="absolute inset-0 bg-slate-50/95 z-50 flex flex-col items-center justify-center p-8">
              <div className="w-20 h-20 rounded-2xl bg-white border border-slate-200 shadow-xl flex items-center justify-center relative mb-6">
                <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
                <div className="absolute inset-0 w-full h-full rounded-2xl border border-blue-500/20 animate-pulse"></div>
              </div>
              
              <h3 className="font-bold text-xl text-slate-900 mb-2">
                {loadingStep === 'research' && t.loadResearchTitle}
                {loadingStep === 'matching' && t.loadMatchingTitle}
                {loadingStep === 'upgrading' && t.loadUpgradingTitle}
              </h3>
              
              <p className="text-slate-500 text-sm text-center max-w-md mb-6">
                {loadingStep === 'research' && t.loadResearchDesc}
                {loadingStep === 'matching' && t.loadMatchingDesc}
                {loadingStep === 'upgrading' && t.loadUpgradingDesc}
              </p>

              <div className="w-full max-w-sm bg-slate-200 rounded-full h-2 overflow-hidden shadow-inner">
                <div 
                  className="bg-blue-600 h-full rounded-full transition-all duration-300"
                  style={{ width: `${loadingProgress}%` }}
                ></div>
              </div>
              <span className="text-xs text-blue-700 font-mono font-bold mt-2">{loadingProgress}% {t.completedLabel}</span>
            </div>
          )}

          {/* V0.4 Expert Admin Control Console Stage */}
          {showAdminConsole && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="max-w-[1200px] w-full mx-auto flex-grow flex flex-col gap-6"
            >
              {/* Header card with close */}
              <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl text-white shadow-xl relative overflow-hidden flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 shrink-0">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-600 via-indigo-500 to-emerald-400"></div>
                <div>
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-blue-400" />
                    <h2 className="font-extrabold text-lg tracking-tight uppercase">CareerAI 专家服务控制后台</h2>
                  </div>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    本控制台专供高管委员会监控底层模型转化漏斗 (Conversion Funnel)、处理高阶反馈、及对高价值线索进行跟进。
                  </p>
                </div>
                <button 
                  onClick={() => setShowAdminConsole(false)}
                  className="px-4 py-2 border border-slate-800 hover:bg-slate-800 text-slate-300 rounded-xl text-xs font-bold transition-all shrink-0 self-start sm:self-auto"
                >
                  关闭控制台
                </button>
              </div>

              {isLoadingAdmin ? (
                <div className="bg-white border border-slate-200 rounded-2xl p-16 flex flex-col items-center justify-center text-slate-400 gap-3">
                  <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                  <span className="text-xs font-bold uppercase tracking-widest font-mono">正在分析系统级多维数据...</span>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Left Column: Conversion Funnel Chart & Traffic Simulator */}
                  <div className="lg:col-span-2 space-y-6">
                    {/* Funnel Widget */}
                    <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm">
                      <div className="flex justify-between items-center mb-4 pb-2 border-b border-slate-100">
                        <div className="flex items-center gap-2">
                          <TrendingUp className="w-4 h-4 text-blue-600" />
                          <h3 className="font-bold text-slate-800 text-sm">全链条用户转化漏斗 (实时画像归因)</h3>
                        </div>
                        <span className="bg-blue-50 text-blue-700 text-[10px] font-mono px-2 py-0.5 rounded font-extrabold">REAL-TIME</span>
                      </div>

                      {adminFunnel.length === 0 ? (
                        <p className="text-xs text-slate-400 py-6 text-center">暂无漏斗统计</p>
                      ) : (
                        <div className="space-y-4">
                          {adminFunnel.map((step, idx) => {
                            const percentOfTotal = ((step.count / adminFunnel[0].count) * 100).toFixed(1);
                            const percentOfPrevious = idx === 0 ? '100.0' : ((step.count / adminFunnel[idx - 1].count) * 100).toFixed(1);
                            
                            return (
                              <div key={idx} className="space-y-1.5">
                                <div className="flex justify-between text-xs font-bold">
                                  <div className="flex items-center gap-2">
                                    <span className="w-5 h-5 rounded-full bg-slate-100 border border-slate-200 text-slate-600 flex items-center justify-center font-mono text-[10px] font-bold">
                                      {idx + 1}
                                    </span>
                                    <span className="text-slate-800">{step.step}</span>
                                  </div>
                                  <div className="text-slate-500 font-mono text-[11px] flex gap-2.5">
                                    <span className="text-slate-850 font-bold">{step.count} 次</span>
                                    <span>总占比: {percentOfTotal}%</span>
                                    {idx > 0 && <span className="text-emerald-600">转化率: {percentOfPrevious}%</span>}
                                  </div>
                                </div>
                                <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden shadow-inner relative flex">
                                  <div 
                                    className="bg-blue-600 h-full rounded-full transition-all"
                                    style={{ width: `${percentOfTotal}%` }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Funnel Insights / Action Plan */}
                    <div className="bg-blue-50/50 border border-blue-100 p-5 rounded-2xl">
                      <div className="flex items-center gap-2 text-blue-800 font-bold mb-2 text-sm uppercase tracking-wider">
                        <Sparkles className="w-4 h-4 text-blue-600" />
                        <h4>漏斗归因分析与专家决策建议</h4>
                      </div>
                      <div className="space-y-2 text-xs text-blue-700 leading-relaxed font-medium">
                        <p>1. <b>高管澄清问卷效果显著：</b> 引入三步澄清对话机制后，用户的靶向匹配重构满意度自 84.5% 跃升至 <b>96.8%</b>，核心诉求画像精确度增加近 2.3 倍。</p>
                        <p>2. <b>改写建议采纳率较高：</b> 用户在得到 AI 措辞重构建议后，平均会采纳 <b>2.6 处</b>子弹点。通过对 “忽略” 项特征归类，后续应继续对“管理幅度”维度的改写提炼进行微调。</p>
                        <p>3. <b>大礼包需求迫切：</b> 后台数据显示 42.5% 的已付费用户点击了“一键求职大礼包(.zip)”导出，建议后续增加面试问题自动生成与行业趋势简报等周边产品线。</p>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Customer Feedback Feed */}
                  <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm flex flex-col h-[520px]">
                    <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100 shrink-0">
                      <div className="flex items-center gap-2">
                        <MessageSquare className="w-4 h-4 text-emerald-600" />
                        <h3 className="font-bold text-slate-800 text-sm">最新客户满意度反馈信息流</h3>
                      </div>
                      <span className="bg-emerald-50 text-emerald-700 text-[9px] font-mono font-bold px-2 py-0.5 rounded-full">FEED</span>
                    </div>

                    <div className="flex-grow overflow-y-auto space-y-3.5 pr-1">
                      {adminFeedbacks.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-400 py-12">
                          <AlertCircle className="w-8 h-8 text-slate-300 mb-1" />
                          <p className="text-xs">暂无用户提交反馈</p>
                        </div>
                      ) : (
                        adminFeedbacks.map((fb, idx) => (
                          <div key={idx} className="bg-slate-50 border border-slate-150 p-3.5 rounded-xl hover:bg-slate-100/50 transition-colors">
                            <div className="flex justify-between items-start mb-2">
                              <div>
                                <span className="text-[10px] font-extrabold text-slate-900 bg-slate-200 px-1.5 py-0.5 rounded font-mono uppercase tracking-wider">
                                  {fb.username || '匿名高管'}
                                </span>
                                <span className="text-[9px] text-slate-400 font-mono block mt-0.5">{fb.createdAt || '刚刚'}</span>
                              </div>
                              <div className="flex text-amber-400 text-xs">
                                {Array.from({ length: fb.rating || 5 }).map((_, i) => (
                                  <span key={i}>★</span>
                                ))}
                              </div>
                            </div>
                            <p className="text-xs text-slate-700 leading-relaxed font-medium bg-white p-2 border border-slate-150 rounded-lg text-justify italic">
                              “ {fb.feedbackText || '无具体说明'} ”
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* Actionable Content Workspace */}
          <div className="max-w-[1200px] w-full mx-auto flex-grow flex flex-col justify-start">
            
            {!currentTask ? (
              
              /* TAB 1: Role Input Screen (Home) */
              <motion.div 
                initial={{ opacity: 0, y: 15 }} 
                animate={{ opacity: 1, y: 0 }} 
                className="flex flex-col items-center justify-center py-10 md:py-16"
              >
                <div className="text-center max-w-3xl mx-auto mb-12">
                  <span className="text-[10px] font-bold tracking-widest text-blue-600 uppercase bg-blue-50 px-3 py-1 rounded-full">{t.targetAnalysis}</span>
                  <h1 className="text-4xl md:text-5xl font-extrabold text-slate-900 tracking-tight mt-4 mb-6 leading-tight">
                    {t.unlockTitle} <span className="text-blue-600">{t.unlockRole}</span>
                  </h1>
                  <p className="text-slate-500 text-lg leading-relaxed">
                    {t.unlockDesc}
                  </p>
                </div>

                {/* Glassmorphic Search Form Component */}
                <div className="w-full max-w-2xl bg-white border border-slate-200/80 p-6 md:p-8 rounded-2xl shadow-lg border-b-4 border-b-blue-600 relative overflow-hidden mb-8">
                  
                  {/* Subtle decorative glow */}
                  <div className="absolute top-0 right-0 w-32 h-32 bg-blue-400/5 rounded-full blur-3xl pointer-events-none"></div>

                  <div className="flex flex-col md:flex-row gap-4">
                    <div className="relative flex-grow">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                      <input 
                        type="text" 
                        value={targetRole}
                        onChange={(e) => setTargetRole(e.target.value)}
                        placeholder={t.placeholderRole}
                        className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-100 transition-all font-medium"
                      />
                    </div>
                    <button 
                      onClick={() => handleAnalyzeRole()}
                      className="bg-blue-600 text-white px-8 py-4 rounded-xl text-sm font-bold hover:bg-blue-700 transition-colors shadow-sm flex items-center justify-center gap-2 shrink-0 group"
                    >
                      <span>{t.analyzeBtn}</span>
                      <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                    </button>
                  </div>

                  {/* Advanced Filters collapsed by default */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6 pt-5 border-t border-slate-100">
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2">{t.industryLabel}</label>
                      <input 
                        type="text" 
                        value={industry}
                        onChange={(e) => setIndustry(e.target.value)}
                        placeholder={t.placeholderIndustry}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-blue-500 focus:bg-white transition-all"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2">{t.locationLabel}</label>
                      <input 
                        type="text" 
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                        placeholder={t.placeholderLocation}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-blue-500 focus:bg-white transition-all"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2">{t.seniorityLabel}</label>
                      <select 
                        value={seniority}
                        onChange={(e) => setSeniority(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-blue-500 focus:bg-white transition-all font-bold"
                      >
                        <option value="总监 / 负责人">{t.seniority1}</option>
                        <option value="副总裁 / VP">{t.seniority2}</option>
                        <option value="总经理">{t.seniority3}</option>
                        <option value="架构师 / 科学家">{t.seniority4}</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Trending Roles Section */}
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3 text-slate-500 text-sm mb-16">
                  <h2 className="font-bold text-xs uppercase tracking-wider text-slate-400 shrink-0">{t.trendingRoles}:</h2>
                  <div className="flex flex-wrap gap-2 justify-center font-bold">
                    {["VP of AI Engineering", "Chief Data Officer", "Head of Generative AI"].map((role, idx) => (
                      <button 
                        key={idx}
                        onClick={() => {
                          setTargetRole(role);
                          handleAnalyzeRole(role);
                        }}
                        className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 hover:text-blue-700 text-slate-700 rounded-full font-mono text-xs font-semibold transition-all shadow-sm"
                      >
                        {role}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Bento Grid: How It Works */}
                <div className="w-full max-w-4xl mt-6">
                  <h2 className="font-bold text-lg text-slate-900 text-center mb-8 uppercase tracking-widest text-slate-400">{t.optimizationProcess}</h2>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    
                    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col items-center text-center">
                      <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600 mb-4 font-bold">
                        <Search className="w-6 h-6" />
                      </div>
                      <h3 className="font-bold text-slate-900 mb-2">{t.process1Title}</h3>
                      <p className="text-slate-500 text-xs leading-relaxed">{t.process1Desc}</p>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col items-center text-center">
                      <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600 mb-4 font-bold">
                        <BarChart3 className="w-6 h-6" />
                      </div>
                      <h3 className="font-bold text-slate-900 mb-2">{t.process2Title}</h3>
                      <p className="text-slate-500 text-xs leading-relaxed">{t.process2Desc}</p>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col items-center text-center">
                      <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600 mb-4 font-bold">
                        <FileText className="w-6 h-6" />
                      </div>
                      <h3 className="font-bold text-slate-900 mb-2">{t.process3Title}</h3>
                      <p className="text-slate-500 text-xs leading-relaxed">{t.process3Desc}</p>
                    </div>

                  </div>
                </div>
              </motion.div>

            ) : (
              
              /* Active Task Navigation Area */
              <div className="w-full flex flex-col gap-6">
                
                {/* Dashboard Subheader with current active target role */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 pb-5 border-b border-slate-200">
                  <div>
                    <span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest bg-blue-50 px-2 py-1 rounded">{t.targetContext}</span>
                    <h1 className="text-2xl md:text-3xl font-bold text-slate-900 mt-2">
                      {currentTask.targetRole} - {t.marketInsight}
                    </h1>
                    <p className="text-slate-500 text-sm mt-1">
                      {t.dataAggregated} {currentTask.report?.jdCount || 25} {t.dataAggregatedSuffix}
                    </p>
                  </div>
                  
                  {/* Status Indicator Pill */}
                  <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm text-xs font-semibold text-slate-700">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    <span>
                      {currentTask.status === 'researched' && t.pillResearched}
                      {currentTask.status === 'matching' && t.pillMatching}
                      {currentTask.status === 'matched' && t.pillMatched}
                      {currentTask.status === 'upgraded' && t.pillUpgraded}
                      {currentTask.status === 'finalized' && t.pillFinalized}
                    </span>
                  </div>
                </div>

                {/* TABS STAGE RENDERS */}
                
                {activeTab === 'researched' && currentTask.report && (
                  
                  /* TAB 2: JD Analysis (Bento Grid) */
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="grid grid-cols-1 lg:grid-cols-12 gap-6"
                  >
                    
                    {/* Left: Research Summary */}
                    <div className="col-span-1 lg:col-span-8 bg-white border border-slate-200 p-6 rounded-2xl shadow-sm">
                      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
                        <Sparkles className="w-5 h-5 text-blue-600" />
                        <h3 className="font-bold text-slate-950 text-sm uppercase tracking-wider">{t.researchSummary}</h3>
                      </div>
                      <p className="text-slate-700 text-sm leading-relaxed text-justify">
                        {currentTask.report.researchSummary}
                      </p>
                    </div>

                    {/* Right: Mandatory Requirements */}
                    <div className="col-span-1 lg:col-span-4 bg-white border border-slate-200 p-6 rounded-2xl shadow-sm">
                      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
                        <AlertCircle className="w-5 h-5 text-rose-500" />
                        <h3 className="font-bold text-slate-950 text-sm uppercase tracking-wider text-rose-600 font-bold">Mandatory Requirements (必备硬性要求)</h3>
                      </div>
                      <ul className="flex flex-col gap-3">
                        {currentTask.report.mandatoryRequirements.map((req, idx) => (
                          <li key={idx} className="flex items-start gap-2.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 mt-2 shrink-0"></span>
                            <span className="text-xs text-slate-700 font-medium leading-normal">{req}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Bottom Full: Top 10 High Frequency Skills */}
                    <div className="col-span-1 lg:col-span-12 bg-white border border-slate-200 p-6 rounded-2xl shadow-sm">
                      <div className="flex justify-between items-center mb-6 pb-3 border-b border-slate-100">
                        <div className="flex items-center gap-2">
                          <BarChart3 className="w-5 h-5 text-blue-600" />
                          <h3 className="font-bold text-slate-950 text-sm uppercase tracking-wider">Top 10 High-Frequency Skills (高频技能排行)</h3>
                        </div>
                        <span className="text-xs font-mono text-slate-400 font-bold">N={currentTask.report.jdCount}+ POSTINGS</span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4">
                        {currentTask.report.highFrequencySkills.map((skill, idx) => (
                          <div key={idx} className="flex flex-col gap-1.5">
                            <div className="flex justify-between text-xs font-semibold">
                              <span className="text-slate-800">{skill.name}</span>
                              <span className="font-mono text-blue-600 font-bold">{skill.percentage}%</span>
                            </div>
                            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden shadow-inner">
                              <motion.div 
                                initial={{ width: 0 }}
                                animate={{ width: `${skill.percentage}%` }}
                                transition={{ duration: 0.8, delay: idx * 0.05 }}
                                className="bg-blue-600 h-full rounded-full"
                              ></motion.div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Plus Differentiator Skills */}
                    <div className="col-span-1 lg:col-span-12 bg-blue-50 border border-blue-100 p-6 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 text-blue-800 font-bold mb-1.5 text-sm uppercase tracking-wider">
                          <CheckCircle2 className="w-5 h-5 text-blue-600" />
                          <h4>Plus Skills (高阶差异化加分项)</h4>
                        </div>
                        <p className="text-xs text-blue-600 font-medium">这些能力通常属于稀缺差异化优势，在简历中突出能直接让猎头或用人单位高管眼前一亮。</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {currentTask.report.plusSkills.map((skill, idx) => (
                          <span key={idx} className="px-3.5 py-1.5 bg-white border border-blue-200 text-blue-700 rounded-xl text-xs font-mono font-semibold shadow-sm">
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* JD Evidence Chain Component */}
                    {jobResearchConclusions && jobResearchConclusions.length > 0 && (
                      <div className="col-span-1 lg:col-span-12 bg-white border border-slate-200 p-6 rounded-2xl shadow-sm">
                        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
                          <BookOpen className="w-5 h-5 text-blue-600" />
                          <h3 className="font-bold text-slate-950 text-sm uppercase tracking-wider">Premium JD Evidence Chain (百万真实岗位原汁原味佐证研判链)</h3>
                        </div>
                        <p className="text-xs text-slate-500 mb-6 leading-relaxed">
                          以下核心结论由 CareerAI 底层研判引擎对全网百万级真实招聘信息要求（JD）经特征归纳聚类分析得出。点击下方卡片，查看来自代表性大厂或独角兽的原始 JD 佐证文本，体验高精准度的评估报告。
                        </p>
                        
                        <div className="space-y-3">
                          {jobResearchConclusions.map((conclusion: any) => {
                            const isExpanded = expandedConclusionId === conclusion.id;
                            return (
                              <div key={conclusion.id} className="border border-slate-150 rounded-xl overflow-hidden bg-slate-50/50 hover:bg-slate-50 transition-colors">
                                <button 
                                  onClick={() => setExpandedConclusionId(isExpanded ? null : conclusion.id)}
                                  className="w-full px-5 py-4 flex items-center justify-between text-left focus:outline-none"
                                >
                                  <div className="flex items-center gap-3">
                                    <span className="bg-blue-100 text-blue-700 font-mono text-[10px] font-bold px-2 py-0.5 rounded">
                                      频率 {conclusion.frequency}%
                                    </span>
                                    <div>
                                      <h4 className="text-xs font-bold text-slate-800">{conclusion.title}</h4>
                                      <span className="text-[10px] font-semibold text-slate-400 font-mono block mt-0.5 uppercase tracking-wider">{conclusion.category}</span>
                                    </div>
                                  </div>
                                  <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                </button>
                                
                                {isExpanded && (
                                  <div className="px-5 pb-5 pt-1 border-t border-slate-150 bg-white">
                                    <div className="mb-4">
                                      <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">研判详情</h5>
                                      <p className="text-xs text-slate-600 leading-relaxed text-justify">{conclusion.detail}</p>
                                    </div>
                                    <div className="mb-4">
                                      <h5 className="text-[10px] font-bold text-blue-500 uppercase tracking-widest mb-1">简历建议</h5>
                                      <p className="text-xs text-blue-700 font-medium bg-blue-50/50 p-2.5 rounded-lg border border-blue-100/50 leading-relaxed">{conclusion.suggestion}</p>
                                    </div>
                                    <div>
                                      <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">大厂原始岗位文本佐证</h5>
                                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                        {conclusion.evidences.map((evidence: any) => (
                                          <div key={evidence.id} className="bg-slate-50 border border-slate-150 rounded-lg p-3 flex flex-col justify-between">
                                            <div>
                                              <div className="flex justify-between items-center mb-1.5">
                                                <span className="text-[9px] font-extrabold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">{evidence.companyType}</span>
                                                <span className="text-[8px] font-bold text-slate-400">{evidence.type}</span>
                                              </div>
                                              <p className="text-[11px] text-slate-700 italic leading-relaxed">“...{evidence.text}...”</p>
                                            </div>
                                            <p className="text-[10px] font-bold text-slate-500 mt-2 border-t border-slate-150/50 pt-1.5">★ {evidence.summary}</p>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* CALL TO ACTION CTA MODULE */}
                    <div className="col-span-1 lg:col-span-12 bg-slate-900 border border-slate-800 p-8 rounded-2xl text-center flex flex-col items-center justify-center gap-4 shadow-xl mt-4 relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-600 via-indigo-500 to-emerald-400"></div>
                      <div className="w-16 h-16 rounded-full bg-slate-800/80 flex items-center justify-center text-blue-400 mb-2">
                        <UploadCloud className="w-8 h-8" />
                      </div>
                      <h3 className="text-white text-xl font-bold tracking-tight">测一测您与该职位的匹配契合度</h3>
                      <p className="text-slate-400 text-xs max-w-lg leading-relaxed">
                        {t.ctaMatchDesc}
                      </p>
                      <button 
                        onClick={() => {
                          const updatedTasks = tasks.map(t => {
                            if (t.id === currentTask.id) {
                              return { ...t, status: 'matching' as const };
                            }
                            return t;
                          });
                          saveTasks(updatedTasks);
                          setActiveTab('matching');
                        }}
                        className="mt-2 bg-blue-600 text-white px-8 py-3 rounded-xl text-xs font-bold hover:bg-blue-700 transition-colors shadow-sm font-sans flex items-center gap-2 group"
                      >
                        <span>{t.ctaMatchBtn}</span>
                        <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                      </button>
                    </div>

                  </motion.div>
                )}

                {activeTab === 'matching' && (
                  
                  /* TAB 3: Upload Resume & Raw input stage (Q&A Wizard or File Upload) */
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="w-full"
                  >
                    {showClarificationWizard && clarificationQuestions.length > 0 ? (
                      /* v0.4 SMART CLARIFICATION DIALOG */
                      <div className="max-w-2xl mx-auto bg-white border border-slate-200 shadow-xl rounded-2xl overflow-hidden my-4">
                        <div className="bg-slate-900 text-white p-6 relative">
                          <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-600"></div>
                          <div className="flex justify-between items-center mb-3">
                            <span className="bg-blue-500/20 text-blue-300 font-mono text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                              CareerAI 精准深度研判追问 (V0.4 VIP Exclusive)
                            </span>
                            <span className="text-xs font-mono font-bold text-slate-400">
                              步骤 {currentQuestionIndex + 1} / {clarificationQuestions.length}
                            </span>
                          </div>
                          <h3 className="text-lg font-bold">高级简历缺陷追问：对齐目标岗位关键战役</h3>
                          <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                            大模型深度扫描您的简历后，发现针对「{currentTask.targetRole}」存在以下关键事实缺失。请花 30 秒进行补充，我们将靶向融入简历，可将通过率大幅度提升。
                          </p>
                        </div>

                        {/* Progress Bar */}
                        <div className="w-full bg-slate-100 h-1 shadow-inner">
                          <div 
                            className="bg-blue-600 h-full transition-all duration-300"
                            style={{ width: `${((currentQuestionIndex + 1) / clarificationQuestions.length) * 100}%` }}
                          />
                        </div>

                        <div className="p-6 sm:p-8 flex flex-col gap-6">
                          <AnimatePresence mode="wait">
                            <motion.div
                              key={currentQuestionIndex}
                              initial={{ opacity: 0, x: 20 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0, x: -20 }}
                              transition={{ duration: 0.2 }}
                              className="flex flex-col gap-5"
                            >
                              <div>
                                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">诊断追问</h4>
                                <p className="text-sm font-bold text-slate-900 leading-relaxed">
                                  {clarificationQuestions[currentQuestionIndex].question}
                                </p>
                              </div>

                              <div className="bg-amber-50/60 border border-amber-100 p-4 rounded-xl">
                                <h5 className="text-[10px] font-bold text-amber-700 uppercase tracking-widest mb-1">为什么问这个问题？</h5>
                                <p className="text-xs text-amber-800 leading-relaxed font-medium">
                                  {clarificationQuestions[currentQuestionIndex].reason}
                                </p>
                              </div>

                              {/* Multiple Choice Option Pills */}
                              <div>
                                <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">推荐选择（可直接点击填入下方）：</h5>
                                <div className="flex flex-col gap-2">
                                  {clarificationQuestions[currentQuestionIndex].options.map((option: string, oIdx: number) => (
                                    <button
                                      key={oIdx}
                                      type="button"
                                      onClick={() => {
                                        const updated = [...clarificationQuestions];
                                        updated[currentQuestionIndex].selectedOption = option;
                                        updated[currentQuestionIndex].userAnswer = option;
                                        setClarificationQuestions(updated);
                                        setCustomAnswer(option);
                                      }}
                                      className={`w-full text-left px-4 py-3 border rounded-xl text-xs font-medium transition-all text-justify leading-relaxed ${
                                        clarificationQuestions[currentQuestionIndex].userAnswer === option
                                          ? 'bg-blue-50 border-blue-500 text-blue-700 font-bold shadow-xs'
                                          : 'bg-slate-50 border-slate-200 hover:border-slate-300 hover:bg-slate-100/50 text-slate-700'
                                      }`}
                                    >
                                      {option}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              {/* Text Input area for customization */}
                              <div>
                                <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">或：手动补充更精准的细节：</h5>
                                <textarea
                                  value={clarificationQuestions[currentQuestionIndex].userAnswer || ""}
                                  onChange={(e) => {
                                    const updated = [...clarificationQuestions];
                                    updated[currentQuestionIndex].userAnswer = e.target.value;
                                    setClarificationQuestions(updated);
                                    setCustomAnswer(e.target.value);
                                  }}
                                  placeholder="在此输入您的真实业绩细节，如：主持完成了XX规模的重构，团队XX人，ROI达到XX..."
                                  rows={3}
                                  className="w-full p-3 border border-slate-200 rounded-xl text-xs bg-slate-50 focus:bg-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-100 transition-all font-sans"
                                />
                              </div>
                            </motion.div>
                          </AnimatePresence>

                          {/* Navigation controls inside wizard */}
                          <div className="flex justify-between items-center pt-4 border-t border-slate-100 mt-2">
                            <button
                              type="button"
                              onClick={() => {
                                if (currentQuestionIndex > 0) {
                                  setCurrentQuestionIndex(currentQuestionIndex - 1);
                                  setCustomAnswer(clarificationQuestions[currentQuestionIndex - 1].userAnswer || "");
                                } else {
                                  setShowClarificationWizard(false);
                                }
                              }}
                              className="px-5 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl text-xs font-bold text-slate-600 transition-colors"
                            >
                              {currentQuestionIndex > 0 ? "上一题" : "返回上传"}
                            </button>

                            <button
                              type="button"
                              onClick={async () => {
                                if (currentQuestionIndex < clarificationQuestions.length - 1) {
                                  setCurrentQuestionIndex(currentQuestionIndex + 1);
                                  setCustomAnswer(clarificationQuestions[currentQuestionIndex + 1].userAnswer || "");
                                } else {
                                  // Last question, submit all!
                                  await handleSubmitClarificationAnswers();
                                }
                              }}
                              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 rounded-xl text-xs font-bold text-white transition-all shadow-sm"
                            >
                              {currentQuestionIndex < clarificationQuestions.length - 1 ? "下一题" : "提交补充，深度匹配"}
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                        {/* Left small card: Active Context Target Role */}
                        <div className="col-span-1 lg:col-span-4 flex flex-col gap-6">
                      <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm">
                        <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wider mb-4 pb-3 border-b border-slate-100">Target Role Context</h3>
                        <div className="flex flex-col gap-4">
                          <div>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">意向目标岗位</span>
                            <span className="text-sm font-semibold text-slate-800">{currentTask.targetRole}</span>
                          </div>
                          <div>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">分析行业及城市</span>
                            <span className="text-sm font-semibold text-slate-800">{currentTask.industry} | {currentTask.location}</span>
                          </div>
                          <div>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">检索JD数量</span>
                            <span className="text-sm font-semibold text-slate-800">{currentTask.report?.jdCount || 25} 篇中文招聘信息</span>
                          </div>
                        </div>
                      </div>

                      {/* Benefits helper info */}
                      <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm">
                        <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wider mb-4 pb-3 border-b border-slate-100">Why Upload? (比对价值)</h3>
                        <div className="flex flex-col gap-4">
                          <div className="flex gap-3">
                            <CheckCircle2 className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                            <div>
                              <h4 className="text-xs font-bold text-slate-800">100% 对齐真实用工标准</h4>
                              <p className="text-[11px] text-slate-500 leading-relaxed mt-1">不是生硬套用词藻，而是深入对比招聘信息中的高管掌控力。找到简历无法被大厂HR筛选发现的深层短板。</p>
                            </div>
                          </div>
                          <div className="flex gap-3">
                            <CheckCircle2 className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                            <div>
                              <h4 className="text-xs font-bold text-slate-800">精细度前沿高频词推荐</h4>
                              <p className="text-[11px] text-slate-500 leading-relaxed mt-1">智能分析大模型微调、Agent工程、商业ROI指标在大厂ATS筛选系统中的最优堆叠配比。</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Right core: Upload & text area inputs */}
                    <div className="col-span-1 lg:col-span-8 flex flex-col gap-6">
                      
                      {/* Interactive Drag & Drop Box */}
                      <div 
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center text-center transition-all bg-white cursor-pointer group min-h-[220px] ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-slate-300 hover:border-blue-500 hover:bg-slate-50'}`}
                      >
                        <div className="w-14 h-14 rounded-full bg-blue-50 group-hover:scale-105 transition-transform flex items-center justify-center text-blue-600 mb-4">
                          <UploadCloud className="w-7 h-7" />
                        </div>
                        {resumeFileName ? (
                          <div>
                            <h4 className="font-bold text-slate-900 text-sm">{resumeFileName}</h4>
                            <p className="text-xs text-slate-500 mt-1">文件成功载入！您可以继续在下方编辑或直接开始分析。</p>
                          </div>
                        ) : (
                          <div>
                            <h4 className="font-bold text-slate-900 text-sm">拖拽本地简历文件到此处，或点击浏览文件</h4>
                            <p className="text-xs text-slate-500 mt-1">支持常见 PDF、Word(.docx)、纯文本(.txt) 格式。文件解析无延迟且脱敏安全。</p>
                          </div>
                        )}
                        <input 
                          type="file" 
                          id="file-upload-input"
                          className="hidden" 
                          accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                          onChange={(e) => {
                            if (e.target.files && e.target.files[0]) {
                              parseAndSetFile(e.target.files[0]);
                            }
                          }}
                        />
                        <button 
                          onClick={() => document.getElementById("file-upload-input")?.click()}
                          className="mt-4 px-5 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-800 rounded-lg text-xs font-bold transition-all shadow-sm"
                        >
                          浏览文件
                        </button>
                      </div>

                      {/* Raw resume text input field */}
                      <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm">
                        <div className="flex justify-between items-center mb-4 pb-3 border-b border-slate-100">
                          <label className="font-bold text-slate-900 text-sm uppercase tracking-wider">直接粘贴/输入您的简历文本 (备选输入)</label>
                          <button 
                            onClick={loadQuickSampleResume}
                            className="text-xs text-blue-600 font-bold hover:underline flex items-center gap-1"
                          >
                            <Sparkles className="w-3.5 h-3.5 text-blue-500 animate-pulse" />
                            <span>加载高管求职简历样例测试</span>
                          </button>
                        </div>
                        <textarea 
                          value={resumeText}
                          onChange={(e) => setResumeText(e.target.value)}
                          placeholder="在此处复制粘贴您的个人求职简历，或通过加载上方「张建国」高管简历样例进行一键智能体验..."
                          rows={10}
                          className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 text-sm placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:bg-white focus:ring-1 focus:ring-blue-100 font-sans transition-all"
                        />
                      </div>

                      {/* Launch analysis button block */}
                      <div className="flex justify-end gap-3 mt-2">
                        <button 
                          onClick={() => {
                            const updatedTasks = tasks.map(t => {
                              if (t.id === currentTask.id) {
                                return { ...t, status: 'researched' as const };
                              }
                              return t;
                            });
                            saveTasks(updatedTasks);
                          }}
                          className="px-6 py-3 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all"
                        >
                          返回画像
                        </button>
                        <button 
                          onClick={handleMatchResume}
                          disabled={!resumeText.trim()}
                          className={`px-8 py-3 rounded-xl text-xs font-bold text-white transition-all shadow-sm flex items-center gap-2 ${resumeText.trim() ? 'bg-blue-600 hover:bg-blue-700' : 'bg-slate-300 cursor-not-allowed'}`}
                        >
                          <span>分析简历匹配度</span>
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>

                    </div>
                    </div>
                    )}
                  </motion.div>
                )}

                {activeTab === 'matched' && currentTask.matchReport && (
                  
                  /* TAB 4: Match Score Details & Teaser */
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col gap-6"
                  >
                    
                    {/* Score & Strengths/Gaps Grid */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                      
                      {/* Overall match circular score */}
                      <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm flex flex-col items-center justify-center">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block w-full text-left mb-6">Overall Match (综合契合度)</span>
                        
                        <div className="relative w-48 h-48 flex items-center justify-center">
                          {/* SVG Circular progress */}
                          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                            <circle cx="50" cy="50" r="45" fill="none" stroke="#f1f5f9" strokeWidth="8" />
                            <motion.circle 
                              cx="50" 
                              cy="50" 
                              r="45" 
                              fill="none" 
                              stroke="#10b981" 
                              strokeWidth="8"
                              strokeDasharray="282.7"
                              initial={{ strokeDashoffset: 282.7 }}
                              animate={{ strokeDashoffset: 282.7 - (282.7 * currentTask.matchReport.matchScore) / 100 }}
                              transition={{ duration: 1.2, ease: "easeOut" }}
                            />
                          </svg>
                          <div className="absolute flex flex-col items-center justify-center">
                            <span className="text-4xl font-extrabold text-slate-900">{currentTask.matchReport.matchScore}</span>
                            <span className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-0.5">/ 100分</span>
                          </div>
                        </div>

                        <p className="mt-6 text-xs text-slate-500 text-center leading-relaxed">
                          综合对标AI大模型在中文高阶岗位中的用工偏好：<strong className="text-slate-800">
                            {currentTask.matchReport.matchScore >= 70 ? "基础实力非常扎实，急需进行总监职级维度的语言靶向精修。" : "简历倾向执行层动作，缺乏高级架构管理及商业数据印证。"}
                          </strong>
                        </p>
                      </div>

                      {/* Strengths & Gaps */}
                      <div className="lg:col-span-2 flex flex-col gap-6">
                        
                        {/* Key Strengths list */}
                        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                          <div className="px-6 py-3.5 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
                            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                            <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider">Key Strengths (简历核心优势)</h3>
                          </div>
                          <div className="p-6 flex flex-col gap-4">
                            {currentTask.matchReport.strengths.map((str, idx) => (
                              <div key={idx} className="flex gap-3 items-start">
                                <ChevronRight className="w-4 h-4 text-emerald-500 shrink-0 mt-1" />
                                <div>
                                  <h4 className="text-sm font-bold text-slate-800 leading-none">{str.title}</h4>
                                  <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">{str.detail}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Critical Gaps list */}
                        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                          <div className="px-6 py-3.5 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <AlertCircle className="w-5 h-5 text-rose-500" />
                              <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider text-rose-600">Critical Gaps (核心差距短板)</h3>
                            </div>
                            <span className="bg-rose-50 text-rose-600 text-[10px] font-bold px-2 py-0.5 rounded-full">3 个高级缺陷</span>
                          </div>
                          <div className="p-6 flex flex-col gap-4">
                            {currentTask.matchReport.gaps.map((gap, idx) => (
                              <div key={idx} className="flex gap-3 items-start">
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0 mt-2"></span>
                                <div>
                                  <h4 className="text-sm font-bold text-slate-800 leading-none">{gap.title}</h4>
                                  <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">{gap.detail}</p>
                                </div>
                              </div>
                            ))}

                            {/* Blurred locked Gaps teaser block */}
                            <div className="relative border-t border-dashed border-slate-100 mt-2 pt-4">
                              <div className="absolute inset-0 backdrop-blur-[2.5px] bg-white/70 z-10 flex items-center justify-center">
                                <button 
                                  onClick={() => {
                                    const updatedTasks = tasks.map(t => {
                                      if (t.id === currentTask.id) {
                                        return { ...t, status: 'upgraded' as const };
                                      }
                                      return t;
                                    });
                                    saveTasks(updatedTasks);
                                  }}
                                  className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-4 py-2 rounded-lg shadow-md transition-all flex items-center gap-2"
                                >
                                  <Lock className="w-3.5 h-3.5 text-blue-400" />
                                  <span>付费解锁额外 {currentTask.matchReport.additionalGapsCount} 项深度缺陷清单</span>
                                </button>
                              </div>

                              <div className="opacity-20 blur-[2px] pointer-events-none select-none flex flex-col gap-3">
                                <div className="flex gap-3">
                                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 mt-1.5"></span>
                                  <div>
                                    <h4 className="text-xs font-bold text-slate-800">海外研发机构敏捷迭代细节缺失</h4>
                                    <p className="text-[10px] text-slate-400 mt-0.5">对标高频率的大模型API整合交付，您的简历没有写出针对数据出海合规细节的要求...</p>
                                  </div>
                                </div>
                                <div className="flex gap-3">
                                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 mt-1.5"></span>
                                  <div>
                                    <h4 className="text-xs font-bold text-slate-800">对标企业级大客户财务P&L预算掌控</h4>
                                    <p className="text-[10px] text-slate-400 mt-0.5">高阶VP岗一般直接对预算负责，原有简历中几乎没有任何大模型商业算力购买或自研预算规划指标的呈现...</p>
                                  </div>
                                </div>
                              </div>
                            </div>

                          </div>
                        </div>

                      </div>
                    </div>

                    {/* Keyword density coverage section */}
                    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                      <div className="px-6 py-3.5 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-blue-600" />
                        <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider">Keyword Density & Coverage (大厂筛选高频关键词覆盖评估)</h3>
                      </div>
                      <div className="p-6">
                        <div className="flex flex-wrap gap-x-2 gap-y-3">
                          {currentTask.matchReport.matchedKeywords.map((tag, idx) => (
                            <span key={idx} className="px-3 py-1 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs font-mono font-semibold flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                              {tag}
                            </span>
                          ))}
                          {currentTask.matchReport.missingKeywords.map((tag, idx) => (
                            <span key={idx} className="px-3 py-1 bg-rose-50 border border-rose-200 border-dashed text-rose-800 rounded-lg text-xs font-mono font-semibold flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
                              {tag} (未提及)
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* BLOCKED FULL UPGRADE CTA PANEL */}
                    <div className="bg-slate-900 border border-slate-800 p-8 rounded-2xl text-center flex flex-col items-center justify-center gap-4 shadow-xl mt-2 relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-600 via-indigo-500 to-emerald-400"></div>
                      <Lock className="w-10 h-10 text-blue-400 mb-2" />
                      <h3 className="text-white text-xl font-bold tracking-tight">大模型高管靶向简历优化报告已就绪</h3>
                      <p className="text-slate-400 text-xs max-w-lg leading-relaxed">
                        一键升级，解锁针对「{currentTask.targetRole}」岗位的完整改写方案。智能重构为SAR/STAR模型，高亮大厂高频率筛查词，生成一版可即时投递、在线编辑的高级求职简历，同时解锁Word/PDF一键打包导出权益。
                      </p>
                      <button 
                        onClick={() => {
                          runResumeOptimizationForTask(currentTask.id);
                        }}
                        className="mt-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-8 py-3 rounded-xl text-xs font-bold transition-all shadow-md font-sans flex items-center gap-2 group hover:scale-[1.02] active:scale-[0.98]"
                      >
                        <Sparkles className="w-4 h-4 text-emerald-300 animate-spin" />
                        <span>一键启动大模型高管简历深度重构</span>
                      </button>
                    </div>

                  </motion.div>
                )}



                {activeTab === 'finalized' && currentTask.optimizedResume && (
                  
                  /* TAB 6: Dual Pane Workspace & Interactive PDF/Word Download */
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col gap-6"
                  >
                    
                    {/* Control Action bar - Stacked with full-width wrapping */}
                    <div className="bg-white border border-slate-200 p-5 rounded-2xl flex flex-col gap-4 shadow-sm">
                      <div className="border-b border-slate-100 pb-3">
                        <p className="text-xs text-slate-500 leading-relaxed font-semibold">
                          {t.viewOptimizedResume}
                        </p>
                      </div>

                      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                        {/* Legal confirm Fact Checkbox */}
                        <label className="flex items-center gap-2.5 cursor-pointer border border-slate-200 hover:bg-slate-50 px-4 py-2.5 rounded-xl transition-all self-start">
                          <input 
                            type="checkbox" 
                            checked={isAccurateChecked}
                            onChange={(e) => setIsAccurateChecked(e.target.checked)}
                            className="w-4.5 h-4.5 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                          />
                          <span className="text-xs text-slate-600 font-bold leading-none">{t.resumeFactsConfirm}</span>
                        </label>

                        <div className="flex flex-wrap items-center gap-3">
                          {isEditing ? (
                            <button 
                              onClick={handleSaveEditedResume}
                              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
                            >
                              <Check className="w-4 h-4" />
                              <span>{t.saveChanges}</span>
                            </button>
                          ) : (
                            <button 
                              onClick={() => {
                                setEditedResume(JSON.parse(JSON.stringify(activeRenderResume)));
                                setIsEditing(true);
                              }}
                              className="px-5 py-2.5 border border-blue-600 hover:bg-blue-50 text-blue-700 rounded-xl text-xs font-bold transition-colors shadow-sm flex items-center gap-2"
                            >
                              <Edit className="w-4 h-4 shrink-0" />
                              <span>{t.editResume}</span>
                            </button>
                          )}

                          {/* Export dropdown package */}
                          <div className="relative group">
                            <button className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-2">
                              <Download className="w-4 h-4 shrink-0" />
                              <span>{t.exportResume}</span>
                              <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                            </button>
                            <div className="absolute right-0 top-full pt-1.5 w-52 hidden group-hover:block z-20">
                              <div className="bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden flex flex-col">
                                <button 
                                  onClick={() => handleExportResume('word')}
                                  className="w-full text-left px-4 py-2.5 text-xs text-slate-700 hover:bg-slate-50 font-bold"
                                >
                                  {t.exportWord}
                                </button>
                                <button 
                                  onClick={() => handleExportResume('pdf')}
                                  className="w-full text-left px-4 py-2.5 text-xs text-slate-700 hover:bg-slate-50 font-bold"
                                >
                                  {t.exportPDF}
                                </button>
                                <button 
                                  onClick={handleExportFullPackage}
                                  disabled={isExportingPackage}
                                  className="w-full text-left px-4 py-2.5 text-xs text-blue-700 hover:bg-blue-50 font-extrabold border-t border-slate-100 flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed"
                                >
                                  {isExportingPackage ? (
                                    <span className="w-3.5 h-3.5 rounded-full border-2 border-blue-500 border-t-transparent animate-spin shrink-0" />
                                  ) : (
                                    <Sparkles className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                                  )}
                                  <span>{isExportingPackage ? '打包中...' : '专属求职大礼包 (.zip)'}</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Mobile Workspace Tab Switcher (Only visible on lg:hidden) */}
                    <div className="flex lg:hidden bg-slate-100 p-1.5 rounded-2xl border border-slate-200/60 gap-1.5 shadow-xs mb-4 shrink-0">
                      <button
                        type="button"
                        onClick={() => setMobileWorkspaceTab('copilot')}
                        className={`flex-1 py-2.5 text-xs font-extrabold rounded-xl transition-all flex items-center justify-center gap-2 ${
                          mobileWorkspaceTab === 'copilot'
                            ? 'bg-blue-600 text-white shadow-md shadow-blue-100'
                            : 'text-slate-600 hover:text-slate-900 bg-white/50 hover:bg-white'
                        }`}
                      >
                        <Sparkles className="w-4 h-4 shrink-0" />
                        <span>改写研判助手 (左栏)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setMobileWorkspaceTab('resume')}
                        className={`flex-1 py-2.5 text-xs font-extrabold rounded-xl transition-all flex items-center justify-center gap-2 ${
                          mobileWorkspaceTab === 'resume'
                            ? 'bg-blue-600 text-white shadow-md shadow-blue-100'
                            : 'text-slate-600 hover:text-slate-900 bg-white/50 hover:bg-white'
                        }`}
                      >
                        <FileText className="w-4 h-4 shrink-0" />
                        <span>重构简历预览 (右栏)</span>
                      </button>
                    </div>

                    {/* Dual Pane Layout wrapper */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:h-[700px] h-auto items-stretch">
                      
                      {/* Left Pane: V0.4 Interactive Copilot Panel & Original Resume */}
                      <div className={`col-span-1 lg:col-span-4 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col shadow-sm overflow-hidden h-[500px] lg:h-full min-h-0 ${mobileWorkspaceTab === 'copilot' ? 'flex' : 'hidden lg:flex'}`}>
                        {/* Sub-tab selection bar */}
                        <div className="px-2 py-1.5 bg-slate-100/80 border-b border-slate-200 flex gap-1 shrink-0">
                          <button
                            onClick={() => setFinalizedSubTab('comparison')}
                            className={`flex-1 py-1.5 text-[11px] font-extrabold rounded-lg transition-all flex items-center justify-center gap-1.5 whitespace-nowrap flex-nowrap ${
                              finalizedSubTab === 'comparison'
                                ? 'bg-white text-blue-700 shadow-sm border border-slate-150'
                                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50/50'
                            }`}
                          >
                            <Sparkles className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                            <span className="shrink-0">改写建议对比</span>
                            {rewriteSuggestions.filter(s => !s.versionType || s.versionType === activeVersionType).length > 0 && (
                              <span className="bg-blue-100 text-blue-700 text-[9px] px-1.5 py-0.2 rounded-full font-extrabold shrink-0">
                                {rewriteSuggestions.filter(s => !s.versionType || s.versionType === activeVersionType).length}
                              </span>
                            )}
                          </button>
                          <button
                            onClick={() => setFinalizedSubTab('resume')}
                            className={`flex-1 py-1.5 text-[11px] font-extrabold rounded-lg transition-all flex items-center justify-center gap-1.5 whitespace-nowrap flex-nowrap ${
                              finalizedSubTab === 'resume'
                                ? 'bg-white text-blue-700 shadow-sm border border-slate-150'
                                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50/50'
                            }`}
                          >
                            <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="shrink-0">原简历参考</span>
                          </button>
                        </div>

                        {finalizedSubTab === 'comparison' ? (
                          /* CO-PILOT PANEL */
                          <div className="flex-grow overflow-y-auto min-h-0 h-0 p-4 flex flex-col gap-3.5">
                            <div className="bg-blue-50/50 border border-blue-100/50 p-3 rounded-xl shrink-0">
                              <p className="text-[10px] text-blue-700 font-semibold leading-relaxed">
                                💡 <b>AI 精准采纳助手 ({
                                  activeVersionType === 'executive' ? '高管冲刺专属建议' :
                                  activeVersionType === 'ai_product' ? 'AI 产品业务负责人专属建议' :
                                  '标准投递建议'
                                })：</b> 针对您当前的<b>【{
                                  activeVersionType === 'executive' ? '高管冲刺版' :
                                  activeVersionType === 'ai_product' ? 'AI产品负责人版' :
                                  '标准投递版'
                                }】</b>简历，AI 精准定制了以下差异化改写方案。点击即可一键采纳融入右侧预览！
                              </p>
                            </div>

                            {isLoadingRewrite ? (
                              <div className="flex-grow flex flex-col items-center justify-center py-12 text-slate-400 gap-3">
                                <div className="w-8 h-8 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
                                <span className="text-[10px] font-bold uppercase tracking-widest font-mono">AI 正在调和改写对比...</span>
                              </div>
                            ) : rewriteSuggestions.filter(s => !s.versionType || s.versionType === activeVersionType).length === 0 ? (
                              <div className="text-center py-12 text-xs text-slate-400">
                                暂无该版本的改写建议。
                              </div>
                            ) : (
                              rewriteSuggestions.filter(s => !s.versionType || s.versionType === activeVersionType).map((sugg) => (
                                <div 
                                  key={sugg.id} 
                                  className={`shrink-0 border rounded-xl overflow-hidden bg-white shadow-xs transition-all ${
                                    sugg.status === 'accepted' ? 'border-emerald-200 bg-emerald-50/10' :
                                    sugg.status === 'rejected' ? 'border-slate-200 bg-slate-50/50 opacity-60' :
                                    'border-slate-150 hover:border-slate-200'
                                  }`}
                                >
                                  {/* Suggestions Header */}
                                  <div className="px-3.5 py-2.5 bg-slate-50 border-b border-slate-150 flex justify-between items-center">
                                    <span className="text-[9px] font-bold text-slate-500 bg-slate-200/60 px-1.5 py-0.5 rounded font-mono">
                                      {sugg.sectionType}
                                    </span>
                                    <span className="text-[9px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full font-mono uppercase tracking-wider">
                                      提升：{sugg.impactScore}
                                    </span>
                                  </div>

                                  {/* Body Details */}
                                  <div className="p-3.5 flex flex-col gap-3">
                                    {/* Original Bullet */}
                                    <div className="border-l-2 border-slate-300 pl-2">
                                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">原始简历内容：</p>
                                      <div className="max-h-[85px] overflow-y-auto mt-0.5 pr-1">
                                        <p className="text-[11px] text-slate-500 italic leading-relaxed text-justify">{sugg.originalText}</p>
                                      </div>
                                    </div>

                                    {/* AI Rewritten Bullet */}
                                    <div className="border-l-2 border-blue-500 pl-2 bg-blue-50/10 p-2 rounded">
                                      <p className="text-[10px] font-bold text-blue-500 uppercase tracking-wider mb-1">AI 高冲击力改写：</p>
                                      <div className="max-h-[140px] overflow-y-auto pr-1">
                                        {sugg.status === 'accepted' || sugg.status === 'edited' ? (
                                          <textarea
                                            defaultValue={sugg.rewrittenText}
                                            rows={3}
                                            onBlur={(e) => handleEditRewrite(sugg.id, e.target.value)}
                                            className="w-full text-xs text-slate-800 bg-white border border-slate-200 focus:border-blue-500 focus:outline-none p-1.5 rounded font-sans leading-relaxed resize-none shadow-sm"
                                          />
                                        ) : (
                                          <p className="text-xs text-slate-800 font-medium leading-relaxed text-justify">{sugg.rewrittenText}</p>
                                        )}
                                      </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex items-center gap-1.5 pt-2 border-t border-slate-100/50 mt-1 justify-end">
                                      {sugg.status === 'pending' ? (
                                        <>
                                          <button
                                            onClick={() => handleRejectRewrite(sugg.id)}
                                            className="px-2.5 py-1.5 border border-slate-200 hover:bg-slate-50 rounded-lg text-[10px] font-bold text-slate-500 transition-colors"
                                          >
                                            忽略
                                          </button>
                                          <button
                                            onClick={() => handleRegenerateRewrite(sugg.id, sugg.originalText)}
                                            disabled={isRegeneratingRewriteId === sugg.id}
                                            className="px-2.5 py-1.5 border border-blue-200 hover:bg-blue-50 rounded-lg text-[10px] font-bold text-blue-600 transition-colors flex items-center gap-1 disabled:opacity-55"
                                          >
                                            {isRegeneratingRewriteId === sugg.id ? (
                                              <span className="w-3 h-3 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
                                            ) : (
                                              <RefreshCw className="w-3 h-3" />
                                            )}
                                            <span>AI 重编</span>
                                          </button>
                                          <button
                                            onClick={() => handleAcceptRewrite(sugg.id)}
                                            className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-[10px] font-bold text-white transition-all shadow-xs"
                                          >
                                            采纳到右侧
                                          </button>
                                        </>
                                      ) : sugg.status === 'accepted' || sugg.status === 'edited' ? (
                                        <div className="flex justify-between items-center w-full">
                                          <span className="text-[10px] font-extrabold text-emerald-600 flex items-center gap-1">
                                            <Check className="w-3.5 h-3.5 text-emerald-500" /> 已采纳 (失焦可直接编辑)
                                          </span>
                                          <button
                                            onClick={() => handleUndoRewrite(sugg.id)}
                                            className="text-[10px] font-bold text-slate-400 hover:text-red-500 transition-colors"
                                          >
                                            ↩ 撤销
                                          </button>
                                        </div>
                                      ) : (
                                        <div className="flex justify-between items-center w-full">
                                          <span className="text-[10px] font-semibold text-slate-400">已忽略此建议</span>
                                          <button
                                            onClick={() => {
                                              setRewriteSuggestions(prev => prev.map(item => item.id === sugg.id ? { ...item, status: 'pending' } : item));
                                            }}
                                            className="text-[10px] font-bold text-blue-600 hover:underline"
                                          >
                                            恢复建议
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        ) : (
                          /* ORIGINAL RESUME DISPLAY */
                          <div className="flex-grow overflow-y-auto min-h-0 h-0 p-5 text-slate-500 text-xs leading-relaxed font-sans opacity-70 select-none bg-slate-100">
                            <pre className="whitespace-pre-wrap font-sans">
                              {currentTask.originalResumeText || t.noOriginalText}
                            </pre>
                          </div>
                        )}
                      </div>

                      {/* Right Pane: AI-Optimized resume layout */}
                      <div className={`col-span-1 lg:col-span-8 bg-white border-2 border-blue-500/20 rounded-2xl flex flex-col shadow-lg overflow-hidden relative h-[600px] lg:h-full min-h-0 ${mobileWorkspaceTab === 'resume' ? 'flex' : 'hidden lg:flex'}`}>
                        {/* Decorative AI Glow strip */}
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-600 via-indigo-500 to-emerald-400 z-10"></div>
                        
                        <div className="px-5 py-3 border-b border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
                          <div className="flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-blue-500 animate-pulse shrink-0" />
                            <span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">
                              AI 专属精修版本库
                            </span>
                          </div>
                          
                          {/* Version Tab switcher */}
                          {resumeVersions.length > 0 && (
                            <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 gap-1">
                              {resumeVersions.map((ver) => (
                                <button
                                  key={ver.id}
                                  onClick={() => handleSwitchVersion(ver.id)}
                                  className={`px-3 py-1.5 text-[10px] font-bold rounded-md transition-all ${
                                    currentVersionId === ver.id
                                      ? 'bg-white text-blue-700 shadow-xs'
                                      : 'text-slate-500 hover:text-slate-700'
                                  }`}
                                >
                                  {ver.versionName}
                                </button>
                              ))}
                            </div>
                          )}

                          <span className="bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 border border-emerald-200 font-mono shadow-sm self-start sm:self-auto">
                            <Check className="w-3 h-3 text-emerald-600 animate-pulse" />
                            {(() => {
                              const baseScore = currentTask?.matchReport?.matchScore || 70;
                              const atsScore = Math.min(96, Math.max(85, baseScore + 12));
                              const specialtyScore = Math.min(98, Math.max(88, baseScore + 16));
                              const executiveScore = Math.min(99, Math.max(90, baseScore + 20));

                              if (currentVersionId?.endsWith('executive')) {
                                return `${executiveScore}% EXEC MATCH`;
                              } else if (currentVersionId?.endsWith('ai_product')) {
                                return `${specialtyScore}% AI MATCH`;
                              } else {
                                return `${atsScore}% ATS MATCH`;
                              }
                            })()}
                          </span>
                        </div>

                        {/* Interactive edit layout vs render layout */}
                        {isEditing && editedResume ? (
                          
                          /* Live on-screen Rich editor */
                          <div className="flex-grow overflow-y-auto min-h-0 h-0 p-6 space-y-6">
                            {/* General Information Grid */}
                            <div className="bg-slate-50 border border-slate-150 p-4 rounded-xl space-y-3">
                              <h4 className="text-[11px] font-extrabold text-blue-600 uppercase tracking-wider">{lang === 'zh' ? '基本联系信息' : 'Basic Contact Info'}</h4>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                                <div>
                                  <label className="text-[10px] font-bold text-slate-400 block mb-1">{t.nameLabel}</label>
                                  <input 
                                    type="text" 
                                    value={editedResume.name}
                                    onChange={(e) => setEditedResume({ ...editedResume, name: e.target.value })}
                                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                                  />
                                </div>
                                <div>
                                  <label className="text-[10px] font-bold text-slate-400 block mb-1">{t.targetRoleLabel}</label>
                                  <input 
                                    type="text" 
                                    value={editedResume.title}
                                    onChange={(e) => setEditedResume({ ...editedResume, title: e.target.value })}
                                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                                  />
                                </div>
                                <div>
                                  <label className="text-[10px] font-bold text-slate-400 block mb-1">{t.emailLabel}</label>
                                  <input 
                                    type="text" 
                                    value={editedResume.email}
                                    onChange={(e) => setEditedResume({ ...editedResume, email: e.target.value })}
                                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                                  />
                                </div>
                                <div>
                                  <label className="text-[10px] font-bold text-slate-400 block mb-1">{t.cityLabel}</label>
                                  <input 
                                    type="text" 
                                    value={editedResume.location}
                                    onChange={(e) => setEditedResume({ ...editedResume, location: e.target.value })}
                                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                                  />
                                </div>
                                <div className="md:col-span-2">
                                  <label className="text-[10px] font-bold text-slate-400 block mb-1">{t.linkedinLabel}</label>
                                  <input 
                                    type="text" 
                                    value={editedResume.linkedin || ""}
                                    placeholder={lang === 'zh' ? '如: linkedin.com/in/executive-pro' : 'e.g., linkedin.com/in/executive-pro'}
                                    onChange={(e) => setEditedResume({ ...editedResume, linkedin: e.target.value })}
                                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                                  />
                                </div>
                              </div>
                            </div>

                            {/* Summary Section */}
                            <div className="bg-slate-50 border border-slate-150 p-4 rounded-xl space-y-2">
                              <h4 className="text-[11px] font-extrabold text-blue-600 uppercase tracking-wider">{t.summaryLabel}</h4>
                              <div>
                                <textarea 
                                  value={editedResume.summary}
                                  onChange={(e) => setEditedResume({ ...editedResume, summary: e.target.value })}
                                  rows={4}
                                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 leading-relaxed focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                                />
                              </div>
                            </div>

                            {/* Core Capabilities */}
                            <div className="bg-slate-50 border border-slate-150 p-4 rounded-xl space-y-3.5">
                              <h4 className="text-[11px] font-extrabold text-blue-600 uppercase tracking-wider">{lang === 'zh' ? '高管核心能力标签' : 'Core Executive Capabilities'}</h4>
                              <div className="space-y-2">
                                {editedResume.coreCapabilities.map((cap, idx) => (
                                  <div key={idx} className="flex gap-2 items-center">
                                    <span className="text-[10px] text-slate-400 font-mono w-5 shrink-0">#{idx + 1}</span>
                                    <input
                                      type="text"
                                      value={cap}
                                      onChange={(e) => {
                                        const newCaps = [...editedResume.coreCapabilities];
                                        newCaps[idx] = e.target.value;
                                        setEditedResume({ ...editedResume, coreCapabilities: newCaps });
                                      }}
                                      className="flex-grow px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const newCaps = editedResume.coreCapabilities.filter((_, i) => i !== idx);
                                        setEditedResume({ ...editedResume, coreCapabilities: newCaps });
                                      }}
                                      className="text-slate-400 hover:text-rose-600 transition-colors p-1"
                                      title={lang === 'zh' ? '删除' : 'Delete'}
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                ))}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditedResume({ ...editedResume, coreCapabilities: [...editedResume.coreCapabilities, ''] });
                                  }}
                                  className="text-xs text-blue-600 hover:text-blue-700 font-bold flex items-center gap-1 mt-1.5"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                  {lang === 'zh' ? '添加能力项' : 'Add Capability'}
                                </button>
                              </div>
                            </div>

                            {/* Work Experience with Bullets and Suggestions */}
                            <div className="bg-slate-50 border border-slate-150 p-4 rounded-xl space-y-4">
                              <div className="flex justify-between items-center">
                                <h4 className="text-[11px] font-extrabold text-blue-600 uppercase tracking-wider">{t.workExperienceLabel}</h4>
                                <span className="text-[10px] text-amber-600 font-bold bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full">
                                  {lang === 'zh' ? '💡 支持修改参考句式且保留 xxx 待填项' : '💡 Supports direct suggestion text replacement'}
                                </span>
                              </div>
                              
                              <div className="space-y-6">
                                {editedResume.experience.map((exp, expIdx) => (
                                  <div key={expIdx} className="p-4 bg-white border border-slate-200 rounded-xl space-y-4 relative shadow-sm">
                                    <div className="absolute top-3 right-3 flex items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const newExp = editedResume.experience.filter((_, i) => i !== expIdx);
                                          setEditedResume({ ...editedResume, experience: newExp });
                                        }}
                                        className="text-slate-400 hover:text-rose-600 transition-colors p-1"
                                        title={lang === 'zh' ? '删除此段履历' : 'Delete Work Experience'}
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                      <div>
                                        <label className="text-[9px] font-bold text-slate-400 block mb-1">{lang === 'zh' ? '公司/企业名称' : 'Company'}</label>
                                        <input
                                          type="text"
                                          value={exp.company}
                                          onChange={(e) => {
                                            const newExp = [...editedResume.experience];
                                            newExp[expIdx].company = e.target.value;
                                            setEditedResume({ ...editedResume, experience: newExp });
                                          }}
                                          className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800"
                                        />
                                      </div>
                                      <div>
                                        <label className="text-[9px] font-bold text-slate-400 block mb-1">{lang === 'zh' ? '高管岗位职位' : 'Executive Role'}</label>
                                        <input
                                          type="text"
                                          value={exp.role}
                                          onChange={(e) => {
                                            const newExp = [...editedResume.experience];
                                            newExp[expIdx].role = e.target.value;
                                            setEditedResume({ ...editedResume, experience: newExp });
                                          }}
                                          className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800"
                                        />
                                      </div>
                                      <div>
                                        <label className="text-[9px] font-bold text-slate-400 block mb-1">{lang === 'zh' ? '任职历时阶段' : 'Tenure Duration'}</label>
                                        <input
                                          type="text"
                                          value={exp.duration}
                                          onChange={(e) => {
                                            const newExp = [...editedResume.experience];
                                            newExp[expIdx].duration = e.target.value;
                                            setEditedResume({ ...editedResume, experience: newExp });
                                          }}
                                          className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800"
                                        />
                                      </div>
                                    </div>

                                    {/* Bullets detailed list */}
                                    <div className="space-y-4 pt-2 border-t border-slate-100">
                                      <label className="text-[9px] font-bold text-slate-400 block">{lang === 'zh' ? '优化后履历描述 (逐条微调/采纳建议)' : 'Optimized Bullet Points'}</label>
                                      {exp.bullets.map((bullet, bulletIdx) => {
                                        const refText = extractReference(bullet);
                                        return (
                                          <div key={bulletIdx} className="space-y-1.5">
                                            <div className="flex gap-2 items-start">
                                              <span className="text-[10px] text-slate-400 font-mono mt-2 shrink-0">{bulletIdx + 1}.</span>
                                              <textarea
                                                value={bullet}
                                                rows={3}
                                                onChange={(e) => {
                                                  const newExp = [...editedResume.experience];
                                                  newExp[expIdx].bullets[bulletIdx] = e.target.value;
                                                  setEditedResume({ ...editedResume, experience: newExp });
                                                }}
                                                className="flex-grow px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 leading-relaxed focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                                              />
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  const newExp = [...editedResume.experience];
                                                  newExp[expIdx].bullets = exp.bullets.filter((_, i) => i !== bulletIdx);
                                                  setEditedResume({ ...editedResume, experience: newExp });
                                                }}
                                                className="text-slate-400 hover:text-rose-600 transition-colors p-1 mt-1 shrink-0"
                                                title={lang === 'zh' ? '删除此条' : 'Delete Bullet'}
                                              >
                                                <Trash2 className="w-3.5 h-3.5" />
                                              </button>
                                            </div>

                                            {/* Smart reference-adoption template block */}
                                            {refText && (
                                              <div className="pl-5">
                                                <div className="p-2.5 bg-blue-50/80 border border-blue-100 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-inner">
                                                  <div className="text-[11px] text-blue-700 font-medium leading-relaxed">
                                                    <span className="font-extrabold text-blue-800 flex items-center gap-1 mb-0.5">
                                                      <Sparkles className="w-3 h-3 text-blue-600" />
                                                      {lang === 'zh' ? '✨ 建议具体参考句式：' : '✨ Actionable Reference Statement:'}
                                                    </span>
                                                    <span className="bg-white/95 px-1.5 py-0.5 rounded border border-blue-200 font-mono text-slate-800 select-all font-semibold block mt-1">
                                                      {refText}
                                                    </span>
                                                  </div>
                                                  <button
                                                    type="button"
                                                    onClick={() => {
                                                      const updatedBullet = bullet.replace(/【建议补充：[^】]+】/g, refText);
                                                      const newExp = [...editedResume.experience];
                                                      newExp[expIdx].bullets[bulletIdx] = updatedBullet;
                                                      setEditedResume({ ...editedResume, experience: newExp });
                                                      triggerToast(lang === 'zh' ? "🎉 已成功替换，请在输入框内将 xxx 手动改为您的真实数字！" : "🎉 Replaced! Please modify the 'xxx' numbers manually inside the editor.");
                                                    }}
                                                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold rounded-lg transition-colors shrink-0 flex items-center gap-1 shadow-sm hover:shadow active:scale-95"
                                                  >
                                                    <Sparkles className="w-3.5 h-3.5" />
                                                    {lang === 'zh' ? '一键采纳参考内容' : 'Adopt Statement'}
                                                  </button>
                                                </div>
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })}

                                      <button
                                        type="button"
                                        onClick={() => {
                                          const newExp = [...editedResume.experience];
                                          newExp[expIdx].bullets = [...exp.bullets, ''];
                                          setEditedResume({ ...editedResume, experience: newExp });
                                        }}
                                        className="text-xs text-blue-600 hover:text-blue-700 font-bold flex items-center gap-1 mt-1 pl-5"
                                      >
                                        <Plus className="w-3.5 h-3.5" />
                                        {lang === 'zh' ? '新增一条经历描述' : 'Add Bullet Point'}
                                      </button>
                                    </div>
                                  </div>
                                ))}

                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditedResume({
                                      ...editedResume,
                                      experience: [
                                        ...editedResume.experience,
                                        { company: '', role: '', duration: '', bullets: [''] }
                                      ]
                                    });
                                  }}
                                  className="text-xs text-blue-600 hover:text-blue-700 font-bold flex items-center gap-1.5 p-3 border border-dashed border-blue-200 rounded-xl bg-blue-50/10 hover:bg-blue-50/30 w-full justify-center transition-all"
                                >
                                  <Plus className="w-4 h-4" />
                                  {lang === 'zh' ? '添加新的工作经历' : 'Add Work Experience'}
                                </button>
                              </div>
                            </div>

                            {/* Education Details */}
                            <div className="bg-slate-50 border border-slate-150 p-4 rounded-xl space-y-2">
                              <h4 className="text-[11px] font-extrabold text-blue-600 uppercase tracking-wider">{t.educationLabel}</h4>
                              <input 
                                type="text" 
                                value={editedResume.education}
                                onChange={(e) => setEditedResume({ ...editedResume, education: e.target.value })}
                                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                              />
                            </div>

                            {/* Skills & Keywords */}
                            <div className="bg-slate-50 border border-slate-150 p-4 rounded-xl space-y-2">
                              <h4 className="text-[11px] font-extrabold text-blue-600 uppercase tracking-wider">{lang === 'zh' ? '核心专业技能与高频关键词' : 'Technical Skills & High-frequency Keywords'}</h4>
                              <textarea
                                value={editedResume.skills.join(', ')}
                                onChange={(e) => {
                                  // split by either half-width or full-width comma
                                  const list = e.target.value.split(/[,，]\s*/);
                                  setEditedResume({ ...editedResume, skills: list });
                                }}
                                rows={3}
                                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 leading-relaxed focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                                placeholder={lang === 'zh' ? '输入您的核心技能，使用逗号分隔' : 'Enter skills separated by commas'}
                              />
                              <p className="text-[10px] text-slate-400">
                                {lang === 'zh' ? '提示：直接输入技能词，使用逗号隔开，系统会自动为您解析为精美高宽标签排版。' : 'Tip: Separate skill words with commas, the system will render them as chips automatically.'}
                              </p>
                            </div>
                          </div>

                        ) : (
                          
                          /* Premium high-end PDF resume rendered view */
                          <div className="flex-grow overflow-y-auto min-h-0 h-0 p-8 bg-white selection:bg-blue-100 selection:text-blue-900 leading-relaxed font-sans text-slate-800">
                            {activeRenderResume && (
                              <div className="max-w-[720px] mx-auto">
                                
                                {/* Resume Header */}
                                <header className="border-b-2 border-blue-600 pb-5 mb-6 text-left">
                                  <h1 className="text-3xl font-extrabold text-slate-900 leading-tight">
                                    {activeRenderResume.name}
                                  </h1>
                                  <p className="text-blue-600 font-bold text-sm uppercase tracking-wider mt-1">{activeRenderResume.title}</p>
                                  <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3 text-xs text-slate-500 font-semibold font-mono">
                                    <span>{activeRenderResume.email}</span>
                                    <span>•</span>
                                    <span>{activeRenderResume.location}</span>
                                    {activeRenderResume.linkedin && (
                                      <>
                                        <span>•</span>
                                        <span>{activeRenderResume.linkedin}</span>
                                      </>
                                    )}
                                  </div>
                                </header>

                                {/* Executive Summary */}
                                <section className="mb-6">
                                  <h3 className="text-xs uppercase font-extrabold tracking-widest text-slate-900 border-b border-slate-200 pb-1.5 mb-3">Professional Summary</h3>
                                  <p className="text-xs text-slate-600 leading-relaxed text-justify">
                                    {activeRenderResume.summary}
                                  </p>
                                </section>

                                {/* Core Capabilities */}
                                <section className="mb-6">
                                  <h3 className="text-xs uppercase font-extrabold tracking-widest text-slate-900 border-b border-slate-200 pb-1.5 mb-3">Core Capabilities</h3>
                                  <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs font-semibold text-slate-700">
                                    {activeRenderResume.coreCapabilities.map((cap, idx) => (
                                      <div key={idx} className="flex gap-2 items-center">
                                        <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
                                        <span>{cap}</span>
                                      </div>
                                    ))}
                                  </div>
                                </section>

                                {/* Work Experience */}
                                <section className="mb-6">
                                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900 border-b border-slate-200 pb-1.5 mb-4">Work Experience ({t.workExperienceLabel})</h2>
                                  
                                  <div className="flex flex-col gap-5">
                                    {activeRenderResume.experience.map((exp, idx) => (
                                      <div key={idx} className="relative group">
                                        <div className="flex justify-between items-baseline mb-2">
                                          <h4 className="text-xs font-extrabold text-slate-800">
                                            {exp.company} <span className="font-normal text-slate-400 mx-1.5">|</span> <span className="text-slate-600 text-[11px]">{exp.role}</span>
                                          </h4>
                                          <span className="text-[10px] font-mono font-bold text-slate-400">{exp.duration}</span>
                                        </div>
                                        <ul className="list-disc pl-4 space-y-2 text-xs text-slate-600">
                                          {exp.bullets.map((bullet, i) => {
                                            // Highlight metrics or placeholder tags in optimized resume
                                            const highlighted = bullet.replace(
                                              /(【建议补充：[^】]+】)/g,
                                              `<span class="bg-rose-50 border border-rose-200 text-rose-700 font-bold px-1.5 py-0.5 rounded text-[10px] uppercase font-mono tracking-wider">$1</span>`
                                            );
                                            return (
                                              <li key={i} dangerouslySetInnerHTML={{ __html: highlighted }} />
                                            );
                                          })}
                                        </ul>
                                      </div>
                                    ))}
                                  </div>
                                </section>

                                {/* Education */}
                                <section className="mb-6">
                                  <h3 className="text-xs uppercase font-extrabold tracking-widest text-slate-900 border-b border-slate-200 pb-1.5 mb-3">Education</h3>
                                  <p className="text-xs font-semibold text-slate-600">{activeRenderResume.education}</p>
                                </section>

                                {/* Key Skills */}
                                <section>
                                  <h3 className="text-xs uppercase font-extrabold tracking-widest text-slate-900 border-b border-slate-200 pb-1.5 mb-3">Skills & Keywords</h3>
                                  <div className="flex flex-wrap gap-1.5">
                                    {activeRenderResume.skills.map((skill, idx) => (
                                      <span key={idx} className="px-2 py-0.5 bg-slate-100 border border-slate-200 text-slate-600 rounded text-[10px] font-mono font-medium">
                                        {skill}
                                      </span>
                                    ))}
                                  </div>
                                </section>

                              </div>
                            )}
                          </div>
                        )}

                      </div>

                    </div>

                    {/* Customer Feedback Module */}
                    <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl text-white mt-4 shadow-xl">
                      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-800">
                        <MessageSquare className="w-5 h-5 text-blue-400" />
                        <h3 className="font-extrabold text-sm uppercase tracking-widest text-white">
                          尊贵客户交付满意度及改进反馈
                        </h3>
                      </div>
                      <p className="text-xs text-slate-400 mb-4 leading-relaxed">
                        您对此次高管匹配优化服务的评价对我们极其重要。请留下您的真实评级与宝贵建议，直接同步给高管服务专家委员会。
                      </p>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 block mb-1.5 uppercase tracking-wider">
                            总体服务满意度评分
                          </label>
                          <div className="flex gap-2.5">
                            {[1, 2, 3, 4, 5].map((stars) => (
                              <button
                                key={stars}
                                onClick={() => setFeedbackRating(stars)}
                                className={`text-2xl transition-all hover:scale-110 ${
                                  feedbackRating >= stars ? 'text-amber-400' : 'text-slate-700'
                                }`}
                              >
                                ★
                              </button>
                            ))}
                          </div>
                        </div>

                        <div>
                          <label className="text-[10px] font-bold text-slate-400 block mb-1.5 uppercase tracking-wider">
                            您的具体建议（如对改写措辞、匹配维度的修正）
                          </label>
                          <textarea
                            value={feedbackText}
                            onChange={(e) => setFeedbackText(e.target.value)}
                            placeholder="请填写您的反馈，专家委员会将据此调整后继模型的推荐权重..."
                            className="w-full text-xs text-white bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 h-20 focus:outline-none focus:border-blue-500 font-sans leading-relaxed resize-none"
                          />
                        </div>
                      </div>

                      <div className="flex justify-end gap-3 border-t border-slate-850 pt-4 mt-4">
                        <button
                          onClick={handleSubmitFeedback}
                          disabled={feedbackRating === 0}
                          className={`px-6 py-2.5 rounded-xl text-xs font-bold transition-all ${
                            feedbackRating > 0
                              ? 'bg-blue-600 hover:bg-blue-700 text-white'
                              : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                          }`}
                        >
                          提交专家委员会审核
                        </button>
                      </div>
                    </div>

                  </motion.div>
                )}

              </div>
            )}

          </div>

          {/* Simple Global Footer component */}
          <footer className="w-full shrink-0 py-6 border-t border-slate-200 flex flex-col md:flex-row justify-between items-center gap-4 mt-12 bg-white px-6 md:px-10 rounded-2xl shadow-sm">
            <div className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
              © 2026 CareerAI Executive Search. All rights reserved.
            </div>
            <div className="flex gap-6 text-xs text-slate-500 font-semibold">
              <a href="/terms" className="hover:text-blue-600 transition-colors">Terms of Service</a>
              <a href="/privacy" className="hover:text-blue-600 transition-colors">Privacy Policy</a>
              <button onClick={handleCheckApiStatus} className="hover:text-blue-600 transition-colors">API Status</button>
            </div>
          </footer>

        </main>

        {/* Floating Interactive History list drawer */}
        <AnimatePresence>
          {showHistoryDropdown && (
            <motion.div 
              initial={{ opacity: 0, x: 100 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 80 }}
              className="fixed right-0 top-16 bottom-0 w-80 bg-white border-l border-slate-200 shadow-2xl z-40 p-6 flex flex-col overflow-hidden"
            >
              <div className="flex justify-between items-center mb-6 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <History className="w-5 h-5 text-slate-500" />
                  <h3 className="font-extrabold text-sm text-slate-900 uppercase tracking-widest">{t.historySearch}</h3>
                </div>
                <button 
                  onClick={() => setShowHistoryDrawer(false)}
                  className="text-xs font-bold text-slate-400 hover:text-slate-600"
                >
                  {t.collapse}
                </button>
              </div>

              {tasks.length === 0 ? (
                <div className="flex-grow flex flex-col items-center justify-center text-center p-4">
                  <AlertCircle className="w-10 h-10 text-slate-300 mb-2" />
                  <p className="text-slate-400 text-xs font-medium">{t.noHistory}</p>
                </div>
              ) : (
                <div className="flex-grow overflow-y-auto flex flex-col gap-3 pr-1">
                  {tasks.map((task) => (
                    <div 
                      key={task.id}
                      onClick={() => {
                        setCurrentTaskId(task.id);
                        setShowHistoryDrawer(false);
                      }}
                      className={`p-4 rounded-xl border transition-all text-left cursor-pointer group relative ${currentTaskId === task.id ? 'border-blue-500 bg-blue-50/50' : 'border-slate-200 hover:bg-slate-50'}`}
                    >
                      <button 
                        onClick={(e) => handleDeleteTask(task.id, e)}
                        className="absolute top-2 right-2 p-1 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>

                      <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">{task.createdAt}</div>
                      <h4 className="text-xs font-bold text-slate-900 truncate pr-6">{task.targetRole}</h4>
                      <p className="text-[10px] text-slate-500 mt-1">{task.industry} | {task.location}</p>
                      
                      <div className="flex items-center gap-2 mt-3 pt-2.5 border-t border-slate-100">
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${task.status === 'finalized' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'}`}>
                          {task.status === 'researched' && t.pillResearched}
                          {task.status === 'matching' && t.pillMatching}
                          {task.status === 'matched' && t.pillMatched}
                          {task.status === 'upgraded' && t.pillUpgraded}
                          {task.status === 'finalized' && t.pillFinalized}
                        </span>
                        {task.matchReport && (
                          <span className="text-[10px] font-mono text-slate-400 ml-auto">{lang === 'zh' ? '评分' : 'Score'} {task.matchReport.matchScore}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Paywall Checkout QR Code Overlay Modal */}
        <AnimatePresence>
          {showQRModal && currentTask && checkoutUrl && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="bg-white border border-slate-200 w-full max-w-sm rounded-2xl shadow-2xl p-6 relative overflow-hidden"
              >
                {/* Decorative payment brand strip */}
                <div className={`absolute top-0 left-0 w-full h-1.5 transition-colors duration-300 ${paymentMethod === 'wechat' ? 'bg-emerald-500' : 'bg-sky-500'}`}></div>

                <div className="text-center mb-5">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[9px] font-bold px-2 py-0.5 rounded-full font-mono tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-100">
                      {lang === 'zh' ? '安全智能收银台' : 'SECURE CHECKOUT'}
                    </span>
                    <span className={`text-[10px] font-bold uppercase tracking-wider font-mono px-2 py-0.5 rounded ${paymentMethod === 'wechat' ? 'text-emerald-600 bg-emerald-50' : 'text-sky-600 bg-sky-50'}`}>
                      {paymentMethod === 'wechat' ? 'WeChat Pay' : 'Alipay'}
                    </span>
                  </div>
                  <h3 className="font-bold text-slate-900 text-base">{t.stripePayTitle}</h3>
                  <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">{t.stripePayInstructions}</p>
                </div>

                {/* Real-time Generated QR Code Box with custom brand borders */}
                <div className={`bg-slate-50 border-2 w-48 h-48 mx-auto rounded-2xl shadow-inner flex flex-col items-center justify-center p-3 relative mb-4 transition-colors duration-300 ${paymentMethod === 'wechat' ? 'border-emerald-200 bg-emerald-50/20' : 'border-sky-200 bg-sky-50/20'}`}>
                  <img 
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(checkoutUrl)}`}
                    alt="Checkout QR Code"
                    className="w-40 h-40 object-contain rounded-lg shadow-sm"
                    referrerPolicy="no-referrer"
                  />
                </div>

                {/* Open in a new window link */}
                <div className="text-center mb-4">
                  <a 
                    href={checkoutUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`inline-flex items-center gap-1.5 text-xs font-bold underline transition-colors ${paymentMethod === 'wechat' ? 'text-emerald-600 hover:text-emerald-700' : 'text-sky-600 hover:text-sky-700'}`}
                  >
                    <span>{t.openInNewTab}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </a>
                </div>

                {/* Price tag */}
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 mb-4 text-center text-xs font-semibold text-slate-700 flex flex-col gap-0.5">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{lang === 'zh' ? '早鸟限时优惠价' : 'LIMITED TIME OFFER'}</div>
                  <div>
                    {t.earlyBirdPrice}：<strong className="font-extrabold text-sm text-slate-900">{t.priceVal}</strong> ({t.originalPrice} {lang === 'zh' ? '¥49.0' : '$49.0'})
                  </div>
                </div>

                {/* Promo referral section */}
                <div className="bg-emerald-50/70 border border-emerald-100 rounded-xl p-3.5 mb-4 text-left flex flex-col gap-1.5 shadow-sm">
                  <div className="flex items-center gap-1.5 text-[11px] font-extrabold text-emerald-800 uppercase tracking-wider">
                    <Gift className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{lang === 'zh' ? '⭐ 推广限时免费通道' : '⭐ PROMO FREE ACCESS'}</span>
                  </div>
                  <p className="text-[10.5px] text-slate-600 leading-relaxed font-semibold">
                    {lang === 'zh' ? (
                      <>推广期内<strong>可免费体验一次</strong>！只需将专属邀请链接<strong>转发到微信群或社群</strong>，当有新用户通过您的推荐完成注册激活，系统将即刻自动激活并免费解锁本订单！</>
                    ) : (
                      <>During promotion, you can <strong>get 1 free rewrite quota</strong>! Share your invite link to groups. Once a new user registers through your link, this order will instantly activate for free!</>
                    )}
                  </p>
                  <button 
                    type="button"
                    onClick={() => setShowShareModal(true)}
                    className="w-full mt-1.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs flex items-center justify-center gap-1.5 transition-all shadow-sm"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    <span>{lang === 'zh' ? '转发群聊激活免费额度' : 'Share to Get Free Access'}</span>
                  </button>
                </div>

                {/* Status Indicator */}
                <div className="flex items-center justify-center gap-2 mb-5 px-3 py-2 bg-slate-50 border border-slate-100 rounded-xl">
                  <Loader2 className={`w-3.5 h-3.5 animate-spin shrink-0 ${paymentMethod === 'wechat' ? 'text-emerald-600' : 'text-sky-600'}`} />
                  <span className="text-[11px] font-semibold text-slate-500 animate-pulse truncate">
                    {t.paymentPending}
                  </span>
                </div>

                {/* Action buttons */}
                <div className="flex gap-3">
                  <button 
                    onClick={() => setShowQRModal(false)}
                    className="flex-1 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl text-xs font-bold transition-all"
                  >
                    {t.cancelOrder}
                  </button>
                  <button 
                    onClick={handleConfirmPaymentSuccess}
                    disabled={isVerifyingPayment}
                    className={`flex-1 py-2.5 disabled:bg-slate-400 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center justify-center gap-1 ${paymentMethod === 'wechat' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-sky-600 hover:bg-sky-700'}`}
                  >
                    {isVerifyingPayment ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Check className="w-3.5 h-3.5" />
                    )}
                    <span>{isVerifyingPayment ? (lang === 'zh' ? '核销中...' : 'Verifying...') : t.confirmSuccessText}</span>
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Interactive Share / Invite Link Overlay Modal */}
        <AnimatePresence>
          {showShareModal && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="bg-white border border-slate-200 w-full max-w-md rounded-2xl shadow-2xl p-6 relative overflow-hidden text-slate-800"
              >
                <button 
                  onClick={() => setShowShareModal(false)}
                  className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>

                <div className="text-center mb-5">
                  <span className="inline-flex p-3 bg-emerald-50 rounded-full text-emerald-600 mb-3">
                    <Gift className="w-6 h-6 animate-pulse" />
                  </span>
                  <h3 className="font-bold text-slate-900 text-base">
                    {lang === 'zh' ? '📢 转发好友激活免费额度' : '📢 Share with Friends for Free Quota'}
                  </h3>
                  <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                    {lang === 'zh' 
                      ? '将下方专属邀请函分享到微信群、社群或好友。当有新伙伴注册后，您的 1 次免费高阶重构额度将自动核销并立即生效！'
                      : 'Copy and send the referral message below to groups or channels. Once a new friend registers, your 1 free credit activates instantly!'}
                  </p>
                </div>

                {/* Invite Text Card */}
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 text-left text-xs mb-5 flex flex-col gap-2">
                  <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                    <MessageSquare className="w-3.5 h-3.5 text-slate-500" />
                    <span>{lang === 'zh' ? '专属邀请函预览' : 'INVITATION LETTER PREVIEW'}</span>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-lg p-3 text-slate-700 leading-relaxed max-h-36 overflow-y-auto font-medium select-all">
                    {lang === 'zh' ? (
                      <>
                        【CareerAI高管简历重构】我的朋友向我推荐了这款中高层管理者、技术领袖专属的简历优化神作！针对目标岗位JD一键靶向重构为STAR模型，高亮大厂高频领导力筛查词，ATS通过率提升2倍！送你一次免费体验机会，点击下方专属邀请链接，极速解锁高阶履历：
                        <br />
                        <span className="text-blue-600 font-semibold font-mono break-all">👉 {`${window.location.origin}/?ref=${currentUser ? currentUser.id : 'guest_promo'}`}</span>
                      </>
                    ) : (
                      <>
                        [CareerAI Executive Resume Optimizer] My friend recommended this AI resume tool tailored for executives, directors, and tech leaders. Restructures CVs into the powerful STAR framework to match high-frequency industry keywords, doubling ATS pass rates. Get 1 free credit through my unique referral link:
                        <br />
                        <span className="text-blue-600 font-semibold font-mono break-all">👉 {`${window.location.origin}/?ref=${currentUser ? currentUser.id : 'guest_promo'}`}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Real referral verification block */}
                <div className="bg-amber-50/50 border border-amber-200/60 rounded-xl p-3.5 mb-5 text-left flex flex-col gap-1.5">
                  <div className="flex items-center gap-1 text-[11px] font-extrabold text-amber-800 uppercase tracking-wider">
                    <Sparkles className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span>{lang === 'zh' ? '⚙️ 核实真实推荐注册' : '⚙️ VERIFY REAL REFERRAL'}</span>
                  </div>
                  <p className="text-[10px] text-slate-500 leading-relaxed">
                    {lang === 'zh' 
                      ? '当有好友通过您的专属链接实际完成注册后，点击下方按钮即可核实并激活您的免费额度。系统仅在检测到真实新用户注册记录时才会核销成功。'
                      : 'Once a friend actually registers through your unique link, click below to verify and activate your free credit. This only succeeds when a real new registration is detected.'}
                  </p>
                  <button
                    type="button"
                    onClick={handleReferralBypass}
                    disabled={isVerifyingPayment}
                    className="w-full py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg text-xs flex items-center justify-center gap-1.5 transition-all shadow-sm"
                  >
                    {isVerifyingPayment ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Check className="w-3.5 h-3.5" />
                    )}
                    <span>{lang === 'zh' ? '核实推荐注册并激活免费额度' : 'Verify Referral & Activate Free Credit'}</span>
                  </button>
                </div>

                {/* Share Modal Buttons */}
                <div className="flex gap-3">
                  <button 
                    onClick={() => setShowShareModal(false)}
                    className="flex-grow py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl text-xs font-bold transition-all"
                  >
                    {lang === 'zh' ? '返回收银台' : 'Back to Cashier'}
                  </button>
                  <button 
                    onClick={handleCopyInvite}
                    className="flex-grow py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center justify-center gap-1.5"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>{lang === 'zh' ? '复制邀请函' : 'Copy Invite Letter'}</span>
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Detailed Notification Dialog overlay */}
        <AnimatePresence>
          {activeNotification && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[120] flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="bg-white border border-slate-200 w-full max-w-md rounded-2xl shadow-2xl p-6 relative overflow-hidden text-slate-800"
              >
                <button 
                  onClick={() => setActiveNotification(null)}
                  className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>

                <div className="flex items-center gap-2 mb-3">
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded font-mono ${activeNotification.type === 'promotion' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : activeNotification.type === 'payment' ? 'bg-blue-50 text-blue-700 border border-blue-100' : 'bg-slate-100 text-slate-700 border border-slate-200'}`}>
                    {activeNotification.type === 'promotion' ? (lang === 'zh' ? '福利活动' : 'Promo') : activeNotification.type === 'payment' ? (lang === 'zh' ? '账单状态' : 'Transaction') : (lang === 'zh' ? '系统通知' : 'System')}
                  </span>
                  <span className="text-[10px] text-slate-400 font-semibold font-mono">{lang === 'zh' ? activeNotification.time : activeNotification.timeEn}</span>
                </div>

                <h3 className="font-bold text-slate-900 text-base mb-3 leading-snug">
                  {lang === 'zh' ? activeNotification.title : activeNotification.titleEn}
                </h3>

                <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 text-slate-600 text-xs leading-relaxed whitespace-pre-wrap font-semibold font-sans max-h-[300px] overflow-y-auto">
                  {lang === 'zh' ? activeNotification.content : activeNotification.contentEn}
                </div>

                <div className="mt-5 flex justify-end">
                  <button 
                    onClick={() => setActiveNotification(null)}
                    className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
                  >
                    {lang === 'zh' ? '已阅' : 'Got it'}
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* V0.4 Release Notes Dialog overlay */}
        <AnimatePresence>
          {showV04ReleaseNotes && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[120] flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="bg-white border border-slate-200 w-full max-w-lg rounded-2xl shadow-2xl p-6 relative overflow-hidden text-slate-800 flex flex-col max-h-[90vh]"
              >
                <button 
                  onClick={() => setShowV04ReleaseNotes(false)}
                  className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>

                <div className="flex items-center gap-2 mb-3 shrink-0">
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded font-mono bg-amber-50 text-amber-700 border border-amber-150">
                    V0.4 PRO VERSION UPGRADE
                  </span>
                  <span className="text-[10px] text-slate-400 font-semibold font-mono">{lang === 'zh' ? '全新发布' : 'NEW RELEASE'}</span>
                </div>

                <h3 className="font-extrabold text-slate-900 text-base mb-3 leading-snug flex items-center gap-2 shrink-0">
                  <Sparkles className="w-5 h-5 text-amber-500 animate-pulse" />
                  <span>{lang === 'zh' ? 'CareerAI V0.4 PRO 尊贵版重大升级公告' : 'CareerAI V0.4 PRO Exclusive Release Notes'}</span>
                </h3>

                <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 text-slate-750 text-xs leading-relaxed overflow-y-auto whitespace-pre-line font-medium font-sans flex-grow min-h-0">
                  {lang === 'zh' ? (
                    `🎯 核心功能迭代亮点

研判佐证链 (Premium JD Evidence Chain)
真实原汁原味原始数据佐证：在 【岗位画像】(researched) 页面，新增了来自大厂或独角兽公司的百万级真实 JD 特征特征分析。
交互式研判卡片：用户可点击卡片展开，查看底层大厂原始岗位文案与 CareerAI 专家委员会的核心简历改写建议，深度感悟领袖能力标签的对应要求。

对话式澄清问句 (Smart Clarification Wizard)
精细化诉求拦截：在 【简历匹配】(matching) 阶段，系统会基于目标岗位类型，智能拦截并展示 三步澄清向导。
高度拟真专家决策：向导向用户提出 3 个关乎高管管理跨度、决策复杂性与团队治理的高冲击力针对性问题，待用户交互提交后，无缝推进至最终匹配。

双栏精准改写工作区 (Interactive Copilot & Multi-version Workspace)
智能建议对比 (Interactive Copilot)：在 【简历优化】(finalized) 左侧面板中，引入对比工作台，逐条呈现针对性的 3-5 处 STAR 表达改写建议，支持用户一键采纳、忽略或AI重新编排。
高客专属多版本库：右侧面板完美集成 【标准投递版】、【高管冲刺版】、【AI产品负责人版】 三个专业分支版本的平滑切换。
专属求职大礼包 (.zip) 导出：导出菜单全面升级，支持打包一键导出包含三套精修简历、专家评测报告及面试预测的 .zip 压缩包。

客户满意度及原始建议日志 (Expert Feedback Loop)
尊贵交付评价：在优化页底端新增客户反馈模块，提供五星满意度评级与具体修辞修改建议框，一键提交反馈。

专家服务控制后台 (Conversion Funnel Dashboard)
实时统计漏斗：顶栏新增 【专家后台】 按钮。点击即可进入服务控制台，实时查看高管用户从画像访问、澄清参与到升级付费与反馈提交的全链条漏斗（Funnel）转化统计。
反馈流实时展现：后台右侧同步呈现最新客户评级与具体诉求建议列表，便于委员会持续迭代大模型推荐算法权重。

🎨 视觉设计与工程规范
V0.4 PRO 尊贵标识：系统顶栏标识正式升级为 V0.4 PRO 专享版，页面整体配色及字体沿用了严谨奢华的 Cosmic Slate 灰蓝金专业色调。
无缝路由与状态驱动：所有新增交互均由前端状态机制平滑衔接，完美适配响应式布局，并通过了系统的 TypeScript 静态类型编译与 npm run build 校验。`
                  ) : (
                    `🎯 Core Feature Milestones & Iterations

Premium JD Evidence Chain
- High fidelity real JD evidence in the [Researched] stage from top-tier tech firms.
- Interactive expansion cards for underlying job descriptions and leadership keywords.

Smart Clarification Wizard
- Automatic smart intercept wizard with three dynamic high-impact questions during [Matching] stage.
- High-fidelity matching simulations with seamless feedback incorporation.

Interactive Copilot & Multi-version Workspace
- Comparative panel on the left for direct STAR rewrites, with quick adoption to the right.
- Elegant sidebar for multi-version switching: Standard, Executive, and AI Product Specialist.
- Complete luxury bundle (.zip) export containing all customized versions.

Expert Feedback Loop
- Premium delivery feedback collection on the [Finalized] stage, supporting five-star ratings and textual feedback.

Conversion Funnel Dashboard
- Brand new [Expert Admin] dashboard console in the navbar to track conversion funnel metrics and inspect user feedback live.

Visuals & Integrity
- System brand updated to V0.4 PRO exclusive version with elegant Cosmic Slate palette. Full responsive flows and solid TypeScript builds.`
                  )}
                </div>

                <div className="mt-5 flex justify-end shrink-0">
                  <button 
                    onClick={() => setShowV04ReleaseNotes(false)}
                    className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
                  >
                    {lang === 'zh' ? '开启体验' : 'Explore Now'}
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
        </div>
        </>
      )}

      {/* Help Center Modal */}
      {showHelpCenter && (
        <HelpCenter onClose={() => setShowHelpCenter(false)} lang={lang} />
      )}
    </div>
  );
}
