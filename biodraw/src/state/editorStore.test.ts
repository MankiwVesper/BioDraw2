import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore } from './editorStore';
import type { AnimationClip, SceneObject } from '../types';

function makeObj(id: string, extra: Partial<SceneObject> = {}): SceneObject {
  return {
    id, type: 'rect', name: '', x: 0, y: 0, width: 50, height: 50,
    rotation: 0, scaleX: 1, scaleY: 1, opacity: 1, visible: true, zIndex: 0,
    animationIds: [],
    ...extra,
  };
}

function makeClip(id: string, objectId: string): AnimationClip {
  return { id, objectId, type: 'move', startTimeMs: 0, durationMs: 1000, payload: { fromX: 0, fromY: 0, toX: 10, toY: 0 } };
}

// 直接铺设已知的 objects/历史基线，隔离每个用例
function setObjects(...objs: SceneObject[]) {
  useEditorStore.setState({
    objects: objs, animations: [], past: [], future: [],
    selectedIds: [], groupEditingId: null, hasUnsavedChanges: false,
  });
}

const ids = () => useEditorStore.getState().objects.map((o) => o.id);
const get = () => useEditorStore.getState();

beforeEach(() => {
  useEditorStore.setState({ globalDurationMs: 10000 });
  setObjects();
});

describe('历史：pushHistory / undo / redo', () => {
  it('addSceneObject 入历史，undo 撤销、redo 重做', () => {
    get().addSceneObject(makeObj('a'));
    expect(ids()).toEqual(['a']);
    get().undo();
    expect(get().objects).toHaveLength(0);
    get().redo();
    expect(ids()).toEqual(['a']);
  });

  it('undo 后标记 hasUnsavedChanges（B6）', () => {
    get().addSceneObject(makeObj('a'));
    get().markSaved();
    expect(get().hasUnsavedChanges).toBe(false);
    get().undo();
    expect(get().hasUnsavedChanges).toBe(true);
  });

  it('toggleObjectLock 不入历史（元操作）', () => {
    setObjects(makeObj('a'));
    const pastBefore = get().past.length;
    get().toggleObjectLock('a');
    expect(get().objects[0].locked).toBe(true);
    expect(get().past.length).toBe(pastBefore);
  });

  it('addSceneObjects 批量加入仅一条历史，可一步 undo（B1）', () => {
    get().addSceneObjects([makeObj('a'), makeObj('b'), makeObj('c')]);
    expect(get().objects).toHaveLength(3);
    get().undo();
    expect(get().objects).toHaveLength(0);
  });
});

describe('组合', () => {
  it('groupObjects 赋同一 groupId 并使成员 z-order 连续', () => {
    setObjects(makeObj('A'), makeObj('C'), makeObj('B'));
    get().groupObjects(['A', 'B']);
    const objs = get().objects;
    const gA = objs.find((o) => o.id === 'A')!.groupId;
    expect(gA).toBeTruthy();
    expect(objs.find((o) => o.id === 'B')!.groupId).toBe(gA);
    const arr = ids();
    expect(Math.abs(arr.indexOf('A') - arr.indexOf('B'))).toBe(1);
  });

  it('组合时清掉只剩单成员的旧组（孤儿清理）', () => {
    setObjects(makeObj('A', { groupId: 'g1' }), makeObj('B', { groupId: 'g1' }), makeObj('C'));
    get().groupObjects(['A', 'C']);
    const objs = get().objects;
    expect(objs.find((o) => o.id === 'B')!.groupId).toBeUndefined();
    expect(objs.find((o) => o.id === 'A')!.groupId).toBe(objs.find((o) => o.id === 'C')!.groupId);
  });

  it('ungroupObjects 清除 groupId', () => {
    setObjects(makeObj('A', { groupId: 'g1' }), makeObj('B', { groupId: 'g1' }));
    get().ungroupObjects('g1');
    expect(get().objects.every((o) => o.groupId === undefined)).toBe(true);
  });

  it('duplicateObjects 复制整组得到新组（共享新 groupId、非旧组）', () => {
    setObjects(makeObj('A', { groupId: 'g1' }), makeObj('B', { groupId: 'g1' }));
    get().duplicateObjects(['A', 'B']);
    const copies = get().objects.filter((o) => o.id !== 'A' && o.id !== 'B');
    expect(copies).toHaveLength(2);
    expect(copies[0].groupId).toBeTruthy();
    expect(copies[0].groupId).toBe(copies[1].groupId);
    expect(copies[0].groupId).not.toBe('g1');
  });
});

describe('图层：整组当一层', () => {
  it('moveMultipleObjectsForward 把整组跨过上方整组', () => {
    setObjects(
      makeObj('A', { groupId: 'g1' }), makeObj('B', { groupId: 'g1' }), makeObj('C', { groupId: 'g1' }),
      makeObj('D', { groupId: 'g2' }), makeObj('E', { groupId: 'g2' }), makeObj('F', { groupId: 'g2' }),
    );
    get().moveMultipleObjectsForward(['A', 'B', 'C']);
    expect(ids().join('')).toBe('DEFABC');
  });

  it('moveMultipleObjectsBackward 把整组跨过下方整组', () => {
    setObjects(
      makeObj('A', { groupId: 'g1' }), makeObj('B', { groupId: 'g1' }), makeObj('C', { groupId: 'g1' }),
      makeObj('D', { groupId: 'g2' }), makeObj('E', { groupId: 'g2' }), makeObj('F', { groupId: 'g2' }),
    );
    get().moveMultipleObjectsBackward(['D', 'E', 'F']);
    expect(ids().join('')).toBe('DEFABC');
  });
});

describe('animationIds 反规范化索引同步', () => {
  it('addAnimationClip / removeAnimationClip 同步 objects.animationIds', () => {
    setObjects(makeObj('A'));
    get().addAnimationClip(makeClip('c1', 'A'));
    expect(get().objects[0].animationIds).toContain('c1');
    get().removeAnimationClip('c1');
    expect(get().objects[0].animationIds).not.toContain('c1');
  });

  it('removeSceneObject 连带删除其 clips', () => {
    setObjects(makeObj('A'));
    get().addAnimationClip(makeClip('c1', 'A'));
    get().removeSceneObject('A');
    expect(get().objects).toHaveLength(0);
    expect(get().animations).toHaveLength(0);
  });

  it('removeAnimationClip 删除不存在的 clip 是 no-op（不留历史、不标脏）', () => {
    setObjects(makeObj('A'));
    get().removeAnimationClip('nope');
    expect(get().past).toHaveLength(0);
    expect(get().hasUnsavedChanges).toBe(false);
  });

  it('removeAnimationClips 传入全不存在的 ids 是 no-op（不留历史、不标脏）', () => {
    setObjects(makeObj('A'));
    get().removeAnimationClips(['nope1', 'nope2']);
    expect(get().past).toHaveLength(0);
    expect(get().hasUnsavedChanges).toBe(false);
  });

  it('removeAnimationClips 部分存在时仍删除存在的、忽略不存在的', () => {
    setObjects(makeObj('A'));
    get().addAnimationClip(makeClip('c1', 'A'));
    get().removeAnimationClips(['c1', 'nope']);
    expect(get().animations).toHaveLength(0);
    expect(get().objects[0].animationIds).not.toContain('c1');
  });
});

describe('新对象与锁定保护', () => {
  it('addSceneObject 给新对象初始 appearSegments [0, globalDurationMs]', () => {
    useEditorStore.setState({ globalDurationMs: 8000 });
    get().addSceneObject(makeObj('a'));
    expect(get().objects[0].appearSegments).toEqual([
      { id: expect.any(String), startMs: 0, endMs: 8000 },
    ]);
  });

  it('removeSceneObject 跳过锁定对象', () => {
    setObjects(makeObj('A', { locked: true }));
    get().removeSceneObject('A');
    expect(get().objects).toHaveLength(1);
  });
});
