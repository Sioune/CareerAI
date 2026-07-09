# SEO Strategy

## In scope
- Public landing page at `/`
- Shared HTML shell in `index.html`
- Public-facing marketing copy rendered from `src/App.tsx`
- Crawlability files and metadata that affect public discovery and sharing (`robots.txt`, `sitemap.xml`, `llms.txt`, favicon, canonical, Open Graph, hreflang, schema)

## Out of scope
- Authenticated or post-submission task workspaces rendered after a user starts analysis
- Internal/admin API endpoints under `/api/**`
- Resume export/download endpoints

## Target audience
- Executives, directors, senior managers, and technical leaders seeking resume optimization
- Chinese- and English-speaking professionals evaluating AI-powered executive resume rewriting

## Primary keywords
- AI resume optimizer
- Executive resume optimizer
- Resume rewriting tool
- 高管简历优化
- AI 简历优化
- 简历修改

## Notes
- Stack is Express serving a Vite React SPA.
- Public SEO currently depends on a single `index.html` shell plus client-rendered React content.

## Dismissed categories
- (None yet)
