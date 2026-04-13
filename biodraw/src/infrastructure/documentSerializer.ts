import type { AnimationClip, SceneObject } from '../types';

const STORAGE_KEY = 'biodraw_autosave';
const FILE_VERSION = 1;

export type DocumentSnapshot = {
  version: number;
  savedAt: string;
  objects: SceneObject[];
  animations: AnimationClip[];
  globalDurationMs: number;
  canvasWidth: number;
  canvasHeight: number;
  canvasBgColor: string;
};

type SerializableState = {
  objects: SceneObject[];
  animations: AnimationClip[];
  globalDurationMs: number;
  canvasWidth: number;
  canvasHeight: number;
  canvasBgColor: string;
};

export function serializeDocument(state: SerializableState): DocumentSnapshot {
  return {
    version: FILE_VERSION,
    savedAt: new Date().toISOString(),
    objects: JSON.parse(JSON.stringify(state.objects)),
    animations: JSON.parse(JSON.stringify(state.animations)),
    globalDurationMs: state.globalDurationMs,
    canvasWidth: state.canvasWidth,
    canvasHeight: state.canvasHeight,
    canvasBgColor: state.canvasBgColor,
  };
}

export function downloadDocument(state: SerializableState): string {
  const snapshot = serializeDocument(state);
  const json = JSON.stringify(snapshot, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const fileName = `biodraw-${Date.now()}.biodraw`;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return fileName;
}

export function parseDocumentFile(file: File): Promise<DocumentSnapshot> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const data = JSON.parse(text) as DocumentSnapshot;
        if (!Array.isArray(data.objects) || !Array.isArray(data.animations)) {
          reject(new Error('文件格式不正确'));
          return;
        }
        resolve(data);
      } catch {
        reject(new Error('文件解析失败，请确认是有效的 .biodraw 文件'));
      }
    };
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsText(file);
  });
}

export function clearAutoSave(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 静默忽略
  }
}
