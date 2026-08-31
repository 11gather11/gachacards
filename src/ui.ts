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
  /** 横に並べるフィールドのまとまり。 */
  fieldRow: {
    display: 'flex',
    flexDirection: 'row',
    gap: 12,
  },
  /** 横並びの中に入る、1 つぶんのフィールド。 */
  fieldSub: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  /** 見出しの小さい文字。 */
  label: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: 600,
  },
  /** テキスト入力・数値入力・セレクト共通。 */
  input: {
    width: '100%',
    padding: '9px 10px',
    backgroundColor: colors.panelSoft,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: colors.line,
    borderRadius: 8,
    color: colors.text,
    font: 'inherit',
    outlineWidth: { default: null, ':focus': 2 },
    outlineStyle: { default: null, ':focus': 'solid' },
    outlineColor: { default: null, ':focus': colors.accent },
    outlineOffset: {
      default: null,
      ':focus': -1,
    },
  },
  /** 入力欄を横に並べるときの器。 */
  inputRow: {
    display: 'flex',
    gap: 6,
  },
  /** 横並びの中の入力欄。潰れないよう最小幅を外す。 */
  inputInRow: {
    minWidth: 0,
  },
  /** 標準のボタン。 */
  button: {
    padding: '10px 14px',
    backgroundColor: colors.panelSoft,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: {
      default: colors.line,
      ':hover:not(:disabled)': colors.accent,
    },
    borderRadius: 8,
    color: colors.text,
    font: 'inherit',
    fontWeight: 600,
    cursor: {
      default: 'pointer',
      ':disabled': 'not-allowed',
    },
    opacity: {
      default: 1,
      ':disabled': 0.5,
    },
  },
  /** 主ボタン。書き出しなど、その画面で一番やりたいこと。 */
  buttonPrimary: {
    backgroundImage: 'linear-gradient(135deg, #ffd24d, #e0a021)',
    borderColor: 'transparent',
    color: '#1a1305',
  },
  /** 横並びの中に置く、詰めたボタン。 */
  buttonInRow: {
    flex: 'none',
    padding: '10px 12px',
  },
  /** 補助的な小さいボタン。 */
  buttonSlim: {
    padding: '4px 10px',
    fontSize: 11,
    fontWeight: 500,
  },
  /** チェックボックスとラベルの組。 */
  checkbox: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    color: colors.textDim,
    cursor: 'pointer',
  },
  /** 状態や結果を出す小さな箱。 */
  notice: {
    margin: 0,
    padding: '8px 10px',
    backgroundColor: colors.panelSoft,
    borderRadius: 8,
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 1.5,
    wordBreak: 'break-all',
  },
  /** エラー用の箱。 */
  noticeError: {
    backgroundColor: colors.dangerBg,
    color: colors.dangerText,
  },
})
