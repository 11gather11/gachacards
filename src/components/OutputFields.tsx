import { Button, CheckboxInput, NumberInput, Selector } from '@astryxdesign/core'
import * as stylex from '@stylexjs/stylex'

import type { Settings } from '../settings.ts'
import { drawSeed } from '../settings.ts'
import { QUALITY_PRESETS, SIZE_PRESETS, isOrientation, resolveFrameSize } from '../types.ts'
import { ui } from '../ui.ts'
import type { UpdateSetting } from '../useSettings.ts'

/** 選べる fps。 */
const FPS_OPTIONS = [24, 30, 60] as const

/**
 * モーションブラーの強さ。サンプル数がそのまま描画回数の倍率になるので、
 * 上げるほど書き出しに時間がかかる。
 */
const MOTION_BLUR_OPTIONS = [
  { samples: 1, label: 'なし' },
  { samples: 2, label: '弱 (2x)' },
  { samples: 4, label: '中 (4x)' },
  { samples: 8, label: '強 (8x)' },
] as const

const styles = stylex.create({
  /**
   * 向きとサイズは縦に積む。Astryx はラベルを欄の上に出すので、
   * 横に 2 つ並べると「標準（アラート向け）(800×600)」が入りきらない
   */
  stack: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  /** 3 つ並べる行。 */
  trio: {
    display: 'flex',
    gap: 8,
  },
  /** 並びの中で均等に伸ばす。 */
  cell: {
    flex: 1,
    minWidth: 0,
  },
  /** 入力欄と、その右に付く小さなボタン。 */
  seed: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: 8,
  },
})

interface OutputFieldsProps {
  settings: Settings
  update: UpdateSetting
}

/** 出力の形（向き・大きさ・fps・ブラー・画質）と、粒の種。 */
export function OutputFields({ settings, update }: OutputFieldsProps) {
  const { orientation, sizeId, fps, motionBlur, qualityId, seed, loop } = settings

  return (
    <>
      <section {...stylex.props(ui.field)}>
        <div {...stylex.props(styles.stack)}>
          <Selector
            label="向き"
            value={orientation}
            options={[
              { value: 'landscape', label: '横長' },
              { value: 'portrait', label: '縦長' },
            ]}
            onChange={(value) => {
              if (isOrientation(value)) update('orientation', value)
            }}
            xstyle={styles.cell}
          />
          <Selector
            label="サイズ"
            value={sizeId}
            options={SIZE_PRESETS.map((preset) => {
              const frame = resolveFrameSize(preset, orientation)
              return { value: preset.id, label: `${preset.label} (${frame.width}×${frame.height})` }
            })}
            onChange={(value) => update('sizeId', value)}
            xstyle={styles.cell}
          />
        </div>
      </section>

      <section {...stylex.props(ui.field)}>
        <div {...stylex.props(styles.trio)}>
          <Selector
            label="fps"
            value={String(fps)}
            options={FPS_OPTIONS.map((value) => ({ value: String(value), label: String(value) }))}
            onChange={(value) => update('fps', Number(value))}
            xstyle={styles.cell}
          />
          <Selector
            label="ブラー"
            value={String(motionBlur)}
            options={MOTION_BLUR_OPTIONS.map((option) => ({
              value: String(option.samples),
              label: option.label,
            }))}
            onChange={(value) => update('motionBlur', Number(value))}
            xstyle={styles.cell}
          />
          <Selector
            label="画質"
            value={qualityId}
            options={QUALITY_PRESETS.map((preset) => ({
              value: preset.id,
              label: preset.label,
            }))}
            onChange={(value) => update('qualityId', value)}
            xstyle={styles.cell}
          />
        </div>
      </section>

      <section {...stylex.props(ui.field)}>
        <div {...stylex.props(styles.seed)}>
          <NumberInput
            label="パーティクルの種"
            description="同じ値なら同じ配置になる"
            value={seed}
            min={0}
            step={1}
            onChange={(value: number) => update('seed', Math.max(0, Math.floor(value || 0)))}
            xstyle={styles.cell}
          />
          <Button
            label="別の配置を引き直す"
            variant="secondary"
            isIconOnly
            icon="🎲"
            onClick={() => update('seed', drawSeed())}
          />
        </div>
      </section>

      <section {...stylex.props(ui.field)}>
        <CheckboxInput
          label="ループ用（最後のフェードアウトを省く）"
          value={loop}
          onChange={(checked) => update('loop', checked)}
        />
      </section>
    </>
  )
}
