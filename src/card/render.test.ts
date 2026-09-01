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

import { buildTestScene, renderTestFrame } from './fixtures.ts'
import { RARITY_PRESETS } from './rarity.ts'
import { renderFrameBlurred } from './render.ts'

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

/**
 * 上半分が赤、下半分が青の縦長画像を作る。
 * どちらの色が出るかで、切り取りがどちらに寄ったか分かる。
 */
function twoToneImage(): OffscreenCanvas {
  const canvas = new OffscreenCanvas(200, 600)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D コンテキストを取得できませんでした')
  ctx.fillStyle = '#ff0000'
  ctx.fillRect(0, 0, 200, 300)
  ctx.fillStyle = '#0000ff'
  ctx.fillRect(0, 300, 200, 300)
  return canvas
}

/**
 * 縦長の画像をカードに入れ、中央から `dy` px ずれた位置の色が
 * 赤寄りか青寄りかを返す。
 *
 * @param focusY - 切り取り位置。0 で画像の上、1 で下が残る
 * @param dy - カード中央からの縦のずれ（px）
 */
function toneAt(focusY: number, dy: number): '赤' | '青' {
  const image = twoToneImage()
  const scene = { ...buildTestScene('white'), image, imageWidth: 200, imageHeight: 600, focusY }
  const canvas = new OffscreenCanvas(scene.width, scene.height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D コンテキストを取得できませんでした')
  ctx.clearRect(0, 0, scene.width, scene.height)
  // 登場が終わってカードが定位置にいる時刻
  renderFrameBlurred(ctx, 4, scene, null)
  const { data } = ctx.getImageData(scene.width / 2, scene.height / 2 + dy, 1, 1)
  const [red = 0, , blue = 0] = data
  return red > blue ? '赤' : '青'
}

describe('アートワークの切り取り位置', () => {
  it('0 なら画像の上、1 なら下が残る', () => {
    // 縦長の写真を横長のカードに入れると上下が切れる。
    // 顔が上にあるときは 0 側へ寄せれば入る
    expect(toneAt(0, 0)).toBe('赤')
    expect(toneAt(1, 0)).toBe('青')
  })

  it('既定の 0.5 なら、色の境目がカードの中央に来る', () => {
    expect(toneAt(0.5, -60)).toBe('赤')
    expect(toneAt(0.5, 60)).toBe('青')
  })
})
