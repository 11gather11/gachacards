/** アプリ全体で共有する型。 */

/** 読み込み済みのアートワーク。 */
export interface Artwork {
  /** 描画に使うデコード済み画像。 */
  bitmap: ImageBitmap;
  width: number;
  height: number;
  /** 元ファイル名。書き出しファイル名の既定値に使う。 */
  fileName: string;
}

/**
 * カードの向き。
 * 配信のアラート枠は横長なことが多いので、寝かせた `landscape` を既定にしている。
 */
export type Orientation = "landscape" | "portrait";

/** 出力解像度のプリセット。実際の幅と高さは向きによって入れ替わる。 */
export interface SizePreset {
  id: string;
  label: string;
  /** 長辺の長さ（px）。 */
  long: number;
  /** 短辺の長さ（px）。 */
  short: number;
}

/**
 * カード自体は 2:3 だが、フレームはそれより長辺方向に広く取る。
 * グローとパーティクルがフレーム端で切られると、透過素材に四角い縁が出るため。
 */
export const SIZE_PRESETS: readonly SizePreset[] = [
  { id: "sm", label: "小", long: 720, short: 560 },
  { id: "md", label: "標準", long: 900, short: 700 },
  { id: "lg", label: "大", long: 1080, short: 840 },
];

/** 出力フレームの実寸。 */
export interface FrameSize {
  width: number;
  height: number;
}

/**
 * プリセットと向きから、実際の出力サイズを決める。
 *
 * @param preset - サイズプリセット
 * @param orientation - カードの向き
 * @returns 出力フレームの幅と高さ（px）
 *
 * @example
 * resolveFrameSize(SIZE_PRESETS[1], "landscape") // => { width: 900, height: 700 }
 */
export function resolveFrameSize(preset: SizePreset, orientation: Orientation): FrameSize {
  return orientation === "landscape"
    ? { width: preset.long, height: preset.short }
    : { width: preset.short, height: preset.long };
}

/** 画質プリセット。値はビットレート（bps）。 */
export interface QualityPreset {
  id: string;
  label: string;
  bitrate: number;
}

export const QUALITY_PRESETS: readonly QualityPreset[] = [
  { id: "low", label: "軽い (3 Mbps)", bitrate: 3_000_000 },
  { id: "mid", label: "標準 (6 Mbps)", bitrate: 6_000_000 },
  { id: "high", label: "高画質 (12 Mbps)", bitrate: 12_000_000 },
];
