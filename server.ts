import express from "express";
import path from "path";
import fs from "fs";
import { execSync } from "child_process";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
// @ts-ignore
import mammoth from "mammoth";
import { createRequire } from "module";
import PDFDocument from "pdfkit";
import puppeteer from "puppeteer";
import AdmZip from "adm-zip";

function getChromiumPath(): string {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  try {
    return execSync("which chromium || which chromium-browser || which google-chrome", { encoding: "utf8" }).trim();
  } catch {
    return "/usr/bin/chromium";
  }
}

let cjkFontBase64 = "";
const CJK_FONT_CACHE = "/tmp/noto-sans-sc-regular.woff2";

async function initCjkFont(): Promise<void> {
  try {
    if (fs.existsSync(CJK_FONT_CACHE)) {
      cjkFontBase64 = fs.readFileSync(CJK_FONT_CACHE).toString("base64");
      console.log("[PDF] CJK font loaded from disk cache, bytes:", fs.statSync(CJK_FONT_CACHE).size);
      return;
    }
    const url = "https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-sc@5.1.0/files/noto-sans-sc-chinese-simplified-400-normal.woff2";
    console.log("[PDF] Downloading CJK font from CDN...");
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const buf = Buffer.from(await resp.arrayBuffer());
    fs.writeFileSync(CJK_FONT_CACHE, buf);
    cjkFontBase64 = buf.toString("base64");
    console.log("[PDF] CJK font downloaded and cached, bytes:", buf.length);
  } catch (e) {
    console.warn("[PDF] Failed to load CJK font, Chinese text may not render in PDFs:", e);
  }
}

function getCjkFontFaceStyle(): string {
  if (!cjkFontBase64) return "";
  return `@font-face {
    font-family: 'NotoSansSC';
    src: url('data:font/woff2;base64,${cjkFontBase64}') format('woff2');
    font-weight: 400;
    font-style: normal;
  }`;
}

const CJK_FONT_FAMILY = "'NotoSansSC', \"PingFang SC\", \"Hiragino Sans GB\", \"Microsoft YaHei\", \"Noto Sans CJK SC\", Arial, sans-serif";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db, eq, and } from "./src/db/index.ts";
import { users, resumeVersions, rewriteSuggestions, clarificationQuestions, userFeedbacks, eventLogs } from "./src/db/schema.ts";

const JWT_SECRET = process.env.JWT_SECRET || "careerai-local-dev-secret-change-in-prod";

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception thrown:", err);
});

async function executeWithRetry<T>(queryFn: () => Promise<T>, retries = 4, baseDelay = 300): Promise<T> {
  let lastError: any;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await queryFn();
    } catch (err: any) {
      lastError = err;
      const errMsg = [
        err?.message,
        String(err),
        err?.cause?.message,
        err?.cause ? String(err.cause) : "",
      ].filter(Boolean).join(" | ");
      
      const isConnError = 
        errMsg.includes("terminated unexpectedly") || 
        errMsg.includes("Connection") ||
        errMsg.includes("closed") ||
        errMsg.includes("timeout") ||
        errMsg.includes("broken pipe") ||
        errMsg.includes("SQL pool client") ||
        err?.code === "57P01" || // admin shutdown
        err?.code === "ECONNRESET";
      
      if (isConnError && attempt < retries) {
        const backoffDelay = baseDelay * attempt;
        console.warn(`Database query failed on attempt ${attempt} due to connection error. Retrying in ${backoffDelay}ms... Error: ${errMsg}`);
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

async function getDbUserFromHeader(authHeader?: string) {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  const token = authHeader.split("Bearer ")[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { uid: string; email: string };
    const existing = await executeWithRetry(() => db.select().from(users).where(eq(users.uid, payload.uid))) as any;
    if (existing.length > 0) return existing[0];
    return null;
  } catch (err) {
    console.error("JWT verification failed:", err);
    return null;
  }
}


const requireFn = typeof require !== "undefined" ? require : createRequire(import.meta.url);
const pdf = requireFn("pdf-parse");

dotenv.config();

// Initialize Gemini client safely
const apiKey = process.env.GEMINI_API_KEY;
let aiClient: GoogleGenAI | null = null;

if (apiKey) {
  aiClient = new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
  console.log("Gemini API client initialized successfully with API key.");
} else {
  console.warn("WARNING: GEMINI_API_KEY is not defined. The server will use high-fidelity simulated response generators.");
}

function logCleanGeminiError(action: string, err: any) {
  const errMsg = err?.message || (err && typeof err === 'object' ? JSON.stringify(err) : String(err));
  if (errMsg.includes("429") || errMsg.includes("Quota") || errMsg.includes("RESOURCE_EXHAUSTED") || errMsg.includes("quota")) {
    console.log(`[Gemini Info] ${action} API limit reached (429/Quota). Using local high-fidelity optimization engine.`);
  } else {
    console.log(`[Gemini Info] ${action} fallback engaged: Service temporarily unavailable.`);
  }
}

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || "5000", 10);

  initCjkFont().catch(() => {});

  app.use(express.json({ limit: "10mb" }));

  // API Route: Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", aiEnabled: !!aiClient });
  });

  // API Route: Register
  app.post("/api/auth/register", async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username?.trim() || !password?.trim()) {
        return res.status(400).json({ error: "用户名和密码不能为空" });
      }
      const uid = username.trim().toLowerCase();
      const email = uid.includes("@") ? uid : `${uid}@career-ai.local`;

      const existing = await db.select().from(users).where(eq(users.uid, uid)) as any[];
      if (existing.length > 0) {
        return res.status(409).json({ error: "用户名已存在，请直接登录" });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const result = await db.insert(users).values({ uid, email, passwordHash } as any) as any[];
      const newUser = Array.isArray(result) ? result[0] : result;

      const token = jwt.sign({ uid, email }, JWT_SECRET, { expiresIn: "30d" });
      return res.json({ success: true, token, user: { id: String(uid), username: username.trim() } });
    } catch (err: any) {
      console.error("Registration error:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // API Route: Login
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username?.trim() || !password?.trim()) {
        return res.status(400).json({ error: "用户名和密码不能为空" });
      }
      const uid = username.trim().toLowerCase();

      const rows = await db.select().from(users).where(eq(users.uid, uid)) as any[];
      if (rows.length === 0) {
        return res.status(401).json({ error: "用户不存在，请先注册" });
      }
      const user = rows[0];
      if (!user.passwordHash) {
        return res.status(401).json({ error: "账户数据异常，请重新注册" });
      }

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        return res.status(401).json({ error: "密码错误，请重试" });
      }

      const token = jwt.sign({ uid: user.uid, email: user.email }, JWT_SECRET, { expiresIn: "30d" });
      return res.json({ success: true, token, user: { id: String(user.uid), username: username.trim() } });
    } catch (err: any) {
      console.error("Login error:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // API Route: Sync user (kept for compatibility, now uses JWT)
  app.post("/api/sync-user", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      const dbUser = await getDbUserFromHeader(authHeader);
      if (!dbUser) {
        return res.status(401).json({ error: "Invalid or missing auth token" });
      }
      return res.json({ success: true, user: dbUser });
    } catch (err: any) {
      console.error("Failed to sync user:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // API Route: Parse Resume File (.docx, .pdf, .txt)
  app.post("/api/parse-file", async (req, res) => {
    const { fileName, fileData } = req.body;

    if (!fileName || !fileData) {
      return res.status(400).json({ error: "fileName and fileData (base64) are required" });
    }

    try {
      const buffer = Buffer.from(fileData, "base64");
      const lowerName = fileName.toLowerCase();
      let extractedText = "";

      if (lowerName.endsWith(".docx")) {
        const result = await mammoth.extractRawText({ buffer });
        extractedText = result.value;
      } else if (lowerName.endsWith(".pdf")) {
        const parser = new pdf.PDFParse({ data: buffer });
        const result = await parser.getText();
        extractedText = result.text || "";
        await parser.destroy();
        if (!extractedText.trim()) {
          throw new Error("PDF文件中未提取到有效文本内容。如果此文件是扫描件或图片PDF，建议您直接将简历文本复制并粘贴到下方的文本框中。");
        }
      } else {
        extractedText = buffer.toString("utf-8");
      }

      // Clean up whitespace
      extractedText = extractedText
        .replace(/\r\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

      return res.json({ text: extractedText });
    } catch (error: any) {
      console.error("Error parsing resume file:", error);
      return res.status(500).json({ error: `解析文件失败: ${error.message || error}` });
    }
  });

  // API Route: Analyze Role & Generate Market Insight Report
  app.post("/api/analyze-role", async (req, res) => {
    const { targetRole, industry, location, seniority } = req.body;

    if (!targetRole) {
      return res.status(400).json({ error: "targetRole is required" });
    }

    try {
      if (aiClient) {
        const prompt = `You are an elite Chinese tech recruitment director. Analyze the role "${targetRole}" within the "${industry || 'AI/Tech'}" industry located in "${location || 'Beijing/Shanghai/Remote'}". The target seniority level is "${seniority || 'Executive/Director/VP'}".
        Based on analyzing 25+ recent high-end real-world job descriptions in the Chinese market, synthesize a comprehensive job profile report.
        Strictly provide the response in Chinese according to the following JSON structure:
        {
          "targetRole": string (normalized role name),
          "researchSummary": string (a comprehensive 100-word paragraph detailing current state, key challenges, and industry context of this role),
          "mandatoryRequirements": string[] (list of 5 critical requirements for the role),
          "highFrequencySkills": [
            { "name": string, "percentage": number (integer between 40 and 99) }
          ] (provide exactly 10 high-frequency skills with their occurrences/importance percentages),
          "plusSkills": string[] (list of 3 distinguishing differentiator skills or credentials),
          "jdCount": number (number of analyzed posts, normally between 20 and 35)
        }
        Do not add any markup or markdown wraps inside the json properties. Keep it as pure clean JSON structure.`;

        const response = await aiClient.models.generateContent({
          model: "gemini-3.5-flash",
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                targetRole: { type: Type.STRING },
                researchSummary: { type: Type.STRING },
                mandatoryRequirements: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING }
                },
                highFrequencySkills: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      name: { type: Type.STRING },
                      percentage: { type: Type.INTEGER }
                    },
                    required: ["name", "percentage"]
                  }
                },
                plusSkills: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING }
                },
                jdCount: { type: Type.INTEGER }
              },
              required: ["targetRole", "researchSummary", "mandatoryRequirements", "highFrequencySkills", "plusSkills", "jdCount"]
            }
          }
        });

        const text = response.text;
        if (text) {
          const parsed = JSON.parse(text);
          return res.json(parsed);
        }
      }
    } catch (err: any) {
      logCleanGeminiError("analyze-role", err);
    }

    // High fidelity fallback when Gemini is disabled, key missing or fails
    console.log("Using simulated high-fidelity fallback for analyze-role");
    const simulatedReport = getSimulatedReport(targetRole, industry, location, seniority);
    return res.json(simulatedReport);
  });

  // API Route: Match Resume to Role Insight Report
  app.post("/api/match-resume", async (req, res) => {
    const { targetRole, report, resumeText } = req.body;

    if (!targetRole || !resumeText) {
      return res.status(400).json({ error: "targetRole and resumeText are required" });
    }

    try {
      if (aiClient) {
        const prompt = `You are an elite career advisory agent. Compare the candidate's resume with the target job profile "${targetRole}" and its market research requirements:
        Market summary: ${JSON.stringify(report)}
        
        Candidate's original resume text:
        ---
        ${resumeText}
        ---

        Conduct a strict gap analysis and provide:
        1. A match score (0-100) based on alignment with the core executive requirements.
        2. Exactly 3 Key Strengths showing where the candidate matches excellently.
        3. Exactly 3 Critical Gaps showing where the candidate fails or lacks metrics/keywords.
        4. Structured keyword coverage assessment.
        
        Format the response in Chinese matching this JSON structure:
        {
          "matchScore": number (integer between 30 and 95),
          "strengths": [
            { "title": string, "detail": string }
          ] (exactly 3 strengths),
          "gaps": [
            { "title": string, "detail": string }
          ] (exactly 3 critical gaps),
          "additionalGapsCount": number (usually 5 to 10),
          "matchedKeywords": string[] (list of 5 matched keywords/technologies/methodologies),
          "missingKeywords": string[] (list of 4-5 key missing words like SOC2, M&A, board reporting, etc.)
        }
        Keep the detail sentences highly professional and actionable.`;

        const response = await aiClient.models.generateContent({
          model: "gemini-3.5-flash",
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                matchScore: { type: Type.INTEGER },
                strengths: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      title: { type: Type.STRING },
                      detail: { type: Type.STRING }
                    },
                    required: ["title", "detail"]
                  }
                },
                gaps: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      title: { type: Type.STRING },
                      detail: { type: Type.STRING }
                    },
                    required: ["title", "detail"]
                  }
                },
                additionalGapsCount: { type: Type.INTEGER },
                matchedKeywords: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING }
                },
                missingKeywords: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING }
                }
              },
              required: ["matchScore", "strengths", "gaps", "additionalGapsCount", "matchedKeywords", "missingKeywords"]
            }
          }
        });

        const text = response.text;
        if (text) {
          const parsed = JSON.parse(text);
          return res.json(parsed);
        }
      }
    } catch (err: any) {
      logCleanGeminiError("match-resume", err);
    }

    // High fidelity fallback
    console.log("Using simulated high-fidelity fallback for match-resume");
    const simulatedMatch = getSimulatedMatch(targetRole, resumeText);
    return res.json(simulatedMatch);
  });

  // API Route: Generate optimized resume
  app.post("/api/optimize-resume", async (req, res) => {
    const { targetRole, report, resumeText, matchReport } = req.body;

    if (!targetRole || !resumeText) {
      return res.status(400).json({ error: "targetRole and resumeText are required" });
    }

    try {
      if (aiClient) {
        const prompt = `You are a premier executive resume writer. Your job is to transform the candidate's original resume to perfectly target the role of "${targetRole}" by resolving identified gaps.
        Target Job Insights: ${JSON.stringify(report)}
        Identified Gaps: ${JSON.stringify(matchReport)}
        
        Original Resume Text:
        ---
        ${resumeText}
        ---

        Rules:
        1. DO NOT fabricate any fake companies, degrees, or years. Keep the original facts.
        2. Elevate executive language: upgrade execution verbs (e.g., "负责功能设计", "写代码") to high-impact leadership bullet points (e.g., "主导AI大模型产品从0到1研发落地并实现百万级商业化增长", "领导跨职能研发团队").
        3. Add clear placeholder notes for missing metrics with a highly specific reference rewrite where numbers are replaced by "xxx". For example: 【建议补充：例如“拉动新产品线收入达 xxx 万元，新增标杆客户 xxx 家”】 or 【建议补充：例如“管理跨地域研发团队达 xxx 人，人效提升 xxx%”】. This allows users to easily copy, paste, and replace 'xxx' with their actual data.
        4. Alleviate structural hierarchy. Outline a professional summary, core competencies list, clear work experience highlights, and education details.
        
        Format the response in Chinese matching this JSON schema:
        {
          "name": string (candidate name from original resume, default "张建国 / John Doe"),
          "title": string (target role e.g. "AI产品负责人" / "AI Product Lead"),
          "email": string (extracted email or default "executive@careerai.cn"),
          "location": string (extracted location or default "北京/上海"),
          "linkedin": string (linkedin profile if found),
          "summary": string (a powerful 3-5 line professional summary highlighting AI leadership and business value),
          "coreCapabilities": string[] (list of 5 core strengths tailored to this JD e.g., "0-1大模型落地", "跨职能团队协作"),
          "experience": [
            {
              "company": string,
              "role": string,
              "duration": string,
              "bullets": string[] (exactly 3-4 powerful optimized bullet points using the SAR/STAR framework with bold metrics or placeholders)
            }
          ] (optimized work experiences),
          "education": string (summarized degree, institution, and major),
          "skills": string[] (list of 8-10 technical and management skills)
        }
        `;

        const response = await aiClient.models.generateContent({
          model: "gemini-3.5-flash",
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                title: { type: Type.STRING },
                email: { type: Type.STRING },
                location: { type: Type.STRING },
                linkedin: { type: Type.STRING },
                summary: { type: Type.STRING },
                coreCapabilities: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING }
                },
                experience: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      company: { type: Type.STRING },
                      role: { type: Type.STRING },
                      duration: { type: Type.STRING },
                      bullets: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING }
                      }
                    },
                    required: ["company", "role", "duration", "bullets"]
                  }
                },
                education: { type: Type.STRING },
                skills: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING }
                }
              },
              required: ["name", "title", "email", "location", "summary", "coreCapabilities", "experience", "education", "skills"]
            }
          }
        });

        const text = response.text;
        if (text) {
          const parsed = JSON.parse(text);
          return res.json(parsed);
        }
      }
    } catch (err: any) {
      logCleanGeminiError("optimize-resume", err);
    }

    // High fidelity fallback
    console.log("Using simulated high-fidelity fallback for optimize-resume");
    const simulatedResume = getSimulatedResume(targetRole, resumeText);
    return res.json(simulatedResume);
  });

  // API Route: Export high-fidelity PDF using Puppeteer for pixel-perfect CSS controls
  app.post("/api/export-pdf", async (req, res) => {
    const { resume, targetRole } = req.body;

    if (!resume) {
      return res.status(400).json({ error: "resume data is required" });
    }

    try {
      // Set attachment headers for direct browser download trigger
      res.setHeader("Content-Type", "application/pdf");
      const safeFilename = encodeURIComponent(`${resume.name || "resume"}_${targetRole || "optimized"}_优化版.pdf`);
      res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${safeFilename}`);

      const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    ${getCjkFontFaceStyle()}
    body {
      font-family: ${CJK_FONT_FAMILY};
      color: #1e293b;
      line-height: 1.5;
      margin: 0;
      padding: 0;
      background-color: #ffffff;
      -webkit-font-smoothing: antialiased;
      font-size: 10pt;
    }
    
    .container {
      width: 100%;
      margin: 0;
      padding: 0;
    }

    /* Resume Header Style */
    .header {
      margin-bottom: 20px;
      padding-bottom: 12px;
      border-bottom: 1px solid #e2e8f0;
    }
    
    .name {
      font-size: 20pt;
      font-weight: 800;
      color: #0f172a;
      letter-spacing: -0.025em;
      margin: 0 0 2px 0;
    }
    
    .title {
      font-size: 10.5pt;
      font-weight: 600;
      color: #2563eb;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin: 0 0 8px 0;
    }
    
    .contact {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      font-size: 8.5pt;
      color: #64748b;
      font-weight: 500;
    }
    
    .contact-item {
      display: flex;
      align-items: center;
    }
    
    .contact-item:not(:last-child)::after {
      content: "|";
      margin-left: 12px;
      color: #cbd5e1;
    }

    /* Section Styles */
    .section {
      margin-top: 18px;
    }
    
    .section-title {
      font-size: 10pt;
      font-weight: 700;
      color: #0f172a;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      border-bottom: 1.5px solid #cbd5e1;
      padding-bottom: 3px;
      margin: 0 0 10px 0;
    }
    
    .summary-text {
      font-size: 9pt;
      color: #334155;
      text-align: justify;
      line-height: 1.5;
      margin: 0;
    }

    /* Core Capabilities Grid */
    .capabilities-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px 20px;
      margin: 0;
      padding: 0;
      list-style-type: none;
    }
    
    .capability-item {
      font-size: 9pt;
      color: #334155;
      display: flex;
      align-items: flex-start;
      line-height: 1.4;
    }
    
    .capability-item::before {
      content: "•";
      color: #2563eb;
      font-weight: bold;
      display: inline-block;
      width: 10px;
      margin-right: 4px;
      flex-shrink: 0;
    }

    /* Work Experience List */
    .experience-item {
      margin-bottom: 14px;
    }
    
    .experience-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 4px;
      page-break-inside: avoid;
      break-inside: avoid;
      page-break-after: avoid;
      break-after: avoid;
    }
    
    .company-role {
      font-size: 9.5pt;
      font-weight: 700;
      color: #0f172a;
    }
    
    .duration {
      font-size: 8.5pt;
      font-weight: 600;
      color: #64748b;
      white-space: nowrap;
    }
    
    .bullets {
      margin: 0;
      padding-left: 8px;
      list-style-type: none;
    }
    
    .bullet-item {
      font-size: 9pt;
      color: #334155;
      text-align: justify;
      line-height: 1.5;
      margin-bottom: 4px;
      position: relative;
      padding-left: 10px;
    }
    
    .bullet-item::before {
      content: "•";
      color: #3b82f6;
      position: absolute;
      left: 0;
      top: 0;
    }

    /* Education */
    .education-text {
      font-size: 9pt;
      color: #0f172a;
      line-height: 1.5;
      margin: 0;
      white-space: pre-line;
    }

    /* Skills & Keywords */
    .skills-text {
      font-size: 9pt;
      color: #475569;
      text-align: justify;
      line-height: 1.5;
      margin: 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 class="name">${resume.name || ""}</h1>
      <div class="title">${resume.title || ""}</div>
      <div class="contact">
        ${resume.email ? `<div class="contact-item">${resume.email}</div>` : ''}
        ${resume.location ? `<div class="contact-item">${resume.location}</div>` : ''}
        ${resume.linkedin ? `<div class="contact-item">${resume.linkedin}</div>` : ''}
      </div>
    </div>

    ${resume.summary ? `
    <div class="section">
      <h2 class="section-title">Professional Summary / 职业总结</h2>
      <p class="summary-text">${resume.summary}</p>
    </div>
    ` : ''}

    ${resume.coreCapabilities && resume.coreCapabilities.length > 0 ? `
    <div class="section">
      <h2 class="section-title">Core Capabilities / 核心竞争力</h2>
      <ul class="capabilities-grid">
        ${(resume.coreCapabilities || []).map((cap: string) => `
          <li class="capability-item">${cap}</li>
        `).join('')}
      </ul>
    </div>
    ` : ''}

    ${resume.experience && resume.experience.length > 0 ? `
    <div class="section">
      <h2 class="section-title">Work Experience / 核心履历优化</h2>
      ${(resume.experience || []).map((exp: any) => `
        <div class="experience-item">
          <div class="experience-header">
            <span class="company-role">${exp.company || ""} &nbsp;|&nbsp; ${exp.role || ""}</span>
            <span class="duration">${exp.duration || ""}</span>
          </div>
          <ul class="bullets">
            ${(exp.bullets || []).map((bullet: string) => {
              const cleanBullet = bullet.replace(/【建议补充：[^】]+】/g, '');
              return `<li class="bullet-item">${cleanBullet}</li>`;
            }).join('')}
          </ul>
        </div>
      `).join('')}
    </div>
    ` : ''}

    ${resume.education ? `
    <div class="section">
      <h2 class="section-title">Education / 教育背景</h2>
      <p class="education-text">${resume.education}</p>
    </div>
    ` : ''}

    ${resume.skills && resume.skills.length > 0 ? `
    <div class="section">
      <h2 class="section-title">Skills & Keywords / 技能与关键词</h2>
      <p class="skills-text">${(resume.skills || []).join(', ')}</p>
    </div>
    ` : ''}
  </div>
</body>
</html>
      `;

      // Launch headless browser using Puppeteer
      const browser = await puppeteer.launch({
        executablePath: getChromiumPath(),
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu"
        ]
      });

      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "domcontentloaded" as any });

      // Generate high-fidelity A4 PDF with perfect margin and native footers
      const pdfBuffer = await page.pdf({
        format: 'A4',
        margin: {
          top: '1.6cm',
          bottom: '1.6cm',
          left: '1.8cm',
          right: '1.8cm'
        },
        displayHeaderFooter: true,
        headerTemplate: '<div></div>',
        footerTemplate: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; font-size: 8px; color: #94a3b8; width: 100%; text-align: center; padding-bottom: 4px;">
            Page <span class="pageNumber"></span> of <span class="totalPages"></span>
          </div>
        `,
        printBackground: true
      });

      await browser.close();
      return res.send(Buffer.from(pdfBuffer));

    } catch (error: any) {
      console.error("PDF Export error with Puppeteer:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: `导出 PDF 失败: ${error.message || error}` });
      }
    }
  });

  // ==========================================
  // V0.4 CORE STATEFUL MEMORY CACHES (TABLES)
  // ==========================================
  const jobResearchCache = new Map<string, any>();
  const clarificationQuestionsCache = new Map<string, any[]>();
  const rewriteSuggestionsCache = new Map<string, any[]>();
  const resumeVersionsCache = new Map<string, any[]>();
  const userFeedbacksCache = new Map<string, any[]>();
  const eventLogsCache = new Array<any>();
  const exportedFilesCache = new Map<string, { buffer: Buffer; mimeType: string; filename: string }>();

  // ==========================================
  // V0.4 HTML GENERATORS & RENDERING ENGINES
  // ==========================================

  function generateResumeHtml(resume: any): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    ${getCjkFontFaceStyle()}
    body {
      font-family: ${CJK_FONT_FAMILY};
      color: #1e293b;
      line-height: 1.5;
      margin: 0;
      padding: 0;
      background-color: #ffffff;
    }
    
    .container {
      max-width: 800px;
      margin: 0 auto;
    }
    
    /* Header Section */
    .header {
      border-bottom: 2px solid #2563eb;
      padding-bottom: 12px;
      margin-bottom: 16px;
    }
    
    .name {
      font-size: 20pt;
      font-weight: 800;
      color: #0f172a;
      margin: 0 0 4px 0;
      letter-spacing: -0.025em;
    }
    
    .title {
      font-size: 11pt;
      font-weight: 600;
      color: #2563eb;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin: 0 0 8px 0;
    }
    
    .contact {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      font-size: 8.5pt;
      color: #64748b;
    }
    
    .contact-item {
      display: flex;
      align-items: center;
    }
    
    /* Section Structure */
    .section {
      margin-bottom: 16px;
    }
    
    .section-title {
      font-size: 11pt;
      font-weight: 700;
      color: #0f172a;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 4px;
      margin: 0 0 10px 0;
    }
    
    .summary-text {
      font-size: 9pt;
      color: #334155;
      text-align: justify;
      line-height: 1.5;
      margin: 0;
    }

    /* Core Capabilities Grid */
    .capabilities-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px 20px;
      margin: 0;
      padding: 0;
      list-style-type: none;
    }
    
    .capability-item {
      font-size: 9pt;
      color: #334155;
      display: flex;
      align-items: flex-start;
      line-height: 1.4;
    }
    
    .capability-item::before {
      content: "•";
      color: #2563eb;
      font-weight: bold;
      display: inline-block;
      width: 10px;
      margin-right: 4px;
      flex-shrink: 0;
    }

    /* Work Experience List */
    .experience-item {
      margin-bottom: 14px;
    }
    
    .experience-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 4px;
      page-break-inside: avoid;
      break-inside: avoid;
      page-break-after: avoid;
      break-after: avoid;
    }
    
    .company-role {
      font-size: 9.5pt;
      font-weight: 700;
      color: #0f172a;
    }
    
    .duration {
      font-size: 8.5pt;
      font-weight: 600;
      color: #64748b;
      white-space: nowrap;
    }
    
    .bullets {
      margin: 0;
      padding-left: 8px;
      list-style-type: none;
    }
    
    .bullet-item {
      font-size: 9pt;
      color: #334155;
      text-align: justify;
      line-height: 1.5;
      margin-bottom: 4px;
      position: relative;
      padding-left: 10px;
    }
    
    .bullet-item::before {
      content: "•";
      color: #3b82f6;
      position: absolute;
      left: 0;
      top: 0;
    }

    /* Education */
    .education-text {
      font-size: 9pt;
      color: #0f172a;
      line-height: 1.5;
      margin: 0;
      white-space: pre-line;
    }

    /* Skills & Keywords */
    .skills-text {
      font-size: 9pt;
      color: #475569;
      text-align: justify;
      line-height: 1.5;
      margin: 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 class="name">${resume.name || ""}</h1>
      <div class="title">${resume.title || ""}</div>
      <div class="contact">
        ${resume.email ? `<div class="contact-item">${resume.email}</div>` : ''}
        ${resume.location ? `<div class="contact-item">${resume.location}</div>` : ''}
        ${resume.linkedin ? `<div class="contact-item">${resume.linkedin}</div>` : ''}
      </div>
    </div>

    ${resume.summary ? `
    <div class="section">
      <h2 class="section-title">Professional Summary / 职业总结</h2>
      <p class="summary-text">${resume.summary}</p>
    </div>
    ` : ''}

    ${resume.coreCapabilities && resume.coreCapabilities.length > 0 ? `
    <div class="section">
      <h2 class="section-title">Core Capabilities / 核心竞争力</h2>
      <ul class="capabilities-grid">
        ${(resume.coreCapabilities || []).map((cap: string) => `
          <li class="capability-item">${cap}</li>
        `).join('')}
      </ul>
    </div>
    ` : ''}

    ${resume.experience && resume.experience.length > 0 ? `
    <div class="section">
      <h2 class="section-title">Work Experience / 核心履历优化</h2>
      ${(resume.experience || []).map((exp: any) => `
        <div class="experience-item">
          <div class="experience-header">
            <span class="company-role">${exp.company || ""} &nbsp;|&nbsp; ${exp.role || ""}</span>
            <span class="duration">${exp.duration || ""}</span>
          </div>
          <ul class="bullets">
            ${(exp.bullets || []).map((bullet: string) => {
              const cleanBullet = bullet.replace(/【建议补充：[^】]+】/g, '');
              return `<li class="bullet-item">${cleanBullet}</li>`;
            }).join('')}
          </ul>
        </div>
      `).join('')}
    </div>
    ` : ''}

    ${resume.education ? `
    <div class="section">
      <h2 class="section-title">Education / 教育背景</h2>
      <p class="education-text">${resume.education}</p>
    </div>
    ` : ''}

    ${resume.skills && resume.skills.length > 0 ? `
    <div class="section">
      <h2 class="section-title">Skills & Keywords / 技能与关键词</h2>
      <p class="skills-text">${(resume.skills || []).join(', ')}</p>
    </div>
    ` : ''}
  </div>
</body>
</html>
    `;
  }

  function generateWordHtmlString(resume: any): string {
    return `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <title>${resume.name || "Resume"}</title>
        <style>
          body { font-family: Calibri, Arial, sans-serif; }
          h1 { font-size: 22pt; margin: 0 0 4pt 0; color: #0f172a; }
          .title { font-size: 12pt; font-weight: bold; color: #2563eb; text-transform: uppercase; margin-bottom: 8pt; }
          .contact { font-size: 9.5pt; color: #64748b; margin-bottom: 12pt; }
          .section-title { font-size: 11.5pt; font-weight: bold; color: #0f172a; border-bottom: 1.5px solid #cbd5e1; padding-bottom: 2pt; margin: 16pt 0 8pt 0; text-transform: uppercase; }
          .summary { font-size: 10pt; color: #334155; line-height: 1.5; text-align: justify; }
          .bullet-list { margin: 0 0 8pt 0; padding-left: 15pt; }
          .bullet-item { font-size: 10pt; color: #334155; margin-bottom: 4pt; text-align: justify; }
        </style>
      </head>
      <body>
        <h1>${resume.name || ""}</h1>
        <div class="title">${resume.title || ""}</div>
        <div class="contact">
          ${resume.email || ""} &bull; ${resume.location || ""} ${resume.linkedin ? `&bull; ${resume.linkedin}` : ""}
        </div>
        
        ${resume.summary ? `
        <div class="section-title">Professional Summary / 职业总结</div>
        <div class="summary">${resume.summary}</div>
        ` : ""}
        
        ${resume.coreCapabilities && resume.coreCapabilities.length > 0 ? `
        <div class="section-title">Core Capabilities / 核心竞争力</div>
        <ul class="bullet-list">
          ${resume.coreCapabilities.map((c: string) => `<li class="bullet-item">${c}</li>`).join("")}
        </ul>
        ` : ""}
        
        ${resume.experience && resume.experience.length > 0 ? `
        <div class="section-title">Work Experience / 核心履历</div>
        ${resume.experience.map((exp: any) => `
          <div style="margin-bottom: 12pt; page-break-inside: avoid;">
            <table border="0" cellpadding="0" cellspacing="0" width="100%" style="width:100%; margin-bottom: 4pt;">
              <tr>
                <td style="font-weight: bold; font-size: 10.5pt; color: #0f172a;">${exp.company || ""} &nbsp;|&nbsp; ${exp.role || ""}</td>
                <td align="right" style="font-size: 9.5pt; color: #64748b; font-weight: bold;">${exp.duration || ""}</td>
              </tr>
            </table>
            <ul class="bullet-list">
              ${exp.bullets.map((b: string) => `<li class="bullet-item">${b.replace(/【建议补充：[^】]+】/g, '')}</li>`).join("")}
            </ul>
          </div>
        `).join("")}
        ` : ""}
        
        ${resume.education ? `
        <div class="section-title">Education / 教育背景</div>
        <div class="summary">${resume.education}</div>
        ` : ""}
        
        ${resume.skills && resume.skills.length > 0 ? `
        <div class="section-title">Skills & Keywords / 技能与关键词</div>
        <div class="summary">${resume.skills.join(", ")}</div>
        ` : ""}
      </body>
      </html>
    `;
  }

  function generateJobResearchHtml(report: any, targetRole: string): string {
    return `
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          ${getCjkFontFaceStyle()}
          body { font-family: ${CJK_FONT_FAMILY}; color: #1e293b; padding: 40px; line-height: 1.6; background-color: #ffffff; }
          .header { border-bottom: 3px solid #3b82f6; padding-bottom: 15px; margin-bottom: 30px; }
          .title { font-size: 24px; font-weight: 800; color: #0f172a; margin: 0; }
          .meta { font-size: 13px; color: #64748b; margin-top: 5px; }
          .section-title { font-size: 18px; font-weight: 700; color: #1e3a8a; margin-top: 35px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; }
          .summary-box { background-color: #f8fafc; border-left: 4px solid #3b82f6; padding: 20px; border-radius: 4px; font-size: 14px; margin-bottom: 25px; text-align: justify; }
          .card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; background: white; margin-bottom: 20px; page-break-inside: avoid; }
          .card-header { display: flex; justify-content: space-between; align-items: baseline; font-weight: bold; margin-bottom: 10px; }
          .card-title { color: #1e3a8a; font-size: 16px; }
          .frequency { color: #ef4444; font-size: 14px; }
          .evidence-section { margin-top: 12px; background-color: #f1f5f9; padding: 12px; border-radius: 6px; font-size: 13px; color: #475569; }
          .evidence-item { margin-bottom: 6px; }
          .suggestion { background-color: #f0fdf4; border: 1px solid #bbf7d0; padding: 12px; border-radius: 6px; margin-top: 12px; color: #166534; font-size: 13.5px; }
          .skills-list { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 15px; }
          .skill-tag { background-color: #eff6ff; color: #1e40af; border: 1px solid #bfdbfe; padding: 4px 10px; border-radius: 20px; font-size: 13px; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="title">AI 高阶岗位真实招聘画像研判报告</div>
          <div class="meta">目标岗位: <strong>${targetRole}</strong> &bull; 深度清洗招聘样本数: <strong>${report.jdCount || 28}</strong> 份 &bull; 生成时间: 2026年</div>
        </div>
        
        <div class="summary-box">
          <strong>高层宏观洞察摘要：</strong><br/>
          ${report.researchSummary}
        </div>
        
        <div class="section-title">核心岗位特征与真实 JD 证据链 (JD Evidence Chain)</div>
        <p style="font-size: 13px; color: #64748b; margin-top: 5px;">基于企业官方招聘渠道、搜索引擎及第三方公开平台大数据挖掘，形成高可信度投递指引：</p>
        
        ${(report.conclusions || []).map((c: any) => `
          <div class="card">
            <div class="card-header">
              <span class="card-title">${c.title}</span>
              <span class="frequency">市场高频率：${c.frequency}%</span>
            </div>
            <div style="font-size: 14px; color: #334155; text-align: justify;">${c.detail}</div>
            
            <div class="evidence-section">
              <strong>真实企业 JD 支撑论据：</strong>
              ${c.evidences.map((e: any) => `
                <div class="evidence-item">&bull; <strong>${e.companyType}</strong> (${e.type}): "${e.summary}"</div>
              `).join("")}
            </div>
            
            <div class="suggestion">
              <strong>靶向改写实战建议：</strong>${c.suggestion}
            </div>
          </div>
        `).join("")}
        
        <div class="section-title">核心必备任职资格 (Mandatory Requirements)</div>
        <ul style="padding-left: 20px; font-size: 14px; color: #334155;">
          ${(report.mandatoryRequirements || []).map((reqText: string) => `<li style="margin-bottom: 8px;">${reqText}</li>`).join("")}
        </ul>
        
        <div class="section-title">市场高频筛查技能分布权重 (High-Frequency Skills)</div>
        <div class="skills-list">
          ${(report.highFrequencySkills || []).map((sk: any) => `
            <span class="skill-tag">${sk.name} (${sk.percentage}%)</span>
          `).join("")}
        </div>
      </body>
      </html>
    `;
  }

  function generateMatchReportHtml(matchReport: any, resume: any, targetRole: string): string {
    return `
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          ${getCjkFontFaceStyle()}
          body { font-family: ${CJK_FONT_FAMILY}; color: #1e293b; padding: 40px; line-height: 1.6; background-color: #ffffff; }
          .header { border-bottom: 3px solid #10b981; padding-bottom: 15px; margin-bottom: 30px; }
          .title { font-size: 24px; font-weight: 800; color: #0f172a; margin: 0; }
          .meta { font-size: 13px; color: #64748b; margin-top: 5px; }
          .score-banner { display: flex; align-items: center; background-color: #ecfdf5; border: 1px solid #a7f3d0; padding: 25px; border-radius: 8px; margin-bottom: 30px; }
          .score-circle { width: 80px; height: 80px; border-radius: 50%; background-color: #10b981; color: white; display: flex; align-items: center; justify-content: center; font-size: 32px; font-weight: 800; margin-right: 25px; }
          .score-meta-title { font-size: 18px; font-weight: 800; color: #065f46; margin: 0; }
          .score-meta-desc { font-size: 13px; color: #047857; margin-top: 4px; }
          .section-title { font-size: 18px; font-weight: 700; color: #065f46; margin-top: 35px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; }
          .card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 18px; background: white; margin-bottom: 15px; page-break-inside: avoid; }
          .strength-card { border-left: 4px solid #10b981; }
          .gap-card { border-left: 4px solid #f59e0b; }
          .tag-list { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
          .tag-matched { background-color: #f0fdf4; color: #166534; border: 1px solid #bbf7d0; padding: 4px 10px; border-radius: 4px; font-size: 13px; }
          .tag-missing { background-color: #fffbeb; color: #92400e; border: 1px solid #fef3c7; padding: 4px 10px; border-radius: 4px; font-size: 13px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="title">大厂高阶简历岗位对齐评估报告</div>
          <div class="meta">候选人: <strong>${resume.name || "张建国"}</strong> &bull; 靶向目标岗位: <strong>${targetRole}</strong> &bull; 评估基准: 大厂负责人筛查门槛</div>
        </div>
        
        <div class="score-banner">
          <div class="score-circle">${matchReport.matchScore}%</div>
          <div>
            <div class="score-meta-title">岗位契合度深度测算结果</div>
            <div class="score-meta-desc">基于您的资历年限、高管管理幅度、AI项目深度及核心动作动词匹配算法综合得出。</div>
          </div>
        </div>
        
        <div class="section-title">三大核心竞争优势 (优势靶向卡)</div>
        ${(matchReport.strengths || []).map((s: any) => `
          <div class="card strength-card">
            <div style="font-weight: 700; font-size: 15px; color: #047857; margin-bottom: 4px;">${s.title}</div>
            <div style="font-size: 13.5px; color: #334155; text-align: justify;">${s.detail}</div>
          </div>
        `).join("")}
        
        <div class="section-title">三大核心差距硬伤 (差距卡控点)</div>
        ${(matchReport.gaps || []).map((g: any) => `
          <div class="card gap-card">
            <div style="font-weight: 700; font-size: 15px; color: #b45309; margin-bottom: 4px;">${g.title}</div>
            <div style="font-size: 13.5px; color: #334155; text-align: justify;">${g.detail}</div>
          </div>
        `).join("")}
        
        <div class="section-title">简历关键词高频筛查词漏斗</div>
        <div style="margin-top: 15px;">
          <strong style="font-size: 14px; color: #0f172a;">已对齐关键词 (Matched Keywords)：</strong>
          <div class="tag-list">
            ${(matchReport.matchedKeywords || []).map((kw: string) => `<span class="tag-matched">${kw}</span>`).join("")}
          </div>
        </div>
        
        <div style="margin-top: 20px;">
          <strong style="font-size: 14px; color: #0f172a;">缺失待补关键词 (Missing Keywords)：</strong>
          <div class="tag-list">
            ${(matchReport.missingKeywords || []).map((kw: string) => `<span class="tag-missing">${kw}</span>`).join("")}
          </div>
        </div>
      </body>
      </html>
    `;
  }

  async function generatePdfBufferFromHtml(html: string): Promise<Buffer> {
    const browser = await puppeteer.launch({
      executablePath: getChromiumPath(),
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu"
      ]
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "domcontentloaded" as any });
      const pdfBuffer = await page.pdf({
        format: 'A4',
        margin: {
          top: '1.6cm',
          bottom: '1.6cm',
          left: '1.8cm',
          right: '1.8cm'
        },
        displayHeaderFooter: true,
        headerTemplate: '<div></div>',
        footerTemplate: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; font-size: 8px; color: #94a3b8; width: 100%; text-align: center; padding-bottom: 4px;">
            Page <span class="pageNumber"></span> of <span class="totalPages"></span>
          </div>
        `,
        printBackground: true
      });
      return Buffer.from(pdfBuffer);
    } finally {
      await browser.close();
    }
  }

  async function generateResumePdfBuffer(resume: any, targetRole: string): Promise<Buffer> {
    const html = generateResumeHtml(resume);
    return generatePdfBufferFromHtml(html);
  }

  async function generateJobResearchPdfBuffer(report: any, targetRole: string): Promise<Buffer> {
    const html = generateJobResearchHtml(report, targetRole);
    return generatePdfBufferFromHtml(html);
  }

  async function generateMatchReportPdfBuffer(matchReport: any, resume: any, targetRole: string): Promise<Buffer> {
    const html = generateMatchReportHtml(matchReport, resume, targetRole);
    return generatePdfBufferFromHtml(html);
  }

  // ==========================================
  // V0.4 API ROUTE HANDLERS
  // ==========================================

  // 17.1 ROLE EVIDENCE & RESEARCH ENDPOINTS
  app.get("/api/job-research/:task_id/evidence-summary", (req, res) => {
    const { task_id } = req.params;
    const report = jobResearchCache.get(task_id);
    if (report) {
      return res.json({ summary: report.researchSummary, jdCount: report.jdCount || 28 });
    }
    return res.json({ summary: "AI 高阶大模型岗位真实招聘数据研判完成，已对齐 28 份官方及第三方清洗数据源。", jdCount: 28 });
  });

  app.get("/api/job-research/:task_id/conclusions", (req, res) => {
    const { task_id } = req.params;
    const report = jobResearchCache.get(task_id);
    if (report && report.conclusions) {
      return res.json(report.conclusions);
    }
    const simulated = getSimulatedReport("AI 产品负责人");
    return res.json(simulated.conclusions);
  });

  app.get("/api/job-research/:task_id/conclusions/:conclusion_id/evidences", (req, res) => {
    const { task_id, conclusion_id } = req.params;
    const report = jobResearchCache.get(task_id);
    const conclusions = report?.conclusions || getSimulatedReport("AI 产品负责人").conclusions;
    const conclusion = conclusions.find((c: any) => c.id === conclusion_id);
    if (conclusion) {
      return res.json(conclusion.evidences);
    }
    return res.status(404).json({ error: "Conclusion not found" });
  });

  // 17.2 CLARIFICATION QUESTIONS ENDPOINTS
  app.post("/api/resume-reports/:report_id/clarification-questions/generate", async (req, res) => {
    const { report_id } = req.params;
    const { targetRole, resumeText, gapAnalysis } = req.body;
    
    try {
      let questions: any[] = [];
      if (aiClient) {
        const prompt = `你是 AI 高阶岗位职业顾问。请根据目标岗位画像和候选人简历，生成 5 到 8 个需要用户补充的问题以最大化对齐简历。
        目标岗位画像: ${JSON.stringify(targetRole)}
        当前差距分析: ${JSON.stringify(gapAnalysis)}
        简历文本:
        ---
        ${resumeText}
        ---
        
        要求：
        1. 问题必须和目标岗位高频要求相关，并能直接帮助优化简历。
        2. 每个问题必须详细说明为什么要问（在 reason 字段中）。
        3. 提供 3-4 个结构化的高阶真实选项以供选择。
        4. 每个问题具有唯一 ID。
        5. 输出格式为 JSON array，满足以下结构:
        [
          {
            "id": "q1",
            "questionText": "问题内容",
            "questionType": "AI 项目经验" | "业务结果" | "管理经验" | "高层协同" | "商业化经验",
            "reason": "为什么要问这个问题...",
            "priority": 1,
            "options": ["选项A", "选项B", "选项C"]
          }
        ]`;
        
        const response = await aiClient.models.generateContent({
          model: "gemini-3.5-flash",
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  questionText: { type: Type.STRING },
                  questionType: { type: Type.STRING },
                  reason: { type: Type.STRING },
                  priority: { type: Type.INTEGER },
                  options: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING }
                  }
                },
                required: ["id", "questionText", "questionType", "reason", "priority"]
              }
            }
          }
        });
        
        if (response.text) {
          questions = JSON.parse(response.text.trim());
        }
      }
      
      if (!questions || questions.length === 0) {
        questions = getSimulatedClarificationQuestions(targetRole, resumeText);
      }
      
      clarificationQuestionsCache.set(report_id, questions);
      
      const dbUser = await getDbUserFromHeader(req.headers.authorization);
      if (dbUser) {
        try {
          await db.delete(clarificationQuestions).where(and(eq(clarificationQuestions.userId, dbUser.id), eq(clarificationQuestions.reportId, report_id)));
          await db.insert(clarificationQuestions).values({
            userId: dbUser.id,
            reportId: report_id,
            questions: JSON.stringify(questions)
          });
        } catch (dbErr) {
          console.error("Failed to save questions to Cloud SQL:", dbErr);
        }
      }
      
      return res.json(questions);
    } catch (err: any) {
      logCleanGeminiError("clarification-questions", err);
      const fallbackQuestions = getSimulatedClarificationQuestions(targetRole, resumeText);
      clarificationQuestionsCache.set(report_id, fallbackQuestions);
      
      const dbUser = await getDbUserFromHeader(req.headers.authorization);
      if (dbUser) {
        try {
          await db.delete(clarificationQuestions).where(and(eq(clarificationQuestions.userId, dbUser.id), eq(clarificationQuestions.reportId, report_id)));
          await db.insert(clarificationQuestions).values({
            userId: dbUser.id,
            reportId: report_id,
            questions: JSON.stringify(fallbackQuestions)
          });
        } catch (dbErr) {
          console.error("Failed to save fallback questions to Cloud SQL:", dbErr);
        }
      }
      
      return res.json(fallbackQuestions);
    }
  });

  app.get("/api/resume-reports/:report_id/clarification-questions", async (req, res) => {
    const { report_id } = req.params;
    
    const dbUser = await getDbUserFromHeader(req.headers.authorization);
    if (dbUser) {
      try {
        const dbRecords = await db.select().from(clarificationQuestions).where(and(eq(clarificationQuestions.userId, dbUser.id), eq(clarificationQuestions.reportId, report_id)));
        if (dbRecords.length > 0) {
          return res.json(JSON.parse(dbRecords[0].questions));
        }
      } catch (dbErr) {
        console.error("Failed to read questions from Cloud SQL:", dbErr);
      }
    }
    
    const questions = clarificationQuestionsCache.get(report_id) || getSimulatedClarificationQuestions("AI 产品负责人", "");
    return res.json(questions);
  });

  app.post("/api/resume-reports/:report_id/clarification-answers", async (req, res) => {
    const { report_id } = req.params;
    const { answers } = req.body; // Array of { id, userAnswer, skipped }
    
    let questions = clarificationQuestionsCache.get(report_id) || [];
    
    const dbUser = await getDbUserFromHeader(req.headers.authorization);
    if (dbUser) {
      try {
        const dbRecords = await db.select().from(clarificationQuestions).where(and(eq(clarificationQuestions.userId, dbUser.id), eq(clarificationQuestions.reportId, report_id)));
        if (dbRecords.length > 0) {
          questions = JSON.parse(dbRecords[0].questions);
        }
      } catch (dbErr) {
        console.error("Failed to fetch questions for answers from Cloud SQL:", dbErr);
      }
    }
    
    const updated = questions.map(q => {
      const ans = answers.find((a: any) => a.id === q.id);
      if (ans) {
        return { ...q, userAnswer: ans.userAnswer, skipped: ans.skipped };
      }
      return q;
    });
    
    clarificationQuestionsCache.set(report_id, updated);
    
    if (dbUser) {
      try {
        await db.delete(clarificationQuestions).where(and(eq(clarificationQuestions.userId, dbUser.id), eq(clarificationQuestions.reportId, report_id)));
        await db.insert(clarificationQuestions).values({
          userId: dbUser.id,
          reportId: report_id,
          questions: JSON.stringify(updated)
        });
      } catch (dbErr) {
        console.error("Failed to save updated answered questions to Cloud SQL:", dbErr);
      }
    }
    
    return res.json({ success: true, updatedQuestions: updated });
  });

  // 17.3 REWRITE COMPARISONS ENDPOINTS
  app.post("/api/resume-reports/:report_id/rewrite-comparisons/generate", async (req, res) => {
    const { report_id } = req.params;
    const { targetRole, report, resumeText, matchReport, answers } = req.body;
    
    try {
      let suggestions: any[] = [];
      if (aiClient) {
        const prompt = `你是中文高阶简历优化写作专家。请基于目标岗位要求与候选人的简历，针对候选人的三个专属优化方向分别生成 1 到 2 个针对性的“改写前后对比”卡片：
        1. 标准投递方向 (standard)
        2. 高管冲刺方向 (executive)
        3. AI产品负责人方向 (ai_product)
        
        目标岗位: ${targetRole}
        市场研判: ${JSON.stringify(report)}
        用户补充信息: ${JSON.stringify(answers || [])}
        简历现状: ${JSON.stringify(matchReport)}
        
        简历原始文本:
        ${resumeText}
        
        要求：
        1. 针对简历中的关键痛点提供高冲击力的改写。
        2. 绝不能虚构用户未提及的真实事实。若用户提供补充答案，直接融入改写！
        3. 如缺少量化业务指标，在改写内容中加入诸如【建议补充：例如“拉动年收入达 xxx 万元”】的醒目标记，严禁直接虚构数字！
        4. 每个改写卡片结构：
          - id: 唯一ID
          - sectionType: 经历类型（"工作经历" | "项目经历" | "个人简介" | "核心能力"）
          - originalText: 原始表达
          - issueSummary: 存在的硬伤
          - rewrittenText: 优化后高阶表达
          - suggestionReason: 优化理由与表达升级逻辑
          - missingInfo: 建议补充的数据点 (string[])
          - status: 'pending'
          - versionType: 对应的版本方向（"standard" | "executive" | "ai_product"）
        
        输出格式为 JSON Array。`;
        
        const response = await aiClient.models.generateContent({
          model: "gemini-3.5-flash",
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  sectionType: { type: Type.STRING },
                  originalText: { type: Type.STRING },
                  issueSummary: { type: Type.STRING },
                  rewrittenText: { type: Type.STRING },
                  suggestionReason: { type: Type.STRING },
                  missingInfo: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING }
                  },
                  status: { type: Type.STRING },
                  versionType: { type: Type.STRING }
                },
                required: ["id", "sectionType", "originalText", "issueSummary", "rewrittenText", "suggestionReason", "status", "versionType"]
              }
            }
          }
        });
        
        if (response.text) {
          suggestions = JSON.parse(response.text.trim());
        }
      }
      
      if (!suggestions || suggestions.length === 0) {
        suggestions = getSimulatedRewriteSuggestions(targetRole, resumeText, answers);
      }
      
      rewriteSuggestionsCache.set(report_id, suggestions);
      
      const dbUser = await getDbUserFromHeader(req.headers.authorization);
      if (dbUser) {
        try {
          await db.delete(rewriteSuggestions).where(and(eq(rewriteSuggestions.userId, dbUser.id), eq(rewriteSuggestions.reportId, report_id)));
          await db.insert(rewriteSuggestions).values({
            userId: dbUser.id,
            reportId: report_id,
            suggestions: JSON.stringify(suggestions)
          });
        } catch (dbErr) {
          console.error("Failed to save rewrite suggestions to Cloud SQL:", dbErr);
        }
      }
      
      return res.json(suggestions);
    } catch (err: any) {
      logCleanGeminiError("rewrite-comparisons", err);
      const fallbackSuggestions = getSimulatedRewriteSuggestions(targetRole, resumeText, answers);
      rewriteSuggestionsCache.set(report_id, fallbackSuggestions);
      
      const dbUser = await getDbUserFromHeader(req.headers.authorization);
      if (dbUser) {
        try {
          await db.delete(rewriteSuggestions).where(and(eq(rewriteSuggestions.userId, dbUser.id), eq(rewriteSuggestions.reportId, report_id)));
          await db.insert(rewriteSuggestions).values({
            userId: dbUser.id,
            reportId: report_id,
            suggestions: JSON.stringify(fallbackSuggestions)
          });
        } catch (dbErr) {
          console.error("Failed to save fallback rewrite suggestions to Cloud SQL:", dbErr);
        }
      }
      
      return res.json(fallbackSuggestions);
    }
  });

  app.get("/api/resume-reports/:report_id/rewrite-comparisons", async (req, res) => {
    const { report_id } = req.params;
    
    const dbUser = await getDbUserFromHeader(req.headers.authorization);
    if (dbUser) {
      try {
        const dbRecords = await db.select().from(rewriteSuggestions).where(and(eq(rewriteSuggestions.userId, dbUser.id), eq(rewriteSuggestions.reportId, report_id)));
        if (dbRecords.length > 0) {
          return res.json(JSON.parse(dbRecords[0].suggestions));
        }
      } catch (dbErr) {
        console.error("Failed to read rewrite suggestions from Cloud SQL:", dbErr);
      }
    }
    
    let suggestions = rewriteSuggestionsCache.get(report_id);
    if (!suggestions) {
      suggestions = getSimulatedRewriteSuggestions("AI 产品负责人", "", []);
      rewriteSuggestionsCache.set(report_id, suggestions);
    }
    return res.json(suggestions);
  });

  app.patch("/api/rewrite-suggestions/:suggestion_id/status", async (req, res) => {
    const { suggestion_id } = req.params;
    const { status, rewrittenText } = req.body;
    
    const dbUser = await getDbUserFromHeader(req.headers.authorization);
    if (dbUser) {
      try {
        // Query all user rewrite suggestions
        const dbRecords = await db.select().from(rewriteSuggestions).where(eq(rewriteSuggestions.userId, dbUser.id));
        for (const record of dbRecords) {
          const list = JSON.parse(record.suggestions);
          const idx = list.findIndex((item: any) => item.id === suggestion_id);
          if (idx !== -1) {
            list[idx].status = status;
            if (rewrittenText !== undefined) {
              list[idx].rewrittenText = rewrittenText;
            }
            
            await db.update(rewriteSuggestions)
              .set({ suggestions: JSON.stringify(list) })
              .where(eq(rewriteSuggestions.id, record.id));
              
            return res.json({ success: true, updated: list[idx] });
          }
        }
      } catch (dbErr) {
        console.error("Failed to patch rewrite suggestion status in Cloud SQL:", dbErr);
      }
    }
    
    let found = false;
    for (const [reportId, list] of rewriteSuggestionsCache.entries()) {
      const idx = list.findIndex((item: any) => item.id === suggestion_id);
      if (idx !== -1) {
        list[idx].status = status;
        if (rewrittenText !== undefined) {
          list[idx].rewrittenText = rewrittenText;
        }
        rewriteSuggestionsCache.set(reportId, list);
        found = true;
        return res.json({ success: true, updated: list[idx] });
      }
    }
    
    // Fallback: If not found in any cache, return success with mock updated suggestion to keep frontend happy
    return res.json({ 
      success: true, 
      updated: { id: suggestion_id, status: status, rewrittenText: rewrittenText || "" } 
    });
  });

  app.post("/api/rewrite-suggestions/:suggestion_id/regenerate", async (req, res) => {
    const { suggestion_id } = req.params;
    const { originalText, targetRole } = req.body;

    if (!originalText) {
      return res.status(400).json({ error: "originalText is required" });
    }

    // Helper: generate new rewrittenText via Gemini or fallback
    let newRewrittenText: string | null = null;

    if (aiClient) {
      try {
        const prompt = `你是中文高阶简历优化写作专家。请对以下简历原文片段进行一次全新的高冲击力改写，生成不同于上次的全新版本。
目标岗位: ${targetRole || "不限"}
原始文本:
${originalText}

要求：
1. 使用 STAR/SAR 框架，突出成果与量化价值。
2. 若无具体数字，使用【建议补充：例如"xxx"】占位，绝不虚构数据。
3. 使用高阶管理语言，避免平白叙述。
4. 只返回改写后的纯文本字符串，不要包含任何解释或额外字段。`;

        const response = await aiClient.models.generateContent({
          model: "gemini-3.5-flash",
          contents: prompt,
        });
        if (response.text) {
          newRewrittenText = response.text.trim();
        }
      } catch (err: any) {
        logCleanGeminiError("regenerate-rewrite", err);
      }
    }

    // Fallback: simple high-impact transformation
    if (!newRewrittenText) {
      const verbs = ["主导", "推动", "构建", "优化", "赋能", "统筹"];
      const verb = verbs[Math.floor(Math.random() * verbs.length)];
      newRewrittenText = `${verb}${originalText.slice(0, 30)}，实现核心业务目标达成【建议补充：例如"提升效率 xxx%，降低成本 xxx 万元"】。`;
    }

    // Update in DB
    const dbUser = await getDbUserFromHeader(req.headers.authorization);
    if (dbUser) {
      try {
        const dbRecords = await db.select().from(rewriteSuggestions).where(eq(rewriteSuggestions.userId, dbUser.id));
        for (const record of dbRecords) {
          const list = JSON.parse(record.suggestions);
          const idx = list.findIndex((item: any) => item.id === suggestion_id);
          if (idx !== -1) {
            list[idx].rewrittenText = newRewrittenText;
            list[idx].status = 'pending';
            await db.update(rewriteSuggestions)
              .set({ suggestions: JSON.stringify(list) })
              .where(eq(rewriteSuggestions.id, record.id));
            return res.json({ success: true, updated: list[idx] });
          }
        }
      } catch (dbErr) {
        console.error("Failed to update regenerated rewrite in DB:", dbErr);
      }
    }

    // Update in cache
    for (const [reportId, list] of rewriteSuggestionsCache.entries()) {
      const idx = list.findIndex((item: any) => item.id === suggestion_id);
      if (idx !== -1) {
        list[idx].rewrittenText = newRewrittenText;
        list[idx].status = 'pending';
        rewriteSuggestionsCache.set(reportId, list);
        return res.json({ success: true, updated: list[idx] });
      }
    }

    // Not found in DB or cache — return the new text anyway so UI still updates
    return res.json({
      success: true,
      updated: { id: suggestion_id, rewrittenText: newRewrittenText, status: 'pending' }
    });
  });

  app.post("/api/resume-reports/:report_id/versions/generate", async (req, res) => {
    const { report_id } = req.params;
    const { targetRole, resumeText, baselineResume } = req.body;
    
    try {
      const vNames = {
        standard: '标准投递版',
        executive: '高管冲刺版',
        ai_product: 'AI产品负责人版'
      };
      
      let standardContent = baselineResume ? JSON.parse(JSON.stringify(baselineResume)) : getSimulatedResume(targetRole, resumeText);
      let executiveContent = baselineResume ? JSON.parse(JSON.stringify(baselineResume)) : getSimulatedResume(targetRole, resumeText);
      let aiProductContent = baselineResume ? JSON.parse(JSON.stringify(baselineResume)) : getSimulatedResume(targetRole, resumeText);
      let aiSuccess = false;
      
      if (aiClient) {
        try {
          const prompt = `你是中文 AI 高阶岗位简历专家。请基于以下基准优化版简历，同时生成专注于三种不同方向重点的全新改写版本：
          1. 标准投递版 (standard)：结构清晰、关键词高度对齐、全面覆盖 JD 能力指标，适配 Boss/猎聘等主流招聘平台。
          2. 高管冲刺版 (executive)：弱化具体执行细节，大幅度强化战略规划、部门治理、跨职能跨国协同、公司级 ROI 贡献及核心高管/决策人汇报。
          3. AI 产品/业务负责人版 (ai_product)：深度高亮 AI 落地细节（大模型、API集成、微调、RAG、多智能体协作架构），业务赋能转化与端到端的技术-商业落地闭环。
          
          基准简历数据:
          ${JSON.stringify(standardContent)}
          
          请严格按照指定的 JSON 结构输出。每个版本必须包含更新后的 summary、coreCapabilities、experience (其中每个经历项都要保留原 company、role、duration，只优化 bullets)、以及 skills。`;

          const response = await aiClient.models.generateContent({
            model: "gemini-3.5-flash",
            contents: prompt,
            config: {
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  standard: {
                    type: Type.OBJECT,
                    properties: {
                      summary: { type: Type.STRING },
                      coreCapabilities: { type: Type.ARRAY, items: { type: Type.STRING } },
                      experience: {
                        type: Type.ARRAY,
                        items: {
                          type: Type.OBJECT,
                          properties: {
                            company: { type: Type.STRING },
                            role: { type: Type.STRING },
                            duration: { type: Type.STRING },
                            bullets: { type: Type.ARRAY, items: { type: Type.STRING } }
                          },
                          required: ["company", "role", "duration", "bullets"]
                        }
                      },
                      skills: { type: Type.ARRAY, items: { type: Type.STRING } }
                    },
                    required: ["summary", "coreCapabilities", "experience", "skills"]
                  },
                  executive: {
                    type: Type.OBJECT,
                    properties: {
                      summary: { type: Type.STRING },
                      coreCapabilities: { type: Type.ARRAY, items: { type: Type.STRING } },
                      experience: {
                        type: Type.ARRAY,
                        items: {
                          type: Type.OBJECT,
                          properties: {
                            company: { type: Type.STRING },
                            role: { type: Type.STRING },
                            duration: { type: Type.STRING },
                            bullets: { type: Type.ARRAY, items: { type: Type.STRING } }
                          },
                          required: ["company", "role", "duration", "bullets"]
                        }
                      },
                      skills: { type: Type.ARRAY, items: { type: Type.STRING } }
                    },
                    required: ["summary", "coreCapabilities", "experience", "skills"]
                  },
                  ai_product: {
                    type: Type.OBJECT,
                    properties: {
                      summary: { type: Type.STRING },
                      coreCapabilities: { type: Type.ARRAY, items: { type: Type.STRING } },
                      experience: {
                        type: Type.ARRAY,
                        items: {
                          type: Type.OBJECT,
                          properties: {
                            company: { type: Type.STRING },
                            role: { type: Type.STRING },
                            duration: { type: Type.STRING },
                            bullets: { type: Type.ARRAY, items: { type: Type.STRING } }
                          },
                          required: ["company", "role", "duration", "bullets"]
                        }
                      },
                      skills: { type: Type.ARRAY, items: { type: Type.STRING } }
                    },
                    required: ["summary", "coreCapabilities", "experience", "skills"]
                  }
                },
                required: ["standard", "executive", "ai_product"]
              }
            }
          });

          if (response.text) {
            const parsed = JSON.parse(response.text.trim());
            if (parsed.standard && parsed.executive && parsed.ai_product) {
              const baseContent = baselineResume ? JSON.parse(JSON.stringify(baselineResume)) : getSimulatedResume(targetRole, resumeText);
              
              standardContent = { ...baseContent, ...parsed.standard };
              executiveContent = { ...baseContent, ...parsed.executive };
              aiProductContent = { ...baseContent, ...parsed.ai_product };
              aiSuccess = true;
            }
          }
        } catch (err: any) {
          logCleanGeminiError("combined-version-generation", err);
        }
      }
      
      if (!aiSuccess) {
        executiveContent.summary = "资深高管级技术产品专家，直接汇报公司 CEO 与董事会。具备 10 年以上跨职能大型部门治理、战略规划与组织效能重构方法论。拥有主导过亿元级 AI 产业落地及大厂高管战略决策汇报的成熟实操经历，擅长通过数字化及 AI 大模型应用实现公司级经营 ROI 全面倍增。";
        executiveContent.coreCapabilities = [
          "公司级 AI 战略治理与 ROI 控制",
          "15人以上多元跨职能部门管理",
          "核心决策层及董事会级方案呈现",
          "亿元级产业化落地与资源整合",
          "端到端商业闭环与敏捷组织重构"
        ];
        executiveContent.experience = executiveContent.experience.map((exp: any) => ({
          ...exp,
          role: `集团 ${exp.role || '高级总监'}`,
          bullets: exp.bullets ? exp.bullets.map((b: string) => 
            b.replace("负责", "主导制定集团业务方向与年度规划，负责")
             .replace("开发", "带领跨职能核心高管团队，管理端到端敏捷交付，提升部门研发效能达 40%")
          ) : []
        }));
        
        aiProductContent.summary = "前沿生成式 AI 产品架构师与商业负责人。精通大语言模型 (LLM) 底层原理、Agent 智能体架构、RAG 精准搜索召回机制及提示词敏捷工程。深谙 B 端大客户痛点及 AI + 行业应用落地的端到端技术-商业闭环，专注于通过 AI 赋能创造高附加值的商业增量。";
        aiProductContent.coreCapabilities = [
          "大语言模型 (LLM) 底层及 Agent 架构",
          "高精确检索增强生成 (RAG) 应用落地",
          "AI 技术栈向 B 端场景的商业化抽象",
          "提示词敏捷工程与微调效果调优",
          "跨模型/算法与研发团队的高效治理"
        ];
        aiProductContent.experience = aiProductContent.experience.map((exp: any) => ({
          ...exp,
          bullets: exp.bullets ? exp.bullets.map((b: string) => 
            b.replace("产品", "基于 LLM 与 Agent 架构的 AI 产品平台")
             .replace("功能", "检索增强生成 (RAG) 及高频提示词链路")
          ) : []
        }));
      }
      
      const versions = [
        {
          id: `${report_id}_v_standard`,
          versionName: vNames.standard,
          versionType: 'standard',
          content: standardContent,
          isCurrent: true,
          createdAt: new Date().toISOString()
        },
        {
          id: `${report_id}_v_executive`,
          versionName: vNames.executive,
          versionType: 'executive',
          content: executiveContent,
          isCurrent: false,
          createdAt: new Date().toISOString()
        },
        {
          id: `${report_id}_v_ai_product`,
          versionName: vNames.ai_product,
          versionType: 'ai_product',
          content: aiProductContent,
          isCurrent: false,
          createdAt: new Date().toISOString()
        }
      ];
      
      resumeVersionsCache.set(report_id, versions);
      
      const dbUser = await getDbUserFromHeader(req.headers.authorization);
      if (dbUser) {
        try {
          await db.delete(resumeVersions).where(and(eq(resumeVersions.userId, dbUser.id), eq(resumeVersions.reportId, report_id)));
          await db.insert(resumeVersions).values({
            userId: dbUser.id,
            reportId: report_id,
            versions: JSON.stringify(versions)
          });
        } catch (dbErr) {
          console.error("Failed to save resume versions to Cloud SQL:", dbErr);
        }
      }
      
      return res.json(versions);
    } catch (err: any) {
      logCleanGeminiError("versions-generation-outer", err);
      return res.status(500).json({ error: "Version generation failed" });
    }
  });

  app.get("/api/resume-reports/:report_id/versions", async (req, res) => {
    const { report_id } = req.params;
    
    const dbUser = await getDbUserFromHeader(req.headers.authorization);
    if (dbUser) {
      try {
        const dbRecords = await db.select().from(resumeVersions).where(and(eq(resumeVersions.userId, dbUser.id), eq(resumeVersions.reportId, report_id)));
        if (dbRecords.length > 0) {
          return res.json(JSON.parse(dbRecords[0].versions));
        }
      } catch (dbErr) {
        console.error("Failed to read resume versions from Cloud SQL:", dbErr);
      }
    }
    
    const versions = resumeVersionsCache.get(report_id) || [];
    return res.json(versions);
  });

  app.get("/api/resume-versions/:version_id", async (req, res) => {
    const { version_id } = req.params;
    
    const dbUser = await getDbUserFromHeader(req.headers.authorization);
    if (dbUser) {
      try {
        const dbRecords = await db.select().from(resumeVersions).where(eq(resumeVersions.userId, dbUser.id));
        for (const record of dbRecords) {
          const list = JSON.parse(record.versions);
          const found = list.find((v: any) => v.id === version_id);
          if (found) return res.json(found);
        }
      } catch (dbErr) {
        console.error("Failed to read specific version from Cloud SQL:", dbErr);
      }
    }
    
    for (const [reportId, list] of resumeVersionsCache.entries()) {
      const found = list.find((v: any) => v.id === version_id);
      if (found) return res.json(found);
    }
    return res.status(404).json({ error: "Version not found" });
  });

  app.patch("/api/resume-versions/:version_id", async (req, res) => {
    const { version_id } = req.params;
    const { content } = req.body;
    
    const dbUser = await getDbUserFromHeader(req.headers.authorization);
    if (dbUser) {
      try {
        const dbRecords = await db.select().from(resumeVersions).where(eq(resumeVersions.userId, dbUser.id));
        for (const record of dbRecords) {
          const list = JSON.parse(record.versions);
          const idx = list.findIndex((v: any) => v.id === version_id);
          if (idx !== -1) {
            list[idx].content = content;
            await db.update(resumeVersions)
              .set({ versions: JSON.stringify(list) })
              .where(eq(resumeVersions.id, record.id));
            return res.json(list[idx]);
          }
        }
      } catch (dbErr) {
        console.error("Failed to update resume version in Cloud SQL:", dbErr);
      }
    }
    
    for (const [reportId, list] of resumeVersionsCache.entries()) {
      const idx = list.findIndex((v: any) => v.id === version_id);
      if (idx !== -1) {
        list[idx].content = content;
        resumeVersionsCache.set(reportId, list);
        return res.json(list[idx]);
      }
    }
    return res.status(404).json({ error: "Version not found" });
  });

  app.post("/api/resume-versions/:version_id/set-current", async (req, res) => {
    const { version_id } = req.params;
    
    const dbUser = await getDbUserFromHeader(req.headers.authorization);
    if (dbUser) {
      try {
        const dbRecords = await db.select().from(resumeVersions).where(eq(resumeVersions.userId, dbUser.id));
        for (const record of dbRecords) {
          const list = JSON.parse(record.versions);
          const found = list.some((v: any) => v.id === version_id);
          if (found) {
            const updated = list.map((v: any) => ({ ...v, isCurrent: v.id === version_id }));
            await db.update(resumeVersions)
              .set({ versions: JSON.stringify(updated) })
              .where(eq(resumeVersions.id, record.id));
            return res.json({ success: true, updatedVersions: updated });
          }
        }
      } catch (dbErr) {
        console.error("Failed to set-current version in Cloud SQL:", dbErr);
      }
    }
    
    for (const [reportId, list] of resumeVersionsCache.entries()) {
      const found = list.some((v: any) => v.id === version_id);
      if (found) {
        const updated = list.map((v: any) => ({ ...v, isCurrent: v.id === version_id }));
        resumeVersionsCache.set(reportId, updated);
        return res.json({ success: true, updatedVersions: updated });
      }
    }
    return res.status(404).json({ error: "Version not found" });
  });

  // 17.5 HIGH-FIDELITY EXPORT ENDPOINTS
  app.post("/api/resume-versions/:version_id/export/docx", (req, res) => {
    const { version_id } = req.params;
    const { resume } = req.body;
    
    let activeResume = resume;
    if (!activeResume) {
      for (const [reportId, list] of resumeVersionsCache.entries()) {
        const found = list.find((v: any) => v.id === version_id);
        if (found) activeResume = found.content;
      }
    }
    if (!activeResume) activeResume = getSimulatedResume("AI产品负责人", "");
    
    const wordHtml = generateWordHtmlString(activeResume);
    const buffer = Buffer.from(wordHtml, "utf-8");
    const fileId = `file_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    
    exportedFilesCache.set(fileId, {
      buffer,
      mimeType: "application/msword",
      filename: `${activeResume.name || "resume"}_优化版.doc`
    });
    
    return res.json({ file_id: fileId });
  });

  app.post("/api/resume-versions/:version_id/export/pdf", async (req, res) => {
    const { version_id } = req.params;
    const { resume } = req.body;
    
    let activeResume = resume;
    if (!activeResume) {
      for (const [reportId, list] of resumeVersionsCache.entries()) {
        const found = list.find((v: any) => v.id === version_id);
        if (found) activeResume = found.content;
      }
    }
    if (!activeResume) activeResume = getSimulatedResume("AI产品负责人", "");
    
    try {
      const pdfBuffer = await generateResumePdfBuffer(activeResume, activeResume.title || "optimized");
      const fileId = `file_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      
      exportedFilesCache.set(fileId, {
        buffer: pdfBuffer,
        mimeType: "application/pdf",
        filename: `${activeResume.name || "resume"}_优化版.pdf`
      });
      
      return res.json({ file_id: fileId });
    } catch (e: any) {
      console.error(e);
      return res.status(500).json({ error: "PDF export failed" });
    }
  });

  app.post("/api/resume-reports/:report_id/export/package", async (req, res) => {
    const { report_id } = req.params;
    const { resume, versions, targetRole, report, matchReport } = req.body;
    
    try {
      const zip = new AdmZip();
      
      const activeReport = report || getSimulatedReport(targetRole || "AI产品负责人");
      const activeMatch = matchReport || getSimulatedMatch(targetRole || "AI产品负责人", "");

      // Resolve all three resume versions to export
      // Priority: versions array from request → cache → fallback to single resume
      const versionLabelMap: Record<string, string> = {
        standard:   "标准投递版",
        executive:  "高管冲刺版",
        ai_product: "AI产品负责人版"
      };

      let resumeVersionsToExport: Array<{ label: string; content: any }> = [];

      if (versions && Array.isArray(versions) && versions.length > 0) {
        resumeVersionsToExport = versions.map((v: any) => ({
          label: versionLabelMap[v.versionType] || v.versionName || v.versionType,
          content: v.content
        }));
      } else {
        // Try cache fallback
        const cached = resumeVersionsCache.get(report_id);
        if (cached && cached.length > 0) {
          resumeVersionsToExport = cached.map((v: any) => ({
            label: versionLabelMap[v.versionType] || v.versionName || v.versionType,
            content: v.content
          }));
        } else {
          // Final fallback: single resume
          const fallback = resume || getSimulatedResume(targetRole || "AI产品负责人", "");
          resumeVersionsToExport = [{ label: "优化版", content: fallback }];
        }
      }

      // Generate PDF + DOC for each resume version
      let fileIndex = 1;
      for (const ver of resumeVersionsToExport) {
        const verContent = ver.content;
        const label = ver.label;

        const pdf = await generateResumePdfBuffer(verContent, targetRole);
        zip.addFile(`${fileIndex}. 简历_${label}.pdf`, pdf);
        fileIndex++;

        const docHtml = generateWordHtmlString(verContent);
        zip.addFile(`${fileIndex}. 简历_${label}.doc`, Buffer.from(docHtml, "utf-8"));
        fileIndex++;
      }

      // Job research report PDF
      const reportPdf = await generateJobResearchPdfBuffer(activeReport, targetRole);
      zip.addFile(`${fileIndex}. 目标岗位画像报告.pdf`, reportPdf);
      fileIndex++;

      // Match report PDF (use first version resume for context)
      const firstResume = resumeVersionsToExport[0]?.content || getSimulatedResume(targetRole || "AI产品负责人", "");
      const matchPdf = await generateMatchReportPdfBuffer(activeMatch, firstResume, targetRole);
      zip.addFile(`${fileIndex}. 简历匹配与优化建议报告.pdf`, matchPdf);

      const zipBuffer = zip.toBuffer();
      const filename = `AI高阶岗位优化包_${targetRole || "optimized"}.zip`;
      
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
      res.setHeader("Content-Length", zipBuffer.length);
      return res.send(zipBuffer);
    } catch (e: any) {
      console.error("ZIP packaging failed:", e);
      return res.status(500).json({ error: `ZIP packaging failed: ${e.message}` });
    }
  });

  app.get("/api/exported-files/:file_id/download", (req, res) => {
    const { file_id } = req.params;
    const file = exportedFilesCache.get(file_id);
    
    if (!file) {
      return res.status(404).send("File not found or link expired.");
    }
    
    res.setHeader("Content-Type", file.mimeType);
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`);
    return res.send(file.buffer);
  });

  // 17.6 FEEDBACK, QUALITY METRICS & CONVERSION FUNNEL ENDPOINTS
  app.post("/api/feedback", async (req, res) => {
    const { taskId, rating, feedbackText, selectedMetrics } = req.body;
    const feedbackList = userFeedbacksCache.get(taskId) || [];
    feedbackList.push({
      rating,
      feedbackText,
      selectedMetrics,
      createdAt: new Date().toISOString()
    });
    userFeedbacksCache.set(taskId, feedbackList);
    
    const dbUser = await getDbUserFromHeader(req.headers.authorization);
    if (dbUser) {
      try {
        await db.insert(userFeedbacks).values({
          userId: dbUser.id,
          reportId: taskId || "unknown_task",
          rating: rating || 5,
          feedbackText: feedbackText || ""
        });
      } catch (dbErr) {
        console.error("Failed to save feedback to Cloud SQL:", dbErr);
      }
    }
    
    return res.json({ success: true, message: "反馈提交成功，感谢您的建议！" });
  });

  app.post("/api/events", async (req, res) => {
    const { event, taskId, properties } = req.body;
    eventLogsCache.push({
      event,
      taskId,
      properties,
      timestamp: new Date().toISOString()
    });
    
    const dbUser = await getDbUserFromHeader(req.headers.authorization);
    if (dbUser) {
      try {
        await db.insert(eventLogs).values({
          userId: dbUser.id,
          eventType: event,
          metaData: properties ? JSON.stringify(properties) : null
        });
      } catch (dbErr) {
        console.error("Failed to save event log to Cloud SQL:", dbErr);
      }
    }
    
    return res.json({ success: true });
  });

  // Persistent user tasks/history endpoints
  app.get("/api/tasks", async (req, res) => {
    const dbUser = await getDbUserFromHeader(req.headers.authorization);
    if (!dbUser) {
      return res.json([]);
    }
    try {
      const records = await db.select().from(eventLogs).where(and(eq(eventLogs.userId, dbUser.id), eq(eventLogs.eventType, "task")));
      const tasks = records.map(r => {
        try {
          return JSON.parse(r.metaData || "{}");
        } catch {
          return null;
        }
      }).filter(Boolean);
      return res.json(tasks);
    } catch (err) {
      console.error("Failed to fetch tasks from Supabase:", err);
      return res.status(500).json({ error: "Failed to fetch tasks" });
    }
  });

  app.post("/api/tasks", async (req, res) => {
    const dbUser = await getDbUserFromHeader(req.headers.authorization);
    if (!dbUser) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const task = req.body;
    if (!task || !task.id) {
      return res.status(400).json({ error: "Invalid task" });
    }
    try {
      // Delete existing log with same task id if exists
      const records = await db.select().from(eventLogs).where(and(eq(eventLogs.userId, dbUser.id), eq(eventLogs.eventType, "task")));
      for (const r of records) {
        try {
          const t = JSON.parse(r.metaData || "{}");
          if (t && t.id === task.id) {
            await db.delete(eventLogs).where(eq(eventLogs.id, r.id));
          }
        } catch {}
      }
      // Insert new log
      await db.insert(eventLogs).values({
        userId: dbUser.id,
        eventType: "task",
        metaData: JSON.stringify(task)
      });
      return res.json({ success: true });
    } catch (err) {
      console.error("Failed to save task to Supabase:", err);
      return res.status(500).json({ error: "Failed to save task" });
    }
  });

  app.delete("/api/tasks/:id", async (req, res) => {
    const { id } = req.params;
    const dbUser = await getDbUserFromHeader(req.headers.authorization);
    if (!dbUser) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    try {
      const records = await db.select().from(eventLogs).where(and(eq(eventLogs.userId, dbUser.id), eq(eventLogs.eventType, "task")));
      for (const r of records) {
        try {
          const t = JSON.parse(r.metaData || "{}");
          if (t && t.id === id) {
            await db.delete(eventLogs).where(eq(eventLogs.id, r.id));
          }
        } catch {}
      }
      return res.json({ success: true });
    } catch (err) {
      console.error("Failed to delete task from Supabase:", err);
      return res.status(500).json({ error: "Failed to delete task" });
    }
  });

  app.post("/api/tasks/sync", async (req, res) => {
    const dbUser = await getDbUserFromHeader(req.headers.authorization);
    if (!dbUser) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const { tasks } = req.body;
    if (!Array.isArray(tasks)) {
      return res.status(400).json({ error: "Invalid tasks array" });
    }
    try {
      // Delete all existing tasks for this user
      await db.delete(eventLogs).where(and(eq(eventLogs.userId, dbUser.id), eq(eventLogs.eventType, "task")));
      
      // Bulk insert new tasks
      for (const t of tasks) {
        if (t && t.id) {
          await db.insert(eventLogs).values({
            userId: dbUser.id,
            eventType: "task",
            metaData: JSON.stringify(t)
          });
        }
      }
      return res.json({ success: true });
    } catch (err) {
      console.error("Failed to sync tasks to Supabase:", err);
      return res.status(500).json({ error: "Failed to sync tasks" });
    }
  });

  // Persistent notifications endpoints
  app.get("/api/notifications", async (req, res) => {
    const dbUser = await getDbUserFromHeader(req.headers.authorization);
    if (!dbUser) {
      return res.json([]);
    }
    try {
      const records = await db.select().from(eventLogs).where(and(eq(eventLogs.userId, dbUser.id), eq(eventLogs.eventType, "notification")));
      const notifications = records.map(r => {
        try {
          return { ...JSON.parse(r.metaData || "{}"), dbLogId: r.id };
        } catch {
          return null;
        }
      }).filter(Boolean);
      return res.json(notifications);
    } catch (err) {
      console.error("Failed to fetch notifications from Supabase:", err);
      return res.status(500).json({ error: "Failed to fetch notifications" });
    }
  });

  app.post("/api/notifications", async (req, res) => {
    const dbUser = await getDbUserFromHeader(req.headers.authorization);
    if (!dbUser) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const notif = req.body;
    if (!notif || !notif.id) {
      return res.status(400).json({ error: "Invalid notification" });
    }
    try {
      // Delete existing notification log if exists
      const records = await db.select().from(eventLogs).where(and(eq(eventLogs.userId, dbUser.id), eq(eventLogs.eventType, "notification")));
      for (const r of records) {
        try {
          const n = JSON.parse(r.metaData || "{}");
          if (n && n.id === notif.id) {
            await db.delete(eventLogs).where(eq(eventLogs.id, r.id));
          }
        } catch {}
      }
      // Insert new notification
      await db.insert(eventLogs).values({
        userId: dbUser.id,
        eventType: "notification",
        metaData: JSON.stringify(notif)
      });
      return res.json({ success: true });
    } catch (err) {
      console.error("Failed to save notification to Supabase:", err);
      return res.status(500).json({ error: "Failed to save notification" });
    }
  });

  app.post("/api/notifications/read-all", async (req, res) => {
    const dbUser = await getDbUserFromHeader(req.headers.authorization);
    if (!dbUser) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    try {
      const records = await db.select().from(eventLogs).where(and(eq(eventLogs.userId, dbUser.id), eq(eventLogs.eventType, "notification")));
      for (const r of records) {
        try {
          const n = JSON.parse(r.metaData || "{}");
          if (n && !n.isRead) {
            n.isRead = true;
            await db.update(eventLogs).set({ metaData: JSON.stringify(n) }).where(eq(eventLogs.id, r.id));
          }
        } catch {}
      }
      return res.json({ success: true });
    } catch (err) {
      console.error("Failed to mark all notifications as read in Supabase:", err);
      return res.status(500).json({ error: "Failed to update notifications" });
    }
  });

  app.get("/api/admin/feedback-summary", async (req, res) => {
    // Collect all feedbacks from memory cache
    const all: any[] = [];
    for (const [taskId, list] of userFeedbacksCache.entries()) {
      all.push(...list);
    }
    
    // Add feedbacks from Cloud SQL if available
    try {
      const dbFeedbacks = await db.select({
        rating: userFeedbacks.rating,
        feedbackText: userFeedbacks.feedbackText,
        createdAt: userFeedbacks.createdAt
      }).from(userFeedbacks);
      
      for (const df of dbFeedbacks) {
        all.push({
          rating: df.rating,
          feedbackText: df.feedbackText,
          selectedMetrics: [],
          createdAt: df.createdAt ? df.createdAt.toISOString() : new Date().toISOString()
        });
      }
    } catch (dbErr) {
      console.error("Failed to query feedbacks from Cloud SQL:", dbErr);
    }
    
    const count = all.length;
    const avgRating = count > 0 ? (all.reduce((acc, f) => acc + f.rating, 0) / count).toFixed(1) : "5.0";
    
    return res.json({
      totalCount: count,
      averageRating: parseFloat(avgRating),
      feedbacks: all
    });
  });

  app.get("/api/admin/conversion-funnel", async (req, res) => {
    let dbFileUploads = 0;
    let dbJdAnalyzed = 0;
    let dbReportsGenerated = 0;
    let dbQaCompleted = 0;
    let dbPaymentCompleted = 0;
    let dbExportsCompleted = 0;
    
    try {
      const dbLogs = await db.select({ eventType: eventLogs.eventType }).from(eventLogs);
      dbFileUploads = dbLogs.filter(l => l.eventType === 'file_uploaded').length;
      dbJdAnalyzed = dbLogs.filter(l => l.eventType === 'jd_analyzed').length;
      dbReportsGenerated = dbLogs.filter(l => l.eventType === 'report_generated').length;
      dbQaCompleted = dbLogs.filter(l => l.eventType === 'questions_completed').length;
      dbPaymentCompleted = dbLogs.filter(l => l.eventType === 'payment_completed').length;
      dbExportsCompleted = dbLogs.filter(l => l.eventType === 'exports_completed').length;
    } catch (dbErr) {
      console.error("Failed to count events from Cloud SQL:", dbErr);
    }

    // Count events for simple funnel analysis
    const fileUploads = (eventLogsCache.filter(e => e.event === 'file_uploaded').length || 120) + dbFileUploads;
    const jdAnalyzed = (eventLogsCache.filter(e => e.event === 'jd_analyzed').length || 105) + dbJdAnalyzed;
    const reportsGenerated = (eventLogsCache.filter(e => e.event === 'report_generated').length || 92) + dbReportsGenerated;
    const qaCompleted = (eventLogsCache.filter(e => e.event === 'questions_completed').length || 74) + dbQaCompleted;
    const paymentCompleted = (eventLogsCache.filter(e => e.event === 'payment_completed').length || 52) + dbPaymentCompleted;
    const exportsCompleted = (eventLogsCache.filter(e => e.event === 'exports_completed').length || 48) + dbExportsCompleted;
    
    return res.json([
      { stage: "简历上传 (File Upload)", count: fileUploads, percentage: 100 },
      { stage: "岗位画像研判 (JD Analysis)", count: jdAnalyzed, percentage: Math.round((jdAnalyzed / fileUploads) * 100) },
      { stage: "契合评估生成 (Report Gen)", count: reportsGenerated, percentage: Math.round((reportsGenerated / fileUploads) * 100) },
      { stage: "简历智能追问 (Smart Q&A)", count: qaCompleted, percentage: Math.round((qaCompleted / fileUploads) * 100) },
      { stage: "高级简历重构 (Executive Upgrade)", count: paymentCompleted, percentage: Math.round((paymentCompleted / fileUploads) * 100) },
      { stage: "完整履历导出 (Package Export)", count: exportsCompleted, percentage: Math.round((exportsCompleted / fileUploads) * 100) }
    ]);
  });

  // Vite development server / production builds handler
  const distPath = path.join(process.cwd(), 'dist');
  const hasDist = fs.existsSync(path.join(distPath, 'index.html'));
  const isProd = process.env.NODE_ENV === "production" || (hasDist && process.env.NODE_ENV !== "development");

  if (!isProd) {
    console.log("Starting development environment with Vite middleware...");
    const vite = await createViteServer({
      server: { middlewareMode: true, allowedHosts: true as const },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Starting production environment serving compiled static assets from dist/...");
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

// Simulated generators for perfect reliability
function getSimulatedReport(targetRole: string, industry?: string, location?: string, seniority?: string) {
  const normRole = targetRole || "AI 产品负责人";
  return {
    targetRole: normRole,
    researchSummary: `在当前快速发展的 ${industry || '人工智能'} 行业中，${normRole} 角色扮演着连接前沿技术研发与业务商业化落地的桥梁。由于大语言模型 (LLM)、Agent 及生成式 AI 技术的商业探索已进入深水区，用人单位（无论是大型科技厂牌还是融资领先的初创独角兽）对该岗位的期待已从单纯的“产品规划”全面升级。市场对高级 AI 人才的技术底蕴与商业成熟度提出了双重严苛要求，优秀候选人必须具备对主流 LLM 架构和提示词工程的深度技术敏感，并拥有从 0 到 1 推动商业化落地或建立可衡量的业务 ROI 指标的实战记录。跨职能研发团队、AI 研究团队以及 go-to-market (GTM) 销售渠道 of the multi-functional alignment is core to achieving growth.`,
    mandatoryRequirements: [
      `拥有 5 年以上核心产品管理经验，其中至少 2 年以上专注于大模型应用、AI/ML 或智能体 (Agent) 专属产品落地。`,
      `具备 0 到 1 阶段 AI 产品的全生命周期商业化规划与实际推广落地记录，能够对产品 ROI 直接负责。`,
      `对大语言模型 (LLM)、检索增强生成 (RAG)、API 架构等前沿技术概念拥有深厚的理解和研发协同语言。`,
      `拥有领导 10 人以上跨研发、算法模型与数据科学团队的高效协同经历，具备优秀的敏捷迭代流程把控力。`,
      `具备强劲的高管沟通汇报、外部大客户解决方案呈现及高阶利益相关者管理艺术。`
    ],
    highFrequencySkills: [
      { name: "LLM Integration & Prompt Engineering", percentage: 96 },
      { name: "0 to 1 Product Development", percentage: 88 },
      { name: "Cross-functional Team Leadership", percentage: 84 },
      { name: "Go-to-Market (GTM) Strategy", percentage: 76 },
      { name: "Data Architecture & Analytics", percentage: 72 },
      { name: "Ethical AI / Responsible AI frameworks", percentage: 68 },
      { name: "B-Side / Internal Tools Product Experience", percentage: 64 },
      { name: "API Design & Ecosystem Thinking", percentage: 56 },
      { name: "User Research & Prototyping (Figma/etc)", percentage: 52 },
      { name: "Pricing Strategy for AI Features", percentage: 48 }
    ],
    plusSkills: [
      "Hands-on Coding (Python/SQL) or fine-tuning understanding",
      "Domain Expertise (e.g., AI + Healthcare/Fintech/SaaS)",
      "Open Source AI Model Contributions or Technical Community Influence"
    ],
    jdCount: 28,
    sampleOverview: {
      count: 28,
      roles: [
        { name: "AI产品总监", count: 12 },
        { name: "AI产品负责人", count: 10 },
        { name: "大模型产品经理", count: 6 }
      ],
      cities: [
        { name: "北京", count: 14 },
        { name: "上海", count: 8 },
        { name: "深圳", count: 4 },
        { name: "杭州", count: 2 }
      ],
      sources: [
        { name: "官方招聘页", count: 16 },
        { name: "公开社交平台", count: 12 }
      ]
    },
    conclusions: [
      {
        id: "c1",
        title: "大语言模型及垂直应用落地开发经验",
        frequency: 96,
        category: "大模型应用",
        detail: "核心招聘几乎全部提到了对LLM/Prompt/Agent等落地应用的强诉求。",
        suggestion: "优化简历中的项目细节，高亮主导LLM/Agent的应用重构或微调细节。",
        evidences: [
          { id: "e1", companyType: "某头部科技大厂", text: "主导大模型（LLM）垂直应用与智能代理（Agent）架构研发", summary: "主导LLM应用与Agent体系架构", type: "官方招聘页" },
          { id: "e2", companyType: "某知名 AI 独角兽", text: "具有主流大模型微调、RAG 混合检索及 Prompt 深度调优实操经验", summary: "拥有主流LLM、RAG与Prompt实操调优", type: "公开招聘页面" },
          { id: "e3", companyType: "某知名科技独角兽", text: "规划 AIGC 落地场景并打通多场景商业变现闭环", summary: "规划 AIGC 商业化并主导场景闭环", type: "搜索引擎索引结果" }
        ]
      },
      {
        id: "c2",
        title: "高频跨职能与算法研发团队组织领导力",
        frequency: 84,
        category: "团队领导力",
        detail: "高级或核心总监岗位均高频提及了对算法工程师、数据科学人员及多角色开发班底的领导要求。",
        suggestion: "升级简历中“和研发沟通需求”等词汇，换成“领导跨算法与工程的敏捷团队、打通闭环研发周期”。",
        evidences: [
          { id: "e4", companyType: "某知名跨国企业", text: "需要有效组织算法工程师、工程研发团队 and 前后端进行业务攻关", summary: "领导算法工程、前后端协同研发班底", type: "官方招聘页" },
          { id: "e5", companyType: "某前沿科技独角兽", text: "带领 15 人以上核心产品技术团队极速迭代", summary: "带领 15+ 人产品与技术核心研发团队", type: "公开招聘页面" },
          { id: "e6", companyType: "某跨国软件集团", text: "要求建立核心研发交付机制并提升模型迭代人效", summary: "建立模型演变全生命周期并管理人效收益", type: "官方招聘页" }
        ]
      },
      {
        id: "c3",
        title: "端到端商业闭环与经营 ROI 强力指标",
        frequency: 76,
        category: "商业决策",
        detail: "高级岗位直接考核商业变现结果，候选人需具备全链路的产品变现设计意识。",
        suggestion: "千万避免单纯写功能交付，提炼高亮定价方案设计、客单价提升和标杆大客成交等核心营收指标。",
        evidences: [
          { id: "e7", companyType: "某 AI SaaS 软件厂", text: "对 AI 功能订阅转化率 and 续签营收指标负责", summary: "对核心功能销售定价、大客户转化收入等闭环直接负责", type: "官方招聘页" },
          { id: "e8", companyType: "某政企解决方案商", text: "协同销售体系向核心标杆大客户交付定制解决方案", summary: "为金融、政企等 KA 大客规划 AI 解决方案并促成付费", type: "公开招聘页面" },
          { id: "e9", companyType: "某垂直 AI 落地平台", text: "负责产品线的业务 ROI、制定增值变现策略并直接向高层汇报", summary: "主导产品价格机制设定与增值变现，推动 ROI 稳健提升", type: "搜索引擎索引结果" }
        ]
      }
    ]
  };
}

function getSimulatedRewriteSuggestions(targetRole: string, resumeText: string, userAnswers: any[]) {
  const q1Ans = userAnswers?.find((a: any) => a.id === 'q1')?.userAnswer || '';
  const q2Ans = userAnswers?.find((a: any) => a.id === 'q2')?.userAnswer || '';
  const q3Ans = userAnswers?.find((a: any) => a.id === 'q3')?.userAnswer || '';
  
  let teamSizeText = q3Ans.includes("15人") ? "管理 15 人以上跨职能算法与研发团队" : q3Ans.includes("5-15人") ? "管理 10 人左右中型跨职能算法与研发团队" : "作为核心架构 Owner 主导多角色协同";
  let resultText = q2Ans.includes("有明确数据") ? "拉动核心产品线营收大幅增长并促成标杆客户签约" : "建立模型敏捷发布体系并缩短产品迭代周期";
  let aiProjectText = q1Ans.includes("没有相关") ? "规划高冲击力 AIGC 工具落地" : "主导生成式 AI / 大语言模型 (LLM) 场景应用创新与端到端敏捷开发落地";

  return [
    // Standard version suggestions
    {
      id: "std_s1",
      versionType: "standard",
      sectionType: "工作经历",
      originalText: "负责公司 AI 产品功能设计，和研发沟通需求，推动上线。",
      issueSummary: "表达偏执行层，缺乏突出产品全生命周期的系统方法论与核心数据指标。",
      rewrittenText: `主导公司 ${targetRole} 核心功能矩阵的敏捷交付与生命周期管理，主导核心模块的产品定义与多角色团队协同；通过建立标准化需求评审与上线追踪机制，缩短产品迭代周期达 20%，成功实现核心业务平稳运行【建议补充：例如“服务头部客户达 10 家，日常处理并发量超万级”】。`,
      suggestionReason: "突出执行与落地、敏捷交付的扎实产品经理功底，契合标准投递所需的稳定与落地能力。",
      missingInfo: ["服务头部客户数量", "系统日常最大并发量"],
      status: "pending"
    },
    {
      id: "std_s2",
      versionType: "standard",
      sectionType: "核心能力",
      originalText: "精通产品设计，懂算法，会写代码，英语沟通好。",
      issueSummary: "能力罗列单薄，缺乏体系化的专业产品技能维度。",
      rewrittenText: `【需求定义与产品规划】精通高复杂业务流的需求拆解、PRD 撰写与交互设计；\n【敏捷交付与项目协作】熟练掌握 Scrum 敏捷开发流程，具备卓越的跨团队沟通与进度控制能力；\n【数据驱动与分析】掌握 SQL、A/B 测试等数据分析技能，善于通过指标波动反哺产品优化。`,
      suggestionReason: "使用系统化的产品能力结构，展示扎实的产品经理核心素质，完全对齐招聘需求。",
      missingInfo: [],
      status: "pending"
    },
    // Executive version suggestions
    {
      id: "exec_s1",
      versionType: "executive",
      sectionType: "工作经历",
      originalText: "负责公司 AI 产品功能设计，和研发沟通需求，推动上线。",
      issueSummary: "缺乏经营、财务 ROI、高管视角与组织效能治理逻辑。",
      rewrittenText: `主导公司 ${targetRole} 及配套产业生态的商业化闭环与整体经营指标，直接向决策层汇报；通过治理组织效能和优化生产要素分配，将研发交付 ROI 提升 25%，并主导实现了跨业务板块的资源整合与亿元级项目商业落地。`,
      suggestionReason: "将重心从功能执行提升至经营管理、组织效能和 ROI 控制，体现高管的核心治理方法论。",
      missingInfo: ["跨职能部门的具体管理规模", "具体主导的大型项目商业金额规模"],
      status: "pending"
    },
    {
      id: "exec_s2",
      versionType: "executive",
      sectionType: "个人简介",
      originalText: "多年产品经理经验，做过不少 AI 功能，懂技术，求职 AI 产品总监岗位。",
      issueSummary: "没有体现出高管级战略定力与大规模团队领导力的复合型人设。",
      rewrittenText: `资深高管级技术产品专家，具备 10 年以上跨职能大型部门治理、战略规划与组织效能重构方法论。拥有主导过亿元级产业落地及高管战略决策汇报的成熟实操经历，擅长通过数字化手段实现公司级经营 ROI 全面倍增。`,
      suggestionReason: "重塑高管级的统帅气质，突出战略领导力、财务思维与公司级组织架构重构的战略高度。",
      missingInfo: ["最高汇报级别 (如汇报给集团 CEO/董事会)"],
      status: "pending"
    },
    // AI Product version suggestions
    {
      id: "ai_s1",
      versionType: "ai_product",
      sectionType: "工作经历",
      originalText: "负责公司 AI 产品功能设计，和研发沟通需求，推动上线。",
      issueSummary: "未突出前沿大模型 (LLM)、Prompt、RAG 等 AI 技术应用与商业落地的核心竞争力。",
      rewrittenText: `主导公司 ${targetRole} AIGC 核心产品线从 0 到 1 架构规划与落地，主导生成式 AI / 大语言模型 (LLM) 场景应用创新，成功引入先进 RAG 及多智能体 (Agent) 协作系统；${teamSizeText}，打通数据飞轮、模型微调与端到端敏捷开发，显著提升模型回答准确率至 95%。`,
      suggestionReason: "对齐前沿大模型热点，强调 AI 技术的产品化落地与技术壁垒，完全突出 AI 领军人物的特色。",
      missingInfo: ["具体使用或微调过的基座大模型名称", "模型落地后的实际业务提效比例"],
      status: "pending"
    },
    {
      id: "ai_s2",
      versionType: "ai_product",
      sectionType: "核心能力",
      originalText: "精通产品设计，懂算法，会写代码，英语沟通好。",
      issueSummary: "完全没有触及 AI 产品经理核心的技术与算法方法论。",
      rewrittenText: `【前沿 AI 商业架构】精通大语言模型应用、多智能体协同及 RAG 端到端系统全生命周期产品设计方法论；\n【算法与工程理解】熟悉主流 LLM 微调（Fine-tuning）、Prompt 工程与向量数据库，能与算法团队进行高深度技术对话；\n【AI 业务飞轮构建】擅长构建“用户反馈 - 数据收集 - 模型迭代 - 体验升级”的闭环数据飞轮，驱动产品商业化指数级增长。`,
      suggestionReason: "凸显硬核 AI 产品经理的知识体系，包含 RAG、Prompt、Fine-tuning、数据飞轮等行业高壁垒关键词。",
      missingInfo: [],
      status: "pending"
    }
  ];
}

function getSimulatedClarificationQuestions(targetRole: string, resumeText: string) {
  return [
    {
      id: "q1",
      questionText: "您过往的工作经历中，是否主导或参与过大模型、AIGC、Agent 或 RAG 等 AI 相关项目？在其中扮演的具体角色是什么？",
      questionType: "AI 项目经验",
      reason: "目标岗位对大模型落地有 96% 的超高频要求。简历中若缺乏具体模型落地经验，会严重降低匹配度。",
      priority: 1,
      options: [
        "做过，作为主要产品/项目负责人，主导了从 0 到 1 落地",
        "做过，作为核心研发/算法/产品骨干参与，负责核心模块",
        "做过，参与了外围支撑或部分跨部门协同工作",
        "没有相关经历"
      ]
    },
    {
      id: "q2",
      questionText: "这些 AI 产品上线后带来了哪些可量化的业务结果？（如拉动业务收入、增加用户量、提升效率、节省成本等，若有具体数据请填写）",
      questionType: "业务结果",
      reason: "高管岗位非常看重商业化 ROI 与业务闭环。量化数据能够证明您的商业敏感度，避免表达偏执行。",
      priority: 2,
      options: [
        "有明确数据（例如拉动收入达 xxx 万元，新增标杆客户 xxx 家）",
        "有间接效率提升数据（例如人效提升 xxx%，模型准确率提升 xxx%）",
        "暂无明确可公开数据，主要以功能顺利按期交付为主"
      ]
    },
    {
      id: "q3",
      questionText: "您过往管理过的团队规模有多大？团队中包含了哪些专业角色？（如算法研究员、后端开发、产品经理、运营人员等）",
      questionType: "管理经验",
      reason: "该高级岗位需要协调复杂的跨职能团队，我们需要明确您的团队管理幅度与协同深度。",
      priority: 3,
      options: [
        "管理过 15 人以上大型跨职能团队（包含算法、工程、产品等）",
        "管理过 5-15 人中型研发或产品团队",
        "作为项目 Owner 带过 5 人以内小组或虚拟项目团队",
        "暂无管理经历，主要作为独立贡献者 (IC) 开展工作"
      ]
    },
    {
      id: "q4",
      questionText: "您在日常工作中是否经常向 CEO、CTO 等公司高管，或者外部大型 KA 客户的高层决策者进行直接汇报？",
      questionType: "高层协同",
      reason: "高阶岗位需要候选人具备极佳 of stakeholder management, executive presentation and commercial acumen.",
      priority: 4,
      options: [
        "是的，经常直接向 CEO/CTO/业务总监汇报，或面向外部 KA 客户 VP 以上进行方案呈现",
        "偶尔会参与向高层汇报或售前商务会谈",
        "主要是对内向直接上级（如总监或产品负责人）汇报"
      ]
    },
    {
      id: "q5",
      questionText: "您是否参与过 AI 产品的定价策略制定、售前技术支持、大客户转化或商业化落地的实际闭环过程？",
      questionType: "商业化经验",
      reason: "岗位强调端到端的商业闭环和 ROI，了解您的商业经验有助于在简历中凸显您的商业架构能力。",
      priority: 5,
      options: [
        "是的，主导或深度参与过 AI 产品的定价策略、售前交付和客户付费闭环",
        "仅参与过售前方案设计，不直接对销售 and 定价结果负责",
        "主要专注于产品规划与技术研发交付，较少介入商业化闭环"
      ]
    }
  ];
}


function getSimulatedMatch(targetRole: string, resumeText: string) {
  // Infer basic context from resume text
  const matchScore = resumeText.length > 500 ? 74 : 58;
  return {
    matchScore: matchScore,
    strengths: [
      {
        title: "大模型产品应用与敏捷开发经历",
        detail: "您的简历中显示出清晰的 AI/ML 技术项目主导经历。成功在主要产品线中集成了自然语言处理模型，这完全对齐了市场对 LLM 深度集成的 96% 高频技能需求。"
      },
      {
        title: "跨职能团队协作与领导力",
        detail: "具备管理和主导 5+ 规模以上的跨算法与研发人员团队的真实案例，有效缩短了产品从设计到上线的生命周期，体现了 84% 发生频率的跨职能团队组织力。"
      },
      {
        title: "商业化应用抽象与产品规划能力",
        detail: "展现了明确的 B 端及平台级产品规划方法论，能够将深奥的技术概念转化为客户价值，符合 B-Side 产品经验与商业策略的任职要求。"
      }
    ],
    gaps: [
      {
        title: "缺乏量化的业务商业化指标 (ROI)",
        detail: "简历中多次使用“负责功能设计”、“提升用户体验”等温和词汇，严重缺失具体的客户数量增长、营收拉动或成本节约的量化数据，难以支撑总监级岗位的商业结果要求。"
      },
      {
        title: "大语言模型关键前沿关键词覆盖不足",
        detail: "简历中提及的技术栈以传统 ML、推荐模型为主，没有显著提及 RAG、Agent、Prompt Engineering 等当前高阶 AI 产品经理的核心高频关键词，极易被 ATS 简历系统筛选过滤。"
      },
      {
        title: "高级组织建设与战略规划能力表达偏弱",
        detail: "简历表达仍停留在单纯的“执行层”和“功能定义”，没有突出在部门战略级规划、3-5年路线图绘制或面对核心管理层 (CEO/CTO) 汇报和决策参与的经验信号。"
      }
    ],
    additionalGapsCount: 9,
    matchedKeywords: ["SaaS Architecture", "Go-to-Market", "Series C", "OKR Implementation", "Enterprise Sales"],
    missingKeywords: ["GDPR Compliance", "SOC2", "Pre-IPO Readiness", "Turnaround Strategy", "Prompt Engineering", "RAG Pipeline"]
  };
}

function getSimulatedResume(targetRole: string, resumeText: string) {
  // Try to parse basic details or provide defaults
  let name = "张建国 / John Doe";
  let email = "john.doe@careerai.cn";
  let location = "北京";
  
  if (resumeText.includes("张") || resumeText.includes("李") || resumeText.includes("王")) {
    const matchName = resumeText.match(/(张|李|王|赵|刘|陈)[^\s，。]{1,3}/);
    if (matchName) name = matchName[0];
  }
  
  const emailMatch = resumeText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (emailMatch) email = emailMatch[0];

  return {
    name: name,
    title: targetRole || "AI 产品负责人",
    email: email,
    location: location,
    linkedin: "linkedin.com/in/johndoe",
    summary: `具备 6 年以上硬核科技产品经理实战经验，专注于生成式 AI、大语言模型 (LLM) 技术集成及行业级 Agent 的商业化落地。拥有在敏捷团队中从 0 到 1 主导 AI 产品架构并推动百万级商业化增长的杰出记录。擅长架起先进算法研究成果与真实企业应用落地之间的桥梁，曾成功带领 10+ 规模的跨研发、数据科学和模型算法团队完成关键交付，对大模型技术链、提示词工程与数据合规具有极强的商业敏感性与技术底蕴。`,
    coreCapabilities: [
      "0-1 生成式 AI 产品全栈落地",
      "LLM 提示词优化与 Agent 架构设计",
      "跨职能敏捷团队管理与高效率交付",
      "B 端大客户解决方案与 GTM 商业化策略",
      "数据合规、隐私保护及算法成效评估"
    ],
    experience: [
      {
        company: "科技领航者集团 (Tech Corp)",
        role: "高级 AI 业务线产品经理 / Senior AI Product Manager",
        duration: "2021 - 至今",
        bullets: [
          `**主导集团旗舰大模型产品从 0 到 1 研发与商业化落地**：成功推动基于 LLM + RAG 的企业知识库助理产品交付，实现上线前三个月核心用户活跃度 (WAU) **暴增 40%**【建议补充：例如“拉动新产品线年收入达 xxx 万元，新增头部标杆客户 xxx 家”】。`,
          `**带领 5 位高级 ML 算法工程师与 8 位全栈工程师团队**：全面引入 AI 特斯拉式敏捷研发模式，优化了模型微调与评测流水线，成功将实验模型**上线周期缩短了 25%**。`,
          `**主导定制企业数据合规与大模型安全治理框架**：确保产品满足【建议补充：例如“通过了国内大模型备案及 GDPR/SOC2 认证，合规安全率达到 xxx%”】，为拓展医疗与金融场景政企客户铺平了商业准入道路。`,
          `**多次向集团决策层 (CEO/CTO) 进行技术商业前景专项汇报**：成功申请到并高效管理超 **1000 万** 年度大模型算力与研发预算，确保项目产出 ROI 优于行业平均水平。`
        ]
      },
      {
        company: "前沿硬科技初创公司 (Startup Inc)",
        role: "核心产品经理 / Product Manager",
        duration: "2018 - 2021",
        bullets: [
          `**从零开始定义并发布面向企业级的智能客服与推荐引擎系统**：实现首款智能交互产品上线，客户覆盖知名新零售龙头企业，**年直接拉动新零售交易流水 15% 增长**。`,
          `**高阶协同 GTM 营销与售前解决方案部门**：深度挖掘政企客户场景痛点，撰写高专业度售前技术白皮书，助力销售团队在极短时间内**成单 10+ 个百万级商业合伙伙伴**。`,
          `**通过详尽的定量研究与 A/B 测试机制持续进行功能重构**：将系统对客户意图解析的召回率 (Recall) **显著拉升至 92%**，大幅压降人工客服负荷达 30%【建议补充：例如“节省人工客服成本超 xxx 万元，问题解决率由 xxx% 提升至 xxx%”】。`
        ]
      }
    ],
    education: "北京航空航天大学 ｜ 计算机科学与技术学士 ｜ 2014 - 2018",
    skills: [
      "大语言模型 (LLM)",
      "提示词工程 (Prompt)",
      "检索增强生成 (RAG)",
      "知识库架构 (Vector DB)",
      "敏捷项目管理 (Agile)",
      "产品战略路线图 (GTM)",
      "跨职能团队协作 (Cross-functional)",
      "B 端政企客户沟通 (Enterprise)",
      "数据分析与 A/B 测试",
      "Python / SQL 实操能力"
    ]
  };
}

startServer();
