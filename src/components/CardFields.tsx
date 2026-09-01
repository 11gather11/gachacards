import { Button, Slider, TextInput } from '@astryxdesign/core'
import * as stylex from '@stylexjs/stylex'

import type { Settings } from '../settings.ts'
import { ui } from '../ui.ts'
import type { UpdateSetting } from '../useSettings.ts'

/** バッジに入れられる文字数。長いとカードの角からはみ出す。 */
const BADGE_MAX_LENGTH = 12

const styles = stylex.create({
  /** 入力欄と、その右に付く小さなボタンを並べる。 */
  row: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: 8,
  },
  /** 入力欄のほうを伸ばす。 */
  grow: {
    flex: 1,
    minWidth: 0,
  },
})

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
        <div {...stylex.props(styles.row)}>
          <TextInput
            label="ランク表記"
            description="空ならバッジを出さない"
            value={effectiveBadge}
            // TextInput は maxLength を受け取らないので、こちらで切る
            onChange={(value) => update('badge', value.slice(0, BADGE_MAX_LENGTH))}
            xstyle={styles.grow}
          />
          <Button
            label="レアリティごとの既定値に戻す"
            variant="secondary"
            isIconOnly
            icon="↺"
            isDisabled={badge === null}
            onClick={() => update('badge', null)}
          />
        </div>
      </section>

      <section {...stylex.props(ui.field)}>
        <TextInput
          label="カード名"
          description="空なら帯を出さない"
          value={title}
          placeholder="例: 伝説のドラゴン"
          onChange={(value) => update('title', value)}
        />
        <TextInput
          label="サブテキスト"
          isLabelHidden
          value={subtitle}
          placeholder="サブテキスト（任意）"
          onChange={(value) => update('subtitle', value)}
        />
      </section>

      <section {...stylex.props(ui.field)}>
        <Slider
          label="尺"
          description={`推定 ${estimatedSizeMb.toFixed(1)} MB`}
          min={2}
          max={30}
          step={0.5}
          value={duration}
          formatValue={(value) => `${value.toFixed(1)} 秒`}
          valueDisplay="text"
          onChange={(value: number) => update('duration', value)}
        />
      </section>
    </>
  )
}
