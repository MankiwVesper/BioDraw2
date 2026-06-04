import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../state/authStore';
import '../login/LoginPage.css';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const register = useAuthStore((s) => s.register);
  const error = useAuthStore((s) => s.error);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setLocalError('两次输入的密码不一致');
      return;
    }
    if (password.length < 6) {
      setLocalError('密码至少需要 6 位');
      return;
    }
    setLocalError(null);
    setSubmitting(true);
    await register(email, password);
    setSubmitting(false);
    if (useAuthStore.getState().user) {
      navigate('/editor', { replace: true });
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <span className="auth-logo-text">BioDraw</span>
          <span className="auth-logo-sub">面向生物教师的动画编辑器</span>
        </div>
        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-field">
            <label>邮箱</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              autoFocus
            />
          </div>
          <div className="auth-field">
            <label>密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="至少 6 位"
              required
            />
          </div>
          <div className="auth-field">
            <label>确认密码</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="再次输入密码"
              required
            />
          </div>
          {(localError || error) && (
            <div className="auth-error">{localError ?? error}</div>
          )}
          <button className="auth-submit" type="submit" disabled={submitting}>
            {submitting ? '注册中...' : '注册'}
          </button>
        </form>
        <div className="auth-switch">
          已有账号？<Link to="/login">去登录</Link>
        </div>
      </div>
    </div>
  );
}
