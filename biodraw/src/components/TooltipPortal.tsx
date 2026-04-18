import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * 全局 Tooltip Portal
 *
 * 通过事件委托监听所有带 [data-tooltip] 属性的元素，
 * 以 position:fixed 渲染气泡，不受任何 overflow 容器限制。
 * 延迟 180ms 显示，快速划过时不会闪烁。
 */
export function TooltipPortal() {
  const [state, setState] = useState<{ text: string; x: number; y: number } | null>(null);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentTargetRef = useRef<Element | null>(null);

  useEffect(() => {
    const show = (el: Element, text: string) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        const rect = el.getBoundingClientRect();
        setState({ text, x: rect.left + rect.width / 2, y: rect.bottom });
        // 下一帧再设 visible，确保 transition 能播放
        requestAnimationFrame(() => setVisible(true));
      }, 180);
    };

    const hide = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      setVisible(false);
      // transition 结束后清除文字，避免闪现
      timerRef.current = setTimeout(() => setState(null), 150);
    };

    const onOver = (e: MouseEvent) => {
      const el = (e.target as Element).closest('[data-tooltip]') as HTMLElement | null;
      if (!el) {
        if (currentTargetRef.current) { currentTargetRef.current = null; hide(); }
        return;
      }
      if (el === currentTargetRef.current) return;
      currentTargetRef.current = el;
      const text = el.getAttribute('data-tooltip');
      if (text) show(el, text);
    };

    const onOut = (e: MouseEvent) => {
      const el = (e.target as Element).closest('[data-tooltip]');
      if (el && el === currentTargetRef.current) {
        // 检查鼠标是否真的离开了该元素（而不是进入其子元素）
        const related = e.relatedTarget as Element | null;
        if (related && el.contains(related)) return;
        currentTargetRef.current = null;
        hide();
      }
    };

    document.addEventListener('mouseover', onOver);
    document.addEventListener('mouseout', onOut);
    return () => {
      document.removeEventListener('mouseover', onOver);
      document.removeEventListener('mouseout', onOut);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (!state) return null;

  return createPortal(
    <div
      className={`tooltip-bubble${visible ? ' is-visible' : ''}`}
      style={{ left: state.x, top: state.y + 8 }}
    >
      {state.text}
    </div>,
    document.body,
  );
}
