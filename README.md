# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/6523494f-cfd0-474b-bbf6-3bf047e1d587

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`
   
AI靶向精修简历工具 (V0.3 MVP版本) 的已实现功能清单：
🎨 界面与本地化体验 (UI & Localization)
   极简优雅的主题设计：采用高对比度的灰黑与深蓝质感视觉，界面布局开阔、呼吸感强，提供专注的沉浸式工作区。
   中英双语极速切换：全面支持中文 (zh) 和英文 (en) 自适应界面及输出，HTML lang 属性实时动态同步。
   本地状态引擎：基于本地持久化，安全暂存历史精修任务、诊断历史与实时编辑状态。
🤖 核心 AI 诊断与优化 (Core AI Alignment)
   目标岗位画像与市场洞察：用户输入意向岗位、行业、城市及资历水平，AI 即时生成匹配标准与 10 大核心高频技能权重。
   多格式简历智能解析：支持 Drag-and-Drop 拖拽或手动上传 PDF、DOCX 及 TXT 格式原始简历，后台自动提取和分析文本。
   靶向对齐度诊断：自动比对目标岗位画像，打出匹配度得分，并精准捕获和列出 4-5 个关键缺失词汇。
   高阶精修重构：基于 Gemini 深度语义对齐，重组简历结构，自动完成职业总结精炼，并对核心履历提供量化结果的优化建议。
✍️ 精修工作台与在线微调 (Workspace & Live Editing)
   实时响应式工作台：左侧展示原始简历文本与诊断报告，右侧展示精修重构后的新版简历，一目了然。
   极简无感编辑态：点击“编辑简历”即可秒级切换到表单输入模式，直接对姓名、联系邮箱、意向岗位、所在城市、职业总结、最高学历和核心工作履历进行精细化调整。
   真实性校验锁：集成合规性复选框，用户一键确认履历内容的真实性后，即可安全解锁导出选项。
📄 高保真多格式导出 (High-Fidelity Document Export)
   A4 像素级 PDF 导出：由服务器端 Puppeteer 无头浏览器渲染高保真 A4 样式，确保多页排版紧凑、字体清晰、不产生诡异折行或跨页溢出。
   Word (DOCX) 便捷生成：支持将重构后的精修简历极速导出为标准 Word 格式，方便用户在本地进行常规修改。
