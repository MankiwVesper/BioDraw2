import { Muxer as Mp4Muxer, ArrayBufferTarget as Mp4Target } from 'mp4-muxer';
import { Muxer as WebmMuxer, ArrayBufferTarget as WebmTarget } from 'webm-muxer';
import { getCodecCandidates, getDefaultBitrate } from './encoderConfig';
import type { CodecCandidate, VideoFormat } from './encoderConfig';

export interface EncoderOptions {
  width: number;
  height: number;
  fps: number;
  format: VideoFormat;
  bitrate?: number;
}

export interface EncoderResolution {
  format: VideoFormat;
  codec: string;
  extension: 'mp4' | 'webm';
  isDowngraded: boolean;
}

const BACKPRESSURE_LIMIT = 8;

type AnyMuxer =
  | { kind: 'mp4'; muxer: Mp4Muxer<Mp4Target>; target: Mp4Target }
  | { kind: 'webm'; muxer: WebmMuxer<WebmTarget>; target: WebmTarget };

export class VideoExportEncoder {
  private encoder: VideoEncoder;
  private muxer: AnyMuxer;
  private readonly fps: number;
  private readonly keyFrameInterval: number;
  private error: Error | null = null;
  private closed = false;

  static async resolveSupported(opts: EncoderOptions): Promise<EncoderResolution | null> {
    if (typeof VideoEncoder === 'undefined') return null;
    const bitrate = opts.bitrate ?? getDefaultBitrate(opts.width, opts.height, opts.fps);
    const candidates = getCodecCandidates(opts.format);
    for (const c of candidates) {
      try {
        const check = await VideoEncoder.isConfigSupported({
          codec: c.codec,
          width: opts.width,
          height: opts.height,
          bitrate,
          framerate: opts.fps,
        });
        if (check.supported) {
          return {
            format: c.format,
            codec: c.codec,
            extension: c.extension,
            isDowngraded: c.format !== opts.format,
          };
        }
      } catch {
        // 某些浏览器对非法 codec 抛错而不是返回 supported:false
      }
    }
    return null;
  }

  constructor(opts: EncoderOptions, resolution: EncoderResolution) {
    if (opts.fps < 1 || !isFinite(opts.fps)) throw new Error(`无效的帧率：${opts.fps}`);
    if (opts.width < 1 || opts.height < 1) throw new Error(`无效的分辨率：${opts.width}x${opts.height}`);
    this.fps = opts.fps;
    this.keyFrameInterval = Math.max(1, opts.fps);
    const bitrate = opts.bitrate ?? getDefaultBitrate(opts.width, opts.height, opts.fps);

    const candidate = getCodecCandidates(resolution.format).find(
      (c) => c.codec === resolution.codec,
    ) as CodecCandidate;

    this.muxer = this.createMuxer(candidate, opts.width, opts.height);

    this.encoder = new VideoEncoder({
      output: (chunk, meta) => this.handleChunk(chunk, meta),
      error: (e) => {
        this.error = e instanceof Error ? e : new Error(String(e));
      },
    });

    this.encoder.configure({
      codec: resolution.codec,
      width: opts.width,
      height: opts.height,
      bitrate,
      framerate: opts.fps,
    });
  }

  private createMuxer(c: CodecCandidate, width: number, height: number): AnyMuxer {
    if (c.format === 'mp4') {
      const target = new Mp4Target();
      const muxer = new Mp4Muxer({
        target,
        video: { codec: c.muxerCodec as 'avc', width, height },
        fastStart: 'in-memory',
        firstTimestampBehavior: 'offset',
      });
      return { kind: 'mp4', muxer, target };
    }
    const target = new WebmTarget();
    const muxer = new WebmMuxer({
      target,
      video: { codec: c.muxerCodec === 'vp9' ? 'V_VP9' : 'V_VP8', width, height },
      firstTimestampBehavior: 'offset',
    });
    return { kind: 'webm', muxer, target };
  }

  private handleChunk(chunk: EncodedVideoChunk, meta?: EncodedVideoChunkMetadata) {
    if (this.muxer.kind === 'mp4') {
      this.muxer.muxer.addVideoChunk(chunk, meta);
    } else {
      this.muxer.muxer.addVideoChunk(chunk, meta);
    }
  }

  async encodeFrame(source: CanvasImageSource, frameIndex: number): Promise<void> {
    if (this.closed) throw new Error('Encoder already closed');
    if (this.error) throw this.error;

    while (this.encoder.encodeQueueSize > BACKPRESSURE_LIMIT) {
      await new Promise((r) => setTimeout(r, 0));
      if (this.error) throw this.error;
    }

    const timestampUs = Math.round((frameIndex * 1_000_000) / this.fps);
    const durationUs = Math.round(1_000_000 / this.fps);
    const frame = new VideoFrame(source, { timestamp: timestampUs, duration: durationUs });
    try {
      this.encoder.encode(frame, { keyFrame: frameIndex % this.keyFrameInterval === 0 });
    } finally {
      frame.close();
    }
  }

  async finalize(): Promise<Blob> {
    if (this.closed) throw new Error('Encoder already closed');
    await this.encoder.flush();
    if (this.error) throw this.error;
    this.muxer.muxer.finalize();
    const buffer = this.muxer.target.buffer;
    const mime = this.muxer.kind === 'mp4' ? 'video/mp4' : 'video/webm';
    this.closed = true;
    this.encoder.close();
    return new Blob([buffer], { type: mime });
  }

  cancel(): void {
    if (this.closed) return;
    this.closed = true;
    try {
      if (this.encoder.state !== 'closed') this.encoder.close();
    } catch {
      // 已关闭即可
    }
  }
}
