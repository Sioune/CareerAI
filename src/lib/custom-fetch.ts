export async function customFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  let headersInit: HeadersInit = init?.headers || {};

  try {
    const token = localStorage.getItem("career_ai_token");
    if (token) {
      const headers = new Headers(headersInit);
      if (!headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`);
      }
      headersInit = headers;
    }
  } catch (e) {
    console.error("Failed to read auth token from localStorage:", e);
  }

  const maxRetries = 3;
  let delay = 250;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(input, {
        ...init,
        headers: headersInit,
      });

      if ((response.status === 502 || response.status === 503 || response.status === 504) && attempt < maxRetries) {
        console.warn(`customFetch transient status ${response.status} on attempt ${attempt} for ${String(input)}. Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2;
        continue;
      }

      return response;
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      const isTransientNetworkError =
        errMsg.includes("Failed to fetch") ||
        errMsg.includes("network") ||
        errMsg.includes("NetworkError") ||
        errMsg.includes("aborted") ||
        errMsg.includes("timeout") ||
        err instanceof TypeError;

      if (isTransientNetworkError && attempt < maxRetries) {
        console.warn(`customFetch network error on attempt ${attempt} for ${String(input)}. Retrying in ${delay}ms... Error: ${errMsg}`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2;
        continue;
      }

      throw err;
    }
  }

  return fetch(input, { ...init, headers: headersInit });
}
