import { Slider } from '@astryxdesign/core'

import type { Settings } from '../settings.ts'
import type { UpdateSetting } from '../useSettings.ts'

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
 * はみ出していない軸のつまみは出さない。動かしても何も起きないつまみが
 * 並んでいると、効かない設定だと思われる。
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
  const ratio = imageWidth / imageHeight / (frameWidth / frameHeight)
  // 比がほぼ同じなら切り落とすところが無いので、つまみを出さない
  if (ratio > 0.98 && ratio < 1.02) return null

  const isVertical = ratio < 1

  return (
    <Slider
      label={isVertical ? '切り取り位置（上下）' : '切り取り位置（左右）'}
      description={isVertical ? '0 で上、1 で下が残る' : '0 で左、1 で右が残る'}
      min={0}
      max={1}
      step={0.01}
      value={isVertical ? settings.focusY : settings.focusX}
      formatValue={(value) => value.toFixed(2)}
      valueDisplay="text"
      onChange={(value: number) => update(isVertical ? 'focusY' : 'focusX', value)}
    />
  )
}
