import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * 全局 Tooltip Portal
 *
 * 通过事件委托监听所有带 [data-tooltip] 属性的元素，
 * 以 position:fixed 渲染气泡，不受任何 overflow 容器限制。
 * 延迟 180ms 显示，快速划过时不会闪烁。
 */
export function TooltipPortal() {
  const [state, setState] = useState<{ text: string; x: number; y: number; above: boolean } | null>(null);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentTargetRef = useRef<Element | null>(null);
  const currentTextRef = useRef<string | null>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<MutationObserver | null>(null);

  useEffect(() => {
    const syncText = (el: Element) => {
      const text = el.getAttribute('data-tooltip') ?? '';
      if (!text || text === currentTextRef.current) return;
      currentTextRef.current = text;
      setState((prev) => prev ? { ...prev, text } : prev);
    };

    const startObserving = (el: Element) => {
      if (observerRef.current) observerRef.current.disconnect();
      observerRef.current = new MutationObserver(() => syncText(el));
      observerRef.current.observe(el, { attributes: true, attributeFilter: ['data-tooltip'] });
    };

    const stopObserving = () => {
      if (observerRef.current) { observerRef.current.disconnect(); observerRef.current = null; }
    };

    const show = (el: Element, text: string) => {
      currentTextRef.current = text;
      startObserving(el);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        const rect = el.getBoundingClientRect();
        // 预估 tooltip 高度约 30px + 8px 间距，接近视口底部时翻转到元素上方
        const above = rect.bottom + 46 > window.innerHeight;
        setState({ text: currentTextRef.current ?? text, x: rect.left + rect.width / 2, y: above ? rect.top : rect.bottom, above });
        // 下一帧再设 visible，确保 transition 能播放
        requestAnimationFrame(() => setVisible(true));
      }, 180);
    };

    const hide = () => {
      currentTextRef.current = null;
      stopObserving();
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

    // 拖动时同步更新 tooltip 文字和位置（跟随元素移动）
    const onMove = () => {
      if (!currentTargetRef.current) return;
      const el = currentTargetRef.current;
      const text = el.getAttribute('data-tooltip') ?? '';
      const rect = el.getBoundingClientRect();
      const above = rect.bottom + 46 > window.innerHeight;
      const x = rect.left + rect.width / 2;
      const y = above ? rect.top : rect.bottom;
      if (text) currentTextRef.current = text;
      setState((prev) => {
        if (!prev) return prev;
        const nextText = text || prev.text;
        if (nextText === prev.text && x === prev.x && y === prev.y && above === prev.above) return prev;
        return { text: nextText, x, y, above };
      });
    };

    document.addEventListener('mouseover', onOver);
    document.addEventListener('mouseout', onOut);
    document.addEventListener('mousemove', onMove);
    return () => {
      document.removeEventListener('mouseover', onOver);
      document.removeEventListener('mouseout', onOut);
      document.removeEventListener('mousemove', onMove);
      if (timerRef.current) clearTimeout(timerRef.current);
      stopObserving();
    };
  }, []);

  // 气泡渲染后测量宽度，若右侧超出视口则将 x 夹到安全范围
  useLayoutEffect(() => {
    if (!state || !bubbleRef.current) return;
    const half = bubbleRef.current.offsetWidth / 2;
    const clamped = Math.min(window.innerWidth - half - 8, state.x);
    if (clamped < state.x) setState(s => s && { ...s, x: clamped });
  }, [state]);

  if (!state) return null;

  return createPortal(
    <div
      ref={bubbleRef}
      className={`tooltip-bubble${visible ? ' is-visible' : ''}${state.above ? ' is-above' : ''}`}
      style={{ left: state.x, top: state.above ? state.y - 8 : state.y + 8 }}
    >
      {state.text}
    </div>,
    document.body,
  );
}
