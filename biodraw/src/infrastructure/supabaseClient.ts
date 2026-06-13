import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

const TIMEOUT_MS = 15_000;

function timeoutFetch(url: RequestInfo | URL, options?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const signal = options?.signal
    ? AbortSignal.any([options.signal, controller.signal])
    : controller.signal;
  return fetch(url, { ...options, signal }).finally(() => clearTimeout(timer));
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: { fetch: timeoutFetch },
});
