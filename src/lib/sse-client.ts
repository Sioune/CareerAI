import { customFetch } from "./custom-fetch";

export interface SSEProgressEvent {
  elapsedMs: number;
  receivedChars: number;
}

export interface SSEStalledEvent {
  elapsedMs: number;
  sinceLastChunkMs: number;
  receivedChars: number;
}

export interface SSEErrorEvent {
  code: string;
  message: string;
  elapsedMs?: number;
}

export interface SSEHandlers<T = any> {
  onProgress?: (evt: SSEProgressEvent) => void;
  onStalled?: (evt: SSEStalledEvent) => void;
  onError?: (evt: SSEErrorEvent) => void;
  onDone?: (result: T) => void;
}

export interface StreamSSEHandle {
  abort: () => void;
}

export function streamSSE<T = any>(
  url: string,
  body: any,
  handlers: SSEHandlers<T>
): StreamSSEHandle {
  const controller = new AbortController();

  (async () => {
    try {
      const response = await customFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        let message = "请求失败，请稍后重试。";
        try {
          const parsed = await response.json();
          message = parsed?.error || message;
        } catch {}
        handlers.onError?.({ code: "http_error", message });
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let sepIndex: number;
        while ((sepIndex = buffer.indexOf("\n\n")) !== -1) {
          const rawEvent = buffer.slice(0, sepIndex);
          buffer = buffer.slice(sepIndex + 2);

          let eventName = "message";
          let dataStr = "";
          for (const line of rawEvent.split("\n")) {
            if (line.startsWith("event:")) {
              eventName = line.slice(6).trim();
            } else if (line.startsWith("data:")) {
              dataStr += line.slice(5).trim();
            }
          }
          if (!dataStr) continue;

          let data: any;
          try {
            data = JSON.parse(dataStr);
          } catch {
            continue;
          }

          if (eventName === "progress") {
            handlers.onProgress?.(data);
          } else if (eventName === "stalled") {
            handlers.onStalled?.(data);
          } else if (eventName === "error") {
            handlers.onError?.(data);
          } else if (eventName === "done") {
            handlers.onDone?.(data.result);
          }
        }
      }
    } catch (err: any) {
      if (controller.signal.aborted) return;
      const errMsg = err?.message || String(err);
      handlers.onError?.({ code: "network", message: `网络连接异常：${errMsg}` });
    }
  })();

  return {
    abort: () => controller.abort(),
  };
}
