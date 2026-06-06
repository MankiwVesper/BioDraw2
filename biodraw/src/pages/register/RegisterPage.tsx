import { useState, useEffect } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../state/authStore';
import '../login/LoginPage.css';

const STRENGTH_LEVELS = ['', '弱', '弱', '中', '良好', '强'] as const;
const STRENGTH_COLORS = ['', '#ef4444', '#ef4444', '#f97316', '#eab308', '#16a34a'] as const;

function getStrengthChecks(pwd: string) {
  return {
    length: pwd.length >= 8,
    upper:  /[A-Z]/.test(pwd),
    lower:  /[a-z]/.test(pwd),
    digit:  /[0-9]/.test(pwd),
    symbol: /[^A-Za-z0-9]/.test(pwd),
  };
}

export default function RegisterPage() {
  const navigate     = useNavigate();
  const location     = useLocation();
  const prefillEmail = (location.state as { email?: string } | null)?.email ?? '';

  const [email,        setEmail]        = useState(prefillEmail);
  const [password,     setPassword]     = useState('');
  const [confirm,      setConfirm]      = useState('');
  const [submitting,   setSubmitting]   = useState(false);
  const [localError,   setLocalError]   = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm,  setShowConfirm]  = useState(false);
  const register   = useAuthStore((s) => s.register);
  const clearError = useAuthStore((s) => s.clearError);
  const error      = useAuthStore((s) => s.error);

  useEffect(() => { clearError(); }, [clearError]);

  const checks = getStrengthChecks(password);
  const score  = Object.values(checks).filter(Boolean).length;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (score < 5) {
      setLocalError('密码不符合强度要求，请参考下方提示');
      return;
    }
    if (password !== confirm) {
      setLocalError('两次输入的密码不一致');
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
              autoFocus={!prefillEmail}
            />
          </div>
          <div className="auth-field">
            <label>密码</label>
            <div className="auth-input-wrap">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="至少 8 位，含大小写字母、数字、符号"
                autoFocus={!!prefillEmail}
              />
              <button type="button" className="auth-eye" tabIndex={-1} onClick={() => setShowPassword((p) => !p)}>
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {password && (
              <div className="auth-strength">
                <div className="auth-strength-bar-wrap">
                  <div
                    className="auth-strength-bar-fill"
                    style={{ width: `${score / 5 * 100}%`, background: STRENGTH_COLORS[score] }}
                  />
                </div>
                <div className="auth-strength-hints">
                  {([
                    [checks.length, '≥8位'],
                    [checks.upper,  '大写'],
                    [checks.lower,  '小写'],
                    [checks.digit,  '数字'],
                    [checks.symbol, '符号'],
                  ] as [boolean, string][]).map(([ok, label]) => (
                    <span key={label} className={`auth-hint${ok ? ' is-ok' : ''}`}>{label}</span>
                  ))}
                  {score > 0 && (
                    <span className="auth-strength-label" style={{ color: STRENGTH_COLORS[score] }}>
                      <span>{STRENGTH_LEVELS[score]}</span>
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="auth-field">
            <label>确认密码</label>
            <div className="auth-input-wrap">
              <input
                type={showConfirm ? 'text' : 'password'}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="再次输入密码"
              />
              <button type="button" className="auth-eye" tabIndex={-1} onClick={() => setShowConfirm((p) => !p)}>
                {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          {(localError || error) && (
            <div className="auth-error">{localError ?? error}</div>
          )}
          <button className="auth-submit" type="submit" disabled={submitting}>
            {submitting ? '注册中...' : '注册'}
          </button>
        </form>
        <div className="auth-switch">
          已有账号？<Link to="/login" state={{ email }}>去登录</Link>
        </div>
      </div>
    </div>
  );
}
