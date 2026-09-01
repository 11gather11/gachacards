import * as stylex from '@stylexjs/stylex'

import { colors } from './theme.stylex.ts'

/**
 * 複数のコンポーネントで使い回す部品のスタイル。
 *
 * StyleX には `.input-row .input` のような子孫セレクタが無いので、
 * 「親が子の見た目を変える」書き方はできない。代わりに、変えたい差分を
 * ここで名前付きのスタイルとして持ち、使う側で重ねる。
 */
export const ui = stylex.create({
  /** 縦に積むフィールドのまとまり。 */
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  /** 見出しの小さい文字。 */
  label: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: 600,
  },
})
