// 视频编码参数决策模块：bitrate 估算 + codec 候选优先级。
// 不依赖 React/Konva/DOM 之外的浏览器 API。

export type VideoFormat = 'mp4' | 'webm';

export interface CodecCandidate {
  format: VideoFormat;
  /** WebCodecs codec string，如 'avc1.640032' / 'vp09.00.10.08' / 'vp8' */
  codec: string;
  /** mp4-muxer / webm-muxer 内部使用的 codec 标识 */
  muxerCodec: 'avc' | 'vp9' | 'vp8';
  extension: 'mp4' | 'webm';
}

/**
 * 按分辨率 × fps 线性估算 bitrate。
 * 参考 YouTube 推荐：1080p30 ≈ 8 Mbps，720p30 ≈ 5 Mbps，480p30 ≈ 2.5 Mbps。
 * 取每像素每秒 0.1 bit 为基线。
 */
export const getDefaultBitrate = (width: number, height: number, fps: number): number => {
  const pixelsPerSecond = width * height * fps;
  const bitsPerPixel = 0.1;
  const raw = Math.round(pixelsPerSecond * bitsPerPixel);
  return Math.max(1_000_000, Math.min(20_000_000, raw));
};

/**
 * 返回按优先级排列的 codec 候选表。
 * 首选用户指定 format，其次降级到另一格式以最大化兼容性。
 */
export const getCodecCandidates = (preferred: VideoFormat): CodecCandidate[] => {
  const mp4Candidates: CodecCandidate[] = [
    { format: 'mp4', codec: 'avc1.640032', muxerCodec: 'avc', extension: 'mp4' },
  ];
  const webmCandidates: CodecCandidate[] = [
    { format: 'webm', codec: 'vp09.00.10.08', muxerCodec: 'vp9', extension: 'webm' },
    { format: 'webm', codec: 'vp8', muxerCodec: 'vp8', extension: 'webm' },
  ];
  return preferred === 'mp4'
    ? [...mp4Candidates, ...webmCandidates]
    : [...webmCandidates, ...mp4Candidates];
};
