import { supabase } from "./supabase";

export async function customFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  let headersInit: HeadersInit = init?.headers || {};
  
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (token) {
      const headers = new Headers(headersInit);
      if (!headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`);
      }
      headersInit = headers;
    }
  } catch (e) {
    console.error("Failed to append Supabase Auth token to fetch request:", e);
  }
  
  const maxRetries = 3;
  let delay = 250;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(input, {
        ...init,
        headers: headersInit,
      });
      
      // If the request succeeds but returns a transient server error (e.g., 502, 503, 504), retry
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
        err instanceof TypeError; // fetch throws TypeError for network failures
        
      if (isTransientNetworkError && attempt < maxRetries) {
        console.warn(`customFetch network error on attempt ${attempt} for ${String(input)}. Retrying in ${delay}ms... Error: ${errMsg}`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2;
        continue;
      }
      
      throw err;
    }
  }
  
  // Fallback to direct fetch if loop completes without returning (should not happen normally)
  return fetch(input, {
    ...init,
    headers: headersInit,
  });
}

