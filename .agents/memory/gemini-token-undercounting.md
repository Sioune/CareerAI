---
name: Gemini token undercounting
description: Three root causes that make the app's tracked token count lower than Gemini billing dashboard.
---

## Root causes

### 1. thoughtsTokenCount missing (most impactful)
`logAiCostEvent` only read `promptTokenCount` + `candidatesTokenCount`.
Gemini 2.5 thinking models expose a third field `thoughtsTokenCount` billed at output rate.
**Fix:** `tokensOut = candidatesTokenCount + thoughtsTokenCount`.

### 2. Streaming abort paths silently drop all tokens
`streamGeminiJSON` guarded `onUsage` with `if (onUsage && lastUsageMetadata)`.
On hard timeout (SSE_HARD_TIMEOUT_MS) or client disconnect, the function returned early
BEFORE that guard, so `onUsage` was never called — every token consumed was lost.
**Fix:** call `onUsage` in the early-exit branch too, before `return`.

### 3. Streaming relied only on per-chunk usageMetadata
`@google/genai v2` streams update `usageMetadata` cumulatively per chunk; the last chunk
has final totals. But if no chunk carried the field (edge case), count was 0.
The SDK exposes `stream.response` (a Promise) after iteration that holds the fully
aggregated response including final `usageMetadata`.
**Fix:** after the `for await` loop, if `lastUsageMetadata` is still null, `await stream.response`
and read its `usageMetadata` as fallback.

## How to apply
Any new Gemini call (streaming or non-streaming) must:
- Pass `usage?.thoughtsTokenCount` to cost accounting.
- For streaming: never short-circuit before logging partial tokens.
- For streaming: prefer `stream.response` aggregate over relying on mid-stream chunks.
