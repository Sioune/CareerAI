---
name: Gemini call timeouts
description: Gemini generateContent calls have no built-in timeout and can hang indefinitely; stream + heartbeat instead of silently faking success.
---

The `@google/genai` (or similar) SDK's `generateContent()` call does not have a
default request timeout. In this environment, outbound calls to Gemini can be
slow or occasionally blocked, causing the call to hang for 50+ seconds or longer
before the promise ever resolves/rejects.

**Why:** A try/catch with a silent simulated-data fallback was tried first and
explicitly rejected by the user — faking a successful AI response on timeout
hides real failures and erodes trust. Users need to know when the AI is still
genuinely working (tokens still streaming) vs. when the process is dead, and
get to choose whether to keep waiting or bail out and retry.

**How to apply:** For long-running Gemini JSON generation calls exposed to the
frontend, use `generateContentStream` over Server-Sent Events instead of a
plain awaited call: emit `progress` events while chunks keep arriving, emit
`stalled` events after a short no-new-data window (e.g. 8s) so the UI can offer
"keep waiting" / "retry later", and emit a hard `error`/timeout after a longer
ceiling (e.g. 90s). Never substitute simulated/fake data on failure or
timeout — always surface a real error to the caller. On the frontend, consume
the stream with `fetch` + `ReadableStream` (EventSource can't POST), parse
`event:`/`data:` blocks, and drive a progress bar + stalled prompt off the
events rather than a fake setInterval-based progress simulation.

Also: `tsx server.ts` run without `--watch` does NOT reload on file edits — a
running dev server can keep serving stale route handlers indefinitely after
edits. Always restart the workflow after backend changes before testing, or
you'll debug against ghost code.
