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
  
  return fetch(input, {
    ...init,
    headers: headersInit,
  });
}
