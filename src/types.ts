/** アプリ全体で共有する型。 */

/** 読み込み済みのアートワーク。 */
export interface Artwork {
  /** 描画に使うデコード済み画像。 */
  bitmap: ImageBitmap
  width: number
  height: number
  /** 元ファイル名。書き出しファイル名の既定値に使う。 */
  fileName: string
}

/**
 * カードの向き。
 * 配信のアラート枠は横長なことが多いので、寝かせた `landscape` を既定にしている。
 */
export type Orientation = 'landscape' | 'portrait'

/**
 * 文字列が {@link Orientation} かどうかを判定する。
 *
 * select の `value` は string でしか取れないため、型で決めつけずここを通す。
 *
 * @param value - 判定する文字列
 */
export function isOrientation(value: string): value is Orientation {
  return value === 'landscape' || value === 'portrait'
}

/** 出力解像度のプリセット。実際の幅と高さは向きによって入れ替わる。 */
export interface SizePreset {
  id: string
  label: string
  /** 長辺の長さ（px）。 */
  long: number
  /** 短辺の長さ（px）。 */
  short: number
}

/**
 * カード自体は 2:3 だが、フレームはそれより長辺方向に広く取る。
 * グローとパーティクルがフレーム端で切られると、透過素材に四角い縁が出るため。
 */
/**
 * 出力サイズの候補。
 *
 * `id` はブラウザに保存した設定の鍵なので、増やすのはよいが変えてはいけない。
 * そのため `md` が「大」だったりと、id とラベルは必ずしも一致しない。
 *
 * 既定の 800x600 は Streamlabs のアラートボックスの慣習サイズ。ここに合わせて
 * おくと Image Size 100% で収まり、はみ出さない。
 */
export const SIZE_PRESETS: readonly SizePreset[] = [
  { id: 'sm', label: '小', long: 720, short: 560 },
  { id: 'alert', label: '標準（アラート向け）', long: 800, short: 600 },
  { id: 'md', label: '大', long: 900, short: 700 },
  { id: 'lg', label: '特大', long: 1080, short: 840 },
]

/** 出力フレームの実寸。 */
export interface FrameSize {
  width: number
  height: number
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
  return orientation === 'landscape'
    ? { width: preset.long, height: preset.short }
    : { width: preset.short, height: preset.long }
}

/** 画質プリセット。値はビットレート（bps）。 */
export interface QualityPreset {
  id: string
  label: string
  bitrate: number
}

export const QUALITY_PRESETS: readonly QualityPreset[] = [
  { id: 'low', label: '軽い (3 Mbps)', bitrate: 3_000_000 },
  { id: 'mid', label: '標準 (6 Mbps)', bitrate: 6_000_000 },
  { id: 'high', label: '高画質 (12 Mbps)', bitrate: 12_000_000 },
]
