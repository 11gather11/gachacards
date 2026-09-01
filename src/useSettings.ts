/**
 * 書き出し設定の持ち方。
 *
 * 項目ごとに `useState` を並べると、値・保存・依存配列・リセットの 4 か所に
 * 同じ一覧を書くことになり、項目を足したときにどれか 1 つを書き忘れる。
 * まとめて 1 つの状態にすれば、その一覧は {@link Settings} の型だけになる。
 */

import { useEffect, useState } from 'react'

import type { Settings } from './settings.ts'
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from './settings.ts'

/** 設定を 1 項目だけ差し替える。 */
export type UpdateSetting = <K extends keyof Settings>(key: K, value: Settings[K]) => void

/** {@link useSettings} が返すもの。 */
export interface SettingsController {
  settings: Settings
  update: UpdateSetting
  /**
   * 既定値へ戻す。1 回目は構えるだけで、2 回目で実際に戻す。
   * 押し間違いでカード名や seed を失うと元に戻せないため。
   */
  reset: () => void
  /** 構えている最中かどうか。ボタンの表示を変えるのに使う。 */
  resetArmed: boolean
}

/** 構えを自動で解くまでの時間（ミリ秒）。 */
const RESET_ARM_MS = 4000

/** 前回の設定。アプリ起動時に一度だけ読む。 */
const INITIAL = loadSettings()

/**
 * 設定を持ち、変更のたびにブラウザへ保存する。
 *
 * @returns 現在の設定と、差し替え・リセットの手段
 *
 * @example
 * const { settings, update } = useSettings()
 * update('duration', 12)
 */
export function useSettings(): SettingsController {
  const [settings, setSettings] = useState<Settings>(INITIAL)
  const [resetArmed, setResetArmed] = useState(false)

  // 別の日に同じカードを作り直せるよう、seed を含めた設定を残しておく
  useEffect(() => {
    saveSettings(settings)
  }, [settings])

  // 構えを置きっぱなしにしない。次に開いたときに構えたままだと、
  // 1 押しで消えたように見えてしまう
  useEffect(() => {
    const timer = resetArmed ? setTimeout(() => setResetArmed(false), RESET_ARM_MS) : null
    return () => {
      if (timer !== null) clearTimeout(timer)
    }
  }, [resetArmed])

  const update: UpdateSetting = (key, value) => {
    setSettings((current) => ({ ...current, [key]: value }))
  }

  const reset = () => {
    if (!resetArmed) {
      setResetArmed(true)
      return
    }
    setResetArmed(false)
    // 既定値の配列をそのまま渡すと、あとでチェックを外したときに既定値ごと変わる
    setSettings({ ...DEFAULT_SETTINGS, via: [...DEFAULT_SETTINGS.via] })
  }

  return { settings, update, reset, resetArmed }
}
