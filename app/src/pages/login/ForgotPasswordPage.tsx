import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../../state/authStore';
import './LoginPage.css';

export default function ForgotPasswordPage() {
  const sendPasswordResetEmail = useAuthStore((s) => s.sendPasswordResetEmail);

  const [email,      setEmail]      = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent,       setSent]       = useState(false);
  const [error,      setError]      = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await sendPasswordResetEmail(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '发送失败，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <span className="auth-logo-text">BioDraw</span>
          <span className="auth-logo-sub">找回密码</span>
        </div>
        {sent ? (
          <div className="auth-sent">
            <p>重置邮件已发送至 <strong>{email}</strong>，请查收并点击邮件中的链接。</p>
            <p className="auth-sent-tip">没收到？请检查垃圾邮件文件夹。</p>
          </div>
        ) : (
          <form className="auth-form" onSubmit={handleSubmit}>
            <div className="auth-field">
              <label>邮箱</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                autoFocus
              />
            </div>
            {error && <div className="auth-error">{error}</div>}
            <button className="auth-submit" type="submit" disabled={submitting}>
              {submitting ? '发送中...' : '发送重置邮件'}
            </button>
          </form>
        )}
        <div className="auth-switch">
          <Link to="/login">返回登录</Link>
        </div>
      </div>
    </div>
  );
}
