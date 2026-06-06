import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useAuthStore } from '../../state/authStore';
import './ChangePasswordModal.css';

interface Props {
  onClose: () => void;
}

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

export function ChangePasswordModal({ onClose }: Props) {
  const changePassword = useAuthStore((s) => s.changePassword);

  const [currentPwd,  setCurrentPwd]  = useState('');
  const [newPwd,      setNewPwd]      = useState('');
  const [confirmPwd,  setConfirmPwd]  = useState('');
  const [submitting,  setSubmitting]  = useState(false);
  const [error,       setError]       = useState('');
  const [done,        setDone]        = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew,     setShowNew]     = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const checks = getStrengthChecks(newPwd);
  const score  = Object.values(checks).filter(Boolean).length;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (score < 5) { setError('新密码不符合强度要求，请参考下方提示'); return; }
    if (newPwd !== confirmPwd) { setError('两次输入的密码不一致'); return; }
    setSubmitting(true);
    try {
      await changePassword(currentPwd, newPwd);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '修改失败，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="cpw-overlay">
      <div className="cpw-modal" onClick={(e) => e.stopPropagation()}>

        <div className="cpw-header">
          <span className="cpw-title">修改密码</span>
          <button className="cpw-close" onClick={onClose}>✕</button>
        </div>

        {done ? (
          <div className="cpw-done">
            <p>密码已修改成功</p>
            <button className="cpw-done-btn" onClick={onClose}>关闭</button>
          </div>
        ) : (
          <form className="cpw-form" onSubmit={handleSubmit}>

            <label className="cpw-label">当前密码</label>
            <div className="cpw-input-wrap">
              <input
                className="cpw-input"
                type={showCurrent ? 'text' : 'password'}
                value={currentPwd}
                onChange={(e) => setCurrentPwd(e.target.value)}
                autoFocus
              />
              <button type="button" className="cpw-eye" onClick={() => setShowCurrent((p) => !p)}>
                {showCurrent ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>

            <label className="cpw-label">新密码</label>
            <div className="cpw-input-wrap">
              <input
                className="cpw-input"
                type={showNew ? 'text' : 'password'}
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
              />
              <button type="button" className="cpw-eye" onClick={() => setShowNew((p) => !p)}>
                {showNew ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>

            {newPwd && (
              <div className="cpw-strength">
                <div className="cpw-strength-bar-wrap">
                  <div
                    className="cpw-strength-bar-fill"
                    style={{ width: `${score / 5 * 100}%`, background: STRENGTH_COLORS[score] }}
                  />
                </div>
                <div className="cpw-strength-hints">
                  {([
                    [checks.length, '≥8位'],
                    [checks.upper,  '大写'],
                    [checks.lower,  '小写'],
                    [checks.digit,  '数字'],
                    [checks.symbol, '符号'],
                  ] as [boolean, string][]).map(([ok, label]) => (
                    <span key={label} className={`cpw-hint${ok ? ' is-ok' : ''}`}>{label}</span>
                  ))}
                  {score > 0 && (
                    <span className="cpw-strength-label" style={{ color: STRENGTH_COLORS[score] }}>
                      <span>{STRENGTH_LEVELS[score]}</span>
                    </span>
                  )}
                </div>
              </div>
            )}

            <label className="cpw-label">确认新密码</label>
            <div className="cpw-input-wrap">
              <input
                className="cpw-input"
                type={showConfirm ? 'text' : 'password'}
                value={confirmPwd}
                onChange={(e) => setConfirmPwd(e.target.value)}
              />
              <button type="button" className="cpw-eye" onClick={() => setShowConfirm((p) => !p)}>
                {showConfirm ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>

            {error && <div className="cpw-error">{error}</div>}
            <div className="cpw-actions">
              <button type="button" className="cpw-cancel-btn" onClick={onClose} disabled={submitting}>取消</button>
              <button type="submit" className="cpw-submit-btn" disabled={submitting}>
                {submitting ? '提交中...' : '确定'}
              </button>
            </div>

          </form>
        )}

      </div>
    </div>
  );
}
