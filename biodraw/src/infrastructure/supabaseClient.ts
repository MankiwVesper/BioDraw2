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

// 清理历史遗留在 localStorage 中的会话：旧版本将登录态持久化到 localStorage，
// 关闭浏览器后仍保持登录。改用 sessionStorage 后，这里一次性清掉旧 token，
// 避免残留导致仍能自动登录。
try {
  for (const key of Object.keys(window.localStorage)) {
    if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
      window.localStorage.removeItem(key);
    }
  }
} catch {
  /* localStorage 不可用时忽略 */
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // 会话存入 sessionStorage：完全关闭浏览器后会话失效，重新打开需重新登录。
    // 标签页存活期间仍自动续期 token，正常使用中不会被登出。
    storage: window.sessionStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
  global: { fetch: timeoutFetch },
});
