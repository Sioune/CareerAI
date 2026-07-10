---
name: Gemini call timeouts
description: Gemini generateContent calls have no built-in timeout and can hang indefinitely; wrap with a race timeout.
---

The `@google/genai` (or similar) SDK's `generateContent()` call does not have a
default request timeout. In this environment, outbound calls to Gemini can be
slow or occasionally blocked, causing the call to hang for 50+ seconds or longer
before the promise ever resolves/rejects — even when the app has a try/catch and
a local simulated-response fallback ready to go. Users perceive this as the app
being "stuck forever" on a loading screen, when the actual bug is upstream network
latency/hangs, not the frontend loading logic.

**Why:** The try/catch fallback pattern only helps once the promise settles. If the
underlying call never settles quickly, the fallback never engages in a
reasonable time window, defeating the purpose of having a fallback at all.

**How to apply:** Any code path that calls an AI provider's SDK method directly
(not through a fetch you control) should wrap the call in a `Promise.race`-style
helper with an explicit timeout (e.g. 8-15s) that rejects on timeout, so the
existing catch/fallback logic engages quickly and consistently regardless of why
the provider is slow.
