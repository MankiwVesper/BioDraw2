import { useEffect, type RefObject } from 'react';

// 容器内的数字输入框：当输入框聚焦且鼠标悬停其上时，
// 滚轮按 step 调节数值并阻止默认滚动；其余情况不拦截，让容器正常滚动。
export function useNumberInputWheelEdit(containerRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      const target = e.target;
      if (!(target instanceof HTMLInputElement)) return;
      if (target.type !== 'number') return;
      if (target.disabled || target.readOnly) return;
      if (document.activeElement !== target) return;

      e.preventDefault();
      e.stopPropagation();

      const stepStr = target.step && target.step !== '' ? target.step : '1';
      const step = parseFloat(stepStr);
      if (!Number.isFinite(step) || step <= 0) return;

      const direction = e.deltaY < 0 ? 1 : -1;
      const parsed = parseFloat(target.value);
      const baseValue = Number.isFinite(parsed) ? parsed : 0;
      let newValue = baseValue + step * direction;

      const min = target.min !== '' ? parseFloat(target.min) : -Infinity;
      const max = target.max !== '' ? parseFloat(target.max) : Infinity;
      newValue = Math.max(min, Math.min(max, newValue));

      // 按 step 精度归整，避免 0.1 + 0.2 = 0.30000000004 这类浮点抖动
      const decimals = (stepStr.split('.')[1] || '').length;
      if (decimals > 0) newValue = parseFloat(newValue.toFixed(decimals));

      // 通过原生 setter 改写 value 后派发 input 事件，触发 React 的 onChange
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set;
      if (!setter) return;
      setter.call(target, String(newValue));
      target.dispatchEvent(new Event('input', { bubbles: true }));
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [containerRef]);
}
