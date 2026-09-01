import * as stylex from '@stylexjs/stylex'

import type { Settings } from '../settings.ts'
import { ui } from '../ui.ts'
import type { UpdateSetting } from '../useSettings.ts'

interface CardFieldsProps {
  settings: Settings
  update: UpdateSetting
  /** 実際にカードへ出るバッジ。未指定ならレアリティごとの既定値。 */
  effectiveBadge: string
  /** 書き出す前に見せる、推定のファイルサイズ（MB）。 */
  estimatedSizeMb: number
}

/** カードに載る文字と、動画の尺。 */
export function CardFields({ settings, update, effectiveBadge, estimatedSizeMb }: CardFieldsProps) {
  const { badge, title, subtitle, duration } = settings

  return (
    <>
      <section {...stylex.props(ui.field)}>
        <label {...stylex.props(ui.label)} htmlFor="badge">
          ランク表記（空ならバッジを出さない）
        </label>
        <div {...stylex.props(ui.inputRow)}>
          <input
            id="badge"
            type="text"
            {...stylex.props(ui.input)}
            value={effectiveBadge}
            maxLength={12}
            onChange={(event) => update('badge', event.target.value)}
          />
          <button
            type="button"
            {...stylex.props(ui.button)}
            title="レアリティごとの既定値に戻す"
            disabled={badge === null}
            onClick={() => update('badge', null)}
          >
            ↺
          </button>
        </div>
      </section>

      <section {...stylex.props(ui.field)}>
        <label {...stylex.props(ui.label)} htmlFor="title">
          カード名（空なら帯を出さない）
        </label>
        <input
          id="title"
          type="text"
          {...stylex.props(ui.input)}
          value={title}
          placeholder="例: 伝説のドラゴン"
          onChange={(event) => update('title', event.target.value)}
        />
        <input
          type="text"
          {...stylex.props(ui.input)}
          value={subtitle}
          placeholder="サブテキスト（任意）"
          onChange={(event) => update('subtitle', event.target.value)}
        />
      </section>

      <section {...stylex.props(ui.field)}>
        <label {...stylex.props(ui.label)} htmlFor="duration">
          尺: {duration.toFixed(1)} 秒（推定 {estimatedSizeMb.toFixed(1)} MB）
        </label>
        <input
          id="duration"
          type="range"
          min={2}
          max={30}
          step={0.5}
          value={duration}
          onChange={(event) => update('duration', Number(event.target.value))}
        />
      </section>
    </>
  )
}
