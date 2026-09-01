/**
 * 描画のうち、環境に依らない性質のテスト。
 *
 * 同じ時刻を描き直せば同じ絵になること、どのレアリティでもフレームの縁が
 * 透明のままであること。canvas の実装が違っても成り立つはずの話なので、
 * CI でも走らせる。
 *
 * 絵そのものが変わっていないかは fingerprint.test.ts のほうで見る。
 * そちらは OS をまたげないので、手元でだけ走らせている。
 */

import { describe, expect, it } from 'vite-plus/test'

import { renderTestFrame } from './fixtures.ts'
import { RARITY_PRESETS } from './rarity.ts'

/** 縁を調べる時刻の刻み（秒）。細かくするほど遅くなる。 */
const EDGE_SCAN_STEP = 0.5

/** 縁の走査に許す時間（ミリ秒）。 */
const EDGE_SCAN_TIMEOUT_MS = 120_000

/** フレームの縁 1px で、いちばん濃いアルファを返す。 */
function edgeAlpha(data: Uint8ClampedArray, width: number, height: number): number {
  let max = 0
  for (let x = 0; x < width; x++) {
    max = Math.max(max, data[x * 4 + 3] ?? 0, data[((height - 1) * width + x) * 4 + 3] ?? 0)
  }
  for (let y = 0; y < height; y++) {
    max = Math.max(max, data[y * width * 4 + 3] ?? 0, data[(y * width + width - 1) * 4 + 3] ?? 0)
  }
  return max
}

describe('renderFrameBlurred', () => {
  it('同じ時刻を描き直しても同じ絵になる', () => {
    const first = renderTestFrame('rainbow', 4.5)
    const second = renderTestFrame('rainbow', 4.5)
    expect([...second.data]).toEqual([...first.data])
  })

  it(
    'どのレアリティでもフレームの縁は透明のまま',
    () => {
      // 端に光が残ると、配信画面に四角い板が乗る。演出を足すたびに壊れうるので、
      // 尺全体を粗く走査して押さえておく
      for (const preset of RARITY_PRESETS) {
        for (let time = 0; time <= 8; time += EDGE_SCAN_STEP) {
          const image = renderTestFrame(preset.id, time)
          expect(edgeAlpha(image.data, image.width, image.height)).toBe(0)
        }
      }
    },
    // CI のランナーには GPU が無く、canvas がソフトウェア描画になるぶん
    // 手元より桁違いに遅い。既定の 15 秒では 100 フレームも描けずに落ちる
    EDGE_SCAN_TIMEOUT_MS,
  )
})
