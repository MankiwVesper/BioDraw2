import { create } from 'zustand';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../infrastructure/supabaseClient';

const AUTH_ERROR_MAP: Record<string, string> = {
  'Invalid login credentials': '邮箱或密码错误',
  'Email not confirmed': '邮箱尚未验证，请检查邮件',
  'User already registered': '该邮箱已注册，请直接登录',
  'Password should be at least 6 characters': '密码至少需要 6 位',
  'Unable to validate email address: invalid format': '邮箱格式不正确',
  'signup is disabled': '注册功能暂未开放',
  'Email rate limit exceeded': '操作过于频繁，请稍后再试',
  'over_email_send_rate_limit': '发送邮件过于频繁，请稍后再试',
};

function toChineseError(msg: string): string {
  return AUTH_ERROR_MAP[msg] ?? msg;
}

interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
  init: () => void;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  sendPasswordResetEmail: (email: string) => Promise<void>;
  resetPassword: (newPassword: string) => Promise<void>;
  deleteAccount: (password: string) => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  loading: true,
  error: null,

  init: () => {
    supabase.auth.getSession().then(({ data }) => {
      set({ user: data.session?.user ?? null, loading: false });
    });
    supabase.auth.onAuthStateChange((_event, session) => {
      set({ user: session?.user ?? null, loading: false });
    });
  },

  login: async (email, password) => {
    set({ error: null });
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) set({ error: toChineseError(error.message) });
  },

  register: async (email, password) => {
    set({ error: null });
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) set({ error: toChineseError(error.message) });
  },

  logout: async () => {
    await supabase.auth.signOut();
  },

  clearError: () => set({ error: null }),

  sendPasswordResetEmail: async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) throw new Error(toChineseError(error.message));
  },

  resetPassword: async (newPassword) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw new Error(toChineseError(error.message));
  },

  deleteAccount: async (password) => {
    const email = get().user?.email;
    if (!email) throw new Error('未登录');
    const { error: reAuthError } = await supabase.auth.signInWithPassword({ email, password });
    if (reAuthError) throw new Error(toChineseError(reAuthError.message));
    const { error } = await supabase.rpc('delete_current_user');
    if (error) throw new Error('注销失败，请联系管理员');
    await supabase.auth.signOut();
  },

  changePassword: async (currentPassword, newPassword) => {
    const email = get().user?.email;
    if (!email) throw new Error('未登录');
    const { error: reAuthError } = await supabase.auth.signInWithPassword({ email, password: currentPassword });
    if (reAuthError) throw new Error(toChineseError(reAuthError.message));
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw new Error(toChineseError(error.message));
  },
}));
