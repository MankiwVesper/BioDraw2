import { describe, it, expect } from 'vitest';
import { cloneDeep } from './clone';

describe('cloneDeep', () => {
  it('深拷贝出结构相等但引用不同的对象', () => {
    const src = { a: 1, nested: { b: [1, 2, 3] } };
    const copy = cloneDeep(src);
    expect(copy).toEqual(src);
    expect(copy).not.toBe(src);
    expect(copy.nested).not.toBe(src.nested);
    expect(copy.nested.b).not.toBe(src.nested.b);
  });

  it('改动副本不影响原对象', () => {
    const src = { list: [{ x: 1 }] };
    const copy = cloneDeep(src);
    copy.list[0].x = 99;
    copy.list.push({ x: 2 });
    expect(src.list).toHaveLength(1);
    expect(src.list[0].x).toBe(1);
  });
});
