import { describe, it, expect, beforeAll } from 'vitest';
import { serializeDocument, parseDocumentFile } from './documentSerializer';
import type { AnimationClip, SceneObject } from '../types';

// node 环境无 FileReader，用最小 shim 走 File.text()，以覆盖 parseDocumentFile 的校验分支
class FileReaderShim {
  onload: ((e: { target: { result: string } }) => void) | null = null;
  onerror: (() => void) | null = null;
  readAsText(file: File) {
    file.text().then(
      (text) => this.onload?.({ target: { result: text } }),
      () => this.onerror?.(),
    );
  }
}

beforeAll(() => {
  (globalThis as Record<string, unknown>).FileReader = FileReaderShim;
});

const baseState = {
  objects: [] as SceneObject[],
  animations: [] as AnimationClip[],
  globalDurationMs: 8000,
  canvasWidth: 1280,
  canvasHeight: 720,
  canvasBgColor: '#abcdef',
};

function makeFile(content: unknown): File {
  return new File([JSON.stringify(content)], 'x.biodraw', { type: 'application/json' });
}

describe('serializeDocument', () => {
  it('写入 version=1、savedAt，并复制画布字段', () => {
    const snap = serializeDocument(baseState);
    expect(snap.version).toBe(1);
    expect(typeof snap.savedAt).toBe('string');
    expect(snap.globalDurationMs).toBe(8000);
    expect(snap.canvasBgColor).toBe('#abcdef');
  });

  it('深拷贝 objects，不与源共享引用', () => {
    const obj = { id: 'a', data: { points: [1, 2, 3] } } as unknown as SceneObject;
    const snap = serializeDocument({ ...baseState, objects: [obj] });
    expect(snap.objects[0]).not.toBe(obj);
    expect(snap.objects[0]).toEqual(obj);
  });
});

describe('parseDocumentFile', () => {
  it('serialize → parse 往返保持数据', async () => {
    const snap = serializeDocument({ ...baseState, globalDurationMs: 1234 });
    const parsed = await parseDocumentFile(makeFile(snap));
    expect(parsed.globalDurationMs).toBe(1234);
    expect(parsed.canvasBgColor).toBe('#abcdef');
  });

  it('版本不符时拒绝', async () => {
    await expect(parseDocumentFile(makeFile({ ...serializeDocument(baseState), version: 99 }))).rejects.toThrow();
  });

  it('结构非法时拒绝', async () => {
    await expect(parseDocumentFile(makeFile({ objects: 'not-array' }))).rejects.toThrow();
  });

  it('version 字段缺失时仍接受（向后兼容，锁住 !==undefined 守卫）', async () => {
    const snap = serializeDocument(baseState) as Record<string, unknown>;
    delete snap.version;
    const parsed = await parseDocumentFile(makeFile(snap));
    expect(parsed.globalDurationMs).toBe(8000);
  });

  it('canvasBgColor 缺省时回退 #ffffff', async () => {
    const snap = serializeDocument(baseState) as Record<string, unknown>;
    delete snap.canvasBgColor;
    const parsed = await parseDocumentFile(makeFile(snap));
    expect(parsed.canvasBgColor).toBe('#ffffff');
  });
});
