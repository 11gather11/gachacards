import * as stylex from '@stylexjs/stylex'

import type { RarityId } from '../card/rarity.ts'
import { RARITY_PRESETS } from '../card/rarity.ts'
import { colors } from '../theme.stylex.ts'

/**
 * レアリティごとに変わる色は、スタイル関数の引数として受け取る。
 * CSS 変数を style 属性で流し込んでいたときと違い、綴りを間違えれば型で止まる。
 */
const styles = stylex.create({
  list: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 8,
  },
  item: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    padding: '8px 4px',
    backgroundColor: colors.panelSoft,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: colors.line,
    borderRadius: 10,
    color: colors.text,
    font: 'inherit',
    cursor: 'pointer',
  },
  itemActive: (glow: string) => ({
    borderColor: glow,
    boxShadow: `0 0 0 1px ${glow}, 0 0 16px -4px ${glow}`,
  }),
  swatch: {
    width: '100%',
    height: 10,
    borderRadius: 999,
  },
  // 単色でもグラデーションでも同じプロパティで扱えるよう、常に linear-gradient にする。
  // background ショートハンドは StyleX が変数付きで出力してくれない
  swatchFill: (image: string) => ({ backgroundImage: image }),
  label: {
    fontWeight: 700,
  },
  badge: {
    color: colors.textDim,
    fontSize: 10,
  },
})

interface RarityPickerProps {
  value: RarityId
  onChange: (value: RarityId) => void
}

/**
 * レアリティ（保留カラー）の選択ボタン列。
 * 並び順がそのまま信頼度の低い順になっている。
 */
export function RarityPicker({ value, onChange }: RarityPickerProps) {
  return (
    <div {...stylex.props(styles.list)}>
      {RARITY_PRESETS.map((preset) => {
        const isActive = preset.id === value
        // 虹は単色で表せないので、見本だけグラデーションに切り替える
        const base = preset.frameColors[1] ?? preset.frameColors[0] ?? '#ffffff'
        const swatch = preset.rainbowFrame
          ? `linear-gradient(135deg, ${preset.frameColors.join(', ')})`
          : `linear-gradient(${base}, ${base})`
        return (
          <button
            key={preset.id}
            type="button"
            onClick={() => onChange(preset.id)}
            aria-pressed={isActive}
            {...stylex.props(styles.item, isActive && styles.itemActive(preset.glowColor))}
          >
            <span {...stylex.props(styles.swatch, styles.swatchFill(swatch))} />
            <span {...stylex.props(styles.label)}>{preset.label}</span>
            <span {...stylex.props(styles.badge)}>{preset.badge}</span>
          </button>
        )
      })}
    </div>
  )
}
