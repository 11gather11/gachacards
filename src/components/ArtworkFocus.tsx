import * as stylex from '@stylexjs/stylex'

import type { Settings } from '../settings.ts'
import { colors } from '../theme.stylex.ts'
import { ui } from '../ui.ts'
import type { UpdateSetting } from '../useSettings.ts'

const styles = stylex.create({
  /** 端のラベルをスライダーの左右に添える。 */
  ends: {
    display: 'flex',
    justifyContent: 'space-between',
    color: colors.textDim,
    fontSize: 11,
  },
})

interface ArtworkFocusProps {
  settings: Settings
  update: UpdateSetting
  /** 取り込んだ画像の実寸（px）。 */
  imageWidth: number
  imageHeight: number
  /** アートワークを収める枠の実寸（px）。 */
  frameWidth: number
  frameHeight: number
}

/**
 * 切り取り位置の調整。
 *
 * 画像は枠を隙間なく埋めるまで拡大されるので、縦横比が枠と違えば必ず
 * どちらかがはみ出す。縦長の写真を横長のカードに入れると上下が切れ、
 * 上のほうにある顔が入らない。そこをずらせるようにする。
 *
 * はみ出していない軸のスライダーは出さない。動かしても何も起きない
 * つまみが並んでいると、効かない設定だと思われる。
 */
export function ArtworkFocus({
  settings,
  update,
  imageWidth,
  imageHeight,
  frameWidth,
  frameHeight,
}: ArtworkFocusProps) {
  if (imageWidth === 0 || imageHeight === 0) return null

  // 枠より縦長なら上下が切れる。横長なら左右が切れる
  const imageAspect = imageWidth / imageHeight
  const frameAspect = frameWidth / frameHeight
  // 比がほぼ同じなら切り落とすところが無いので、つまみを出さない
  const ratio = imageAspect / frameAspect
  if (ratio > 0.98 && ratio < 1.02) return null

  const isVertical = ratio < 1
  const key = isVertical ? 'focusY' : 'focusX'
  const value = isVertical ? settings.focusY : settings.focusX

  return (
    <label {...stylex.props(ui.field)}>
      <span {...stylex.props(ui.label)}>
        {isVertical ? '切り取り位置（上下）' : '切り取り位置（左右）'}
      </span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        onChange={(event) => update(key, Number(event.target.value))}
      />
      <span {...stylex.props(styles.ends)}>
        <span>{isVertical ? '上を残す' : '左を残す'}</span>
        <span>{isVertical ? '下を残す' : '右を残す'}</span>
      </span>
    </label>
  )
}
