import { describe, it, expect } from 'vitest';
import { getConflictDomain, sortConflictDomains, CONFLICT_DOMAIN_ORDER } from './conflictDomain';
import type { AnimationClip } from '../types';

describe('getConflictDomain', () => {
  it.each<[AnimationClip['type'], string]>([
    ['move', 'position'],
    ['moveAlongPath', 'position'],
    ['polylineMove', 'position'],
    ['shake', 'position'],
    ['fade', 'opacity'],
    ['scale', 'scale'],
    ['rotate', 'rotation'],
    ['stateChange', 'state'],
  ])('%s → %s', (type, domain) => {
    expect(getConflictDomain(type)).toBe(domain);
  });
});

describe('sortConflictDomains', () => {
  it('按 CONFLICT_DOMAIN_ORDER 排序', () => {
    expect(sortConflictDomains(['state', 'position', 'scale'])).toEqual(['position', 'scale', 'state']);
  });

  it('未知域排到末尾，不改动原数组', () => {
    const input = ['unknown', 'opacity', 'position'];
    const out = sortConflictDomains(input);
    expect(out).toEqual(['position', 'opacity', 'unknown']);
    expect(input).toEqual(['unknown', 'opacity', 'position']);
  });

  it('CONFLICT_DOMAIN_ORDER 为预期顺序', () => {
    expect(CONFLICT_DOMAIN_ORDER).toEqual(['position', 'opacity', 'scale', 'rotation', 'state']);
  });
});
