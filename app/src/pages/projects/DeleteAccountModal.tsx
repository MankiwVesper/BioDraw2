import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useAuthStore } from '../../state/authStore';
import './DeleteAccountModal.css';

interface Props {
  onClose: () => void;
}

export function DeleteAccountModal({ onClose }: Props) {
  const deleteAccount = useAuthStore((s) => s.deleteAccount);

  const [step,         setStep]         = useState<'input' | 'confirm'>('input');
  const [password,     setPassword]     = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting,   setSubmitting]   = useState(false);
  const [error,        setError]        = useState('');

  const handleConfirm = async () => {
    setError('');
    setSubmitting(true);
    try {
      await deleteAccount(password);
    } catch (err) {
      setStep('input');
      setError(err instanceof Error ? err.message : '注销失败，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="dac-overlay">
      <div className="dac-modal" onClick={(e) => e.stopPropagation()}>

        <div className="dac-header">
          <span className="dac-title">注销账号</span>
          <button className="dac-close" onClick={onClose}>✕</button>
        </div>

        {step === 'input' ? (
          <div className="dac-body">
            <p className="dac-desc">注销账号前，请输入当前密码以验证身份。</p>
            <label className="dac-label">当前密码</label>
            <div className="dac-input-wrap">
              <input
                className="dac-input"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
              />
              <button type="button" className="dac-eye" tabIndex={-1} onClick={() => setShowPassword((p) => !p)}>
                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            {error && <div className="dac-error">{error}</div>}
            <div className="dac-actions">
              <button className="dac-cancel-btn" onClick={onClose}>取消</button>
              <button
                className="dac-next-btn"
                disabled={!password}
                onClick={() => { setError(''); setStep('confirm'); }}
              >
                下一步
              </button>
            </div>
          </div>
        ) : (
          <div className="dac-body">
            <div className="dac-warning">
              <p className="dac-warning-title">⚠️ 此操作无法撤销</p>
              <p className="dac-warning-text">
                注销后，您的账号及账号中的<strong>所有项目数据</strong>将被永久清除，无法恢复。确认继续吗？
              </p>
            </div>
            {error && <div className="dac-error">{error}</div>}
            <div className="dac-actions">
              <button className="dac-cancel-btn" onClick={onClose} disabled={submitting}>取消</button>
              <button className="dac-danger-btn" onClick={handleConfirm} disabled={submitting}>
                {submitting ? '注销中...' : '确认注销'}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
