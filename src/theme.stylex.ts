import * as stylex from '@stylexjs/stylex'

/**
 * UI の配色。
 *
 * `defineVars` は CSS カスタムプロパティに落ちるので、実行時に値を差し替えれば
 * テーマ切り替えにも使える。ここを直せば UI 全体の色が変わる。
 *
 * ファイル名の `.stylex.ts` は StyleX の規約で、変数を定義できるのはこの形式の
 * ファイルだけ。ほかのファイルに書くとビルド時に弾かれる。
 */
export const colors = stylex.defineVars({
  /** 画面全体の背景。 */
  bg: '#0d1017',
  /** 左パネルの背景。 */
  panel: '#151a24',
  /** 入力欄やボタンなど、パネル上に乗る面。 */
  panelSoft: '#1d2432',
  /** 枠線。 */
  line: '#2a3242',
  /** 通常の文字色。 */
  text: '#e6ebf5',
  /** 補足の文字色。 */
  textDim: '#94a1b8',
  /** 強調色（フォーカスや主ボタン）。 */
  accent: '#ffd24d',
  /** エラー表示の背景。 */
  dangerBg: '#3a1512',
  /** エラー表示の文字色。 */
  dangerText: '#ffb3a7',
})
