export interface HighFrequencySkill {
  name: string;
  percentage: number;
}

export interface JobResearchReport {
  targetRole: string;
  researchSummary: string;
  mandatoryRequirements: string[];
  highFrequencySkills: HighFrequencySkill[];
  plusSkills: string[];
  jdCount: number;
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
}
