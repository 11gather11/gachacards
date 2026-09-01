import * as stylex from '@stylexjs/stylex'

import type { IntroStage } from '../card/intro.ts'
import type { RarityPreset } from '../card/rarity.ts'
import type { Settings } from '../settings.ts'
import { colors } from '../theme.stylex.ts'
import { ui } from '../ui.ts'
import type { UpdateSetting } from '../useSettings.ts'

const styles = stylex.create({
  /** 通す色のチェックを、ボタンと一緒に折り返しながら並べる。 */
  via: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
  },
  /** 並びの中に置くぶん、チェックとラベルの間を詰める。 */
  viaCheckbox: {
    gap: 5,
    color: colors.text,
  },
})

interface IntroFieldsProps {
  settings: Settings
  update: UpdateSetting
  /** 尺に収まるよう詰めたあとの、実際の長さ（秒）。 */
  introDuration: number
  /** 白と目的の色の間にある、通すかどうかを選べる色。 */
  intermediates: readonly RarityPreset[]
  /** 組み上がった色の段取り。表示にも使う。 */
  introStages: readonly IntroStage[]
}

/** カードが出る前の共通演出の設定。 */
export function IntroFields({
  settings,
  update,
  introDuration,
  intermediates,
  introStages,
}: IntroFieldsProps) {
  const { introMode, introSeconds, via } = settings

  return (
    <section {...stylex.props(ui.field)}>
      <label {...stylex.props(ui.checkbox)}>
        <input
          type="checkbox"
          checked={introMode === 'on'}
          onChange={(event) => update('introMode', event.target.checked ? 'on' : 'off')}
        />
        入りの演出（光が集まって弾ける）
      </label>
      {introMode === 'on' && (
        <>
          <label {...stylex.props(ui.label)} htmlFor="introSeconds">
            入りの長さ: {introSeconds.toFixed(1)} 秒
            {introDuration < introSeconds - 0.05 &&
              `（尺に収まらないので ${introDuration.toFixed(1)} 秒に短縮）`}
          </label>
          <input
            id="introSeconds"
            type="range"
            min={0.5}
            max={8}
            step={0.1}
            value={introSeconds}
            onChange={(event) => update('introSeconds', Number(event.target.value))}
          />
          {intermediates.length > 0 && (
            <>
              <span {...stylex.props(ui.label)}>途中で通す色（外すと飛ばす）</span>
              <div {...stylex.props(styles.via)}>
                {intermediates.map((preset) => (
                  <label key={preset.id} {...stylex.props(ui.checkbox, styles.viaCheckbox)}>
                    <input
                      type="checkbox"
                      checked={via.includes(preset.id)}
                      onChange={(event) =>
                        update(
                          'via',
                          event.target.checked
                            ? [...via, preset.id]
                            : via.filter((id) => id !== preset.id),
                        )
                      }
                    />
                    {preset.label}
                  </label>
                ))}
                <button
                  type="button"
                  {...stylex.props(ui.button, ui.buttonSlim)}
                  onClick={() =>
                    update(
                      'via',
                      intermediates.map((preset) => preset.id),
                    )
                  }
                >
                  全部
                </button>
                <button
                  type="button"
                  {...stylex.props(ui.button, ui.buttonSlim)}
                  onClick={() => update('via', [])}
                >
                  一気に
                </button>
              </div>
            </>
          )}
          <p {...stylex.props(ui.notice)}>
            {introStages.map((stage) => stage.rarity.label).join(' → ')}
            {' / '}
            {introDuration.toFixed(2)} 秒
          </p>
        </>
      )}
    </section>
  )
}
