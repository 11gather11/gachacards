/**
 * 透過 WebM の書き出し。
 *
 * Chrome の WebCodecs は `VideoEncoder` の `alpha: "keep"` を実装していないため、
 * ブラウザ標準の MediaRecorder でも WebCodecs 直叩きでも透過動画は作れない。
 * mediabunny は色とアルファを2本の VP9 ストリームに分けてエンコードし、
 * WebM の alpha side data として多重化してくれるので、ここではそれに任せている。
 */

import { BufferTarget, CanvasSource, Output, WebMOutputFormat, canEncodeVideo } from "mediabunny";

import type { CardScene } from "../card/render.ts";
import { renderFrame } from "../card/render.ts";

/** 書き出しの設定。 */
export interface ExportOptions {
  scene: CardScene;
  /** フレームレート（fps）。 */
  fps: number;
  /** 目標ビットレート（bps）。 */
  bitrate: number;
  /** 進捗通知。0-1 の比率が渡る。 */
  onProgress?: (ratio: number) => void;
  /** 中断用シグナル。 */
  signal?: AbortSignal;
}

/** 書き出し結果。 */
export interface ExportResult {
  blob: Blob;
  /** 実際に書き出したフレーム数。 */
  frameCount: number;
  /** 書き出しにかかった時間（ミリ秒）。 */
  elapsedMs: number;
}

/** この環境で透過 WebM を書き出せるかどうか。 */
export async function canExportTransparentWebm(): Promise<boolean> {
  try {
    return await canEncodeVideo("vp9", { width: 640, height: 960 });
  } catch {
    return false;
  }
}

/**
 * シーンを透過 WebM に書き出す。
 *
 * 描画はプレビューと同じ {@link renderFrame} を使うため、画面で見えたものがそのまま出る。
 *
 * @param options - 書き出し設定
 * @returns 生成された WebM の Blob と統計情報
 * @throws 中断された場合、または VP9 エンコードが利用できない場合
 *
 * @example
 * const { blob } = await exportWebm({ scene, fps: 30, bitrate: 6_000_000 });
 * const url = URL.createObjectURL(blob);
 */
export async function exportWebm(options: ExportOptions): Promise<ExportResult> {
  const { scene, fps, bitrate, onProgress, signal } = options;
  const startedAt = performance.now();

  const canvas = new OffscreenCanvas(scene.width, scene.height);
  // 透過を保つため alpha を明示し、読み戻さないので willReadFrequently は付けない
  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) throw new Error("2D コンテキストを取得できませんでした");

  const output = new Output({
    format: new WebMOutputFormat(),
    target: new BufferTarget(),
  });

  const source = new CanvasSource(canvas, {
    codec: "vp9",
    bitrate,
    // これを付けないと色だけが焼かれて背景が黒く潰れる
    alpha: "keep",
  });

  output.addVideoTrack(source, { frameRate: fps });
  await output.start();

  const frameCount = Math.max(1, Math.round(scene.duration * fps));
  const frameDuration = 1 / fps;

  try {
    for (let index = 0; index < frameCount; index++) {
      if (signal?.aborted) throw new Error("書き出しを中断しました");

      const time = index * frameDuration;
      ctx.clearRect(0, 0, scene.width, scene.height);
      renderFrame(ctx, time, scene);
      await source.add(time, frameDuration);

      onProgress?.((index + 1) / frameCount);

      // エンコードは同期的に詰まるため、時々制御を返して UI の更新を通す
      if (index % 5 === 4) await new Promise((resolve) => setTimeout(resolve, 0));
    }

    await output.finalize();
  } catch (error) {
    // 途中で失敗しても、開いたままの Output がリソースを掴み続けないよう畳む
    await output.cancel().catch(() => undefined);
    throw error;
  }

  const buffer = output.target.buffer;
  if (!buffer) throw new Error("書き出しに失敗しました（出力が空です）");

  return {
    blob: new Blob([buffer], { type: "video/webm" }),
    frameCount,
    elapsedMs: performance.now() - startedAt,
  };
}
