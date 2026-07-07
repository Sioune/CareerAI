export interface HighFrequencySkill {
  name: string;
  percentage: number;
}

export interface JDEvidence {
  id: string;
  companyType: string; // e.g. "某 AI 公司" | "某 SaaS 企业"
  text: string; // Full evidence text or context
  summary: string; // Bullet summary
  type: string; // e.g. "官方招聘页" | "公开平台"
}

export interface SkillProfileConclusion {
  id: string;
  title: string;
  frequency: number; // e.g. 64
  category: string;
  detail: string;
  evidences: JDEvidence[];
  suggestion: string; // Suggestion for resume optimization
}

export interface SampleOverview {
  count: number;
  roles: { name: string; count: number }[];
  cities: { name: string; count: number }[];
  sources: { name: string; count: number }[];
}

export interface JobResearchReport {
  targetRole: string;
  researchSummary: string;
  mandatoryRequirements: string[];
  highFrequencySkills: HighFrequencySkill[];
  plusSkills: string[];
  jdCount: number;
  sampleOverview?: SampleOverview;
  conclusions?: SkillProfileConclusion[];
}

export interface StrengthOrGap {
  title: string;
  detail: string;
}

export interface ResumeMatchReport {
  matchScore: number;
  strengths: StrengthOrGap[];
  gaps: StrengthOrGap[];
  additionalGapsCount: number;
  matchedKeywords: string[];
  missingKeywords: string[];
}

export interface ExperienceItem {
  company: string;
  role: string;
  duration: string;
  bullets: string[];
}

export interface ProjectItem {
  name: string;
  role: string;
  bullets: string[];
}

export interface OptimizedResume {
  name: string;
  title: string;
  email: string;
  location: string;
  linkedin?: string;
  summary: string;
  coreCapabilities: string[];
  experience: ExperienceItem[];
  education: string;
  skills: string[];
}

export interface ClarificationQuestion {
  id: string;
  questionText: string;
  questionType: string; // e.g. "AI项目经验" | "业务结果" | "管理经验" | etc.
  reason: string; // Why we ask
  priority: number;
  options?: string[]; // Multiple choice options
  userAnswer?: string;
  skipped?: boolean;
}

export interface RewriteSuggestion {
  id: string;
  sectionType: string;
  originalText: string;
  issueSummary: string;
  rewrittenText: string;
  suggestionReason: string;
  missingInfo?: string[];
  status: 'pending' | 'accepted' | 'rejected' | 'edited' | 'regenerated';
}

export interface ResumeVersion {
  id: string;
  versionName: string; // "标准投递版" | "高管冲刺版" | "AI 产品/业务负责人版"
  versionType: 'standard' | 'executive' | 'ai_product';
  content: OptimizedResume;
  isCurrent: boolean;
  createdAt: string;
}

export interface UserFeedback {
  id: string;
  target: string; // "profile" | "match" | "rewrite" | "resume" | "export"
  rating: number; // 1-5
  reasonTags: string[];
  comment?: string;
  createdAt: string;
}

export interface TaskItem {
  id: string;
  targetRole: string;
  industry?: string;
  location?: string;
  seniority?: string;
  createdAt: string;
  status: 'idle' | 'researching' | 'researched' | 'matching' | 'matched' | 'upgraded' | 'finalized';
  report?: JobResearchReport;
  originalResumeName?: string;
  originalResumeText?: string;
  matchReport?: ResumeMatchReport;
  optimizedResume?: OptimizedResume;
  
  // PRD v0.4 New States
  clarificationQuestions?: ClarificationQuestion[];
  clarificationCompleted?: boolean;
  rewriteSuggestions?: RewriteSuggestion[];
  versions?: ResumeVersion[];
  feedbacks?: UserFeedback[];
}
