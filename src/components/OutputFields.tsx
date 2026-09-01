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

interface OutputFieldsProps {
  settings: Settings
  update: UpdateSetting
}

/** 出力の形（向き・大きさ・fps・ブラー・画質）と、粒の種。 */
export function OutputFields({ settings, update }: OutputFieldsProps) {
  const { orientation, sizeId, fps, motionBlur, qualityId, seed, loop } = settings

  return (
    <>
      <section {...stylex.props(ui.field, ui.fieldRow)}>
        <label {...stylex.props(ui.fieldSub)}>
          <span {...stylex.props(ui.label)}>向き</span>
          <select
            {...stylex.props(ui.input)}
            value={orientation}
            onChange={(event) => {
              if (isOrientation(event.target.value)) update('orientation', event.target.value)
            }}
          >
            <option value="landscape">横長</option>
            <option value="portrait">縦長</option>
          </select>
        </label>
        <label {...stylex.props(ui.fieldSub)}>
          <span {...stylex.props(ui.label)}>サイズ</span>
          <select
            {...stylex.props(ui.input)}
            value={sizeId}
            onChange={(event) => update('sizeId', event.target.value)}
          >
            {SIZE_PRESETS.map((preset) => {
              const frame = resolveFrameSize(preset, orientation)
              return (
                <option key={preset.id} value={preset.id}>
                  {preset.label} ({frame.width}×{frame.height})
                </option>
              )
            })}
          </select>
        </label>
      </section>

      <section {...stylex.props(ui.field, ui.fieldRow)}>
        <label {...stylex.props(ui.fieldSub)}>
          <span {...stylex.props(ui.label)}>fps</span>
          <select
            {...stylex.props(ui.input)}
            value={fps}
            onChange={(event) => update('fps', Number(event.target.value))}
          >
            {FPS_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label {...stylex.props(ui.fieldSub)}>
          <span {...stylex.props(ui.label)}>ブラー</span>
          <select
            {...stylex.props(ui.input)}
            value={motionBlur}
            onChange={(event) => update('motionBlur', Number(event.target.value))}
          >
            {MOTION_BLUR_OPTIONS.map((option) => (
              <option key={option.samples} value={option.samples}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label {...stylex.props(ui.fieldSub)}>
          <span {...stylex.props(ui.label)}>画質</span>
          <select
            {...stylex.props(ui.input)}
            value={qualityId}
            onChange={(event) => update('qualityId', event.target.value)}
          >
            {QUALITY_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section {...stylex.props(ui.field, ui.fieldRow)}>
        <label {...stylex.props(ui.fieldSub)}>
          <span {...stylex.props(ui.label)}>パーティクルの種</span>
          <div {...stylex.props(ui.inputRow)}>
            <input
              type="number"
              {...stylex.props(ui.input)}
              value={seed}
              min={0}
              step={1}
              onChange={(event) =>
                update('seed', Math.max(0, Math.floor(Number(event.target.value) || 0)))
              }
            />
            <button
              type="button"
              {...stylex.props(ui.button)}
              title="別の配置を引き直す"
              onClick={() => update('seed', drawSeed())}
            >
              🎲
            </button>
          </div>
        </label>
      </section>

      <section {...stylex.props(ui.field)}>
        <label {...stylex.props(ui.checkbox)}>
          <input
            type="checkbox"
            checked={loop}
            onChange={(event) => update('loop', event.target.checked)}
          />
          ループ用（最後のフェードアウトを省く）
        </label>
      </section>
    </>
  )
}
