/** 例外の扱い。 */

/**
 * catch で受けた値から、画面に出せるメッセージを取り出す。
 *
 * catch の型は `unknown` で、Error とは限らない（throw は何でも投げられるし、
 * DOM や外部ライブラリは Error 以外を投げることがある）。`as Error` で決めつけると、
 * 文字列を投げられたときに `undefined` がそのまま表示されてしまう。
 *
 * @param error - catch で受け取った値
 * @returns 表示用のメッセージ
 *
 * @example
 * try { ... } catch (error) { setError(toErrorMessage(error)); }
 */
export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return String(error)
}
