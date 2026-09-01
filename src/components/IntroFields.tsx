import { Button, CheckboxInput, Slider, Text } from '@astryxdesign/core'
import * as stylex from '@stylexjs/stylex'

import type { IntroStage } from '../card/intro.ts'
import type { RarityPreset } from '../card/rarity.ts'
import type { Settings } from '../settings.ts'
import { ui } from '../ui.ts'
import type { UpdateSetting } from '../useSettings.ts'

const styles = stylex.create({
  /** 通す色のチェックを、ボタンと一緒に折り返しながら並べる。 */
  via: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 12,
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
  // 尺に収まらず詰められたときだけ、実際の長さを添える
  const isTrimmed = introDuration < introSeconds - 0.05

  return (
    <section {...stylex.props(ui.field)}>
      <CheckboxInput
        label="入りの演出（光が集まって弾ける）"
        value={introMode === 'on'}
        onChange={(checked) => update('introMode', checked ? 'on' : 'off')}
      />
      {introMode === 'on' && (
        <>
          <Slider
            label="入りの長さ"
            description={
              isTrimmed ? `尺に収まらないので ${introDuration.toFixed(1)} 秒に短縮` : undefined
            }
            min={0.5}
            max={8}
            step={0.1}
            value={introSeconds}
            formatValue={(value) => `${value.toFixed(1)} 秒`}
            valueDisplay="text"
            onChange={(value: number) => update('introSeconds', value)}
          />
          {intermediates.length > 0 && (
            <>
              <Text size="sm" color="secondary" weight="semibold">
                途中で通す色（外すと飛ばす）
              </Text>
              <div {...stylex.props(styles.via)}>
                {intermediates.map((preset) => (
                  <CheckboxInput
                    key={preset.id}
                    label={preset.label}
                    value={via.includes(preset.id)}
                    onChange={(checked) =>
                      update(
                        'via',
                        checked ? [...via, preset.id] : via.filter((id) => id !== preset.id),
                      )
                    }
                  />
                ))}
                <Button
                  label="全部"
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    update(
                      'via',
                      intermediates.map((preset) => preset.id),
                    )
                  }
                />
                <Button
                  label="一気に"
                  variant="secondary"
                  size="sm"
                  onClick={() => update('via', [])}
                />
              </div>
            </>
          )}
          <Text size="sm" color="secondary">
            {introStages.map((stage) => stage.rarity.label).join(' → ')}
            {' / '}
            {introDuration.toFixed(2)} 秒
          </Text>
        </>
      )}
    </section>
  )
}
