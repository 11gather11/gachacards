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

/** 出力解像度のプリセット。 */
export interface SizePreset {
  id: string;
  label: string;
  width: number;
  height: number;
}

/**
 * カード自体は 2:3 だが、フレームはそれより横に広く取る。
 * グローとパーティクルがフレーム端で切られると、透過素材に四角い縁が出るため。
 */
export const SIZE_PRESETS: readonly SizePreset[] = [
  { id: "sm", label: "小 (560×720)", width: 560, height: 720 },
  { id: "md", label: "標準 (700×900)", width: 700, height: 900 },
  { id: "lg", label: "大 (840×1080)", width: 840, height: 1080 },
];

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
