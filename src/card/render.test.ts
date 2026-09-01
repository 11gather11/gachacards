/**
 * 描画の回帰テスト。
 *
 * 中身の作りを入れ替えても絵が変わっていないことを確かめる。canvas は
 * OffscreenCanvas・float16・コニックグラデーション・blur フィルタを使うので、
 * Node では動かない。実物の Chromium の中で走らせている（vite.config.ts の test.browser）。
 *
 * ピクセルをそのままハッシュにすると、ラスタライザの 1 段の違いでも落ちて
 * 使い物にならない。代わりに画面を格子に割った平均を、粗い刻みに丸めて残す。
 * 演出の位置や強さが変われば必ず動くが、丸め誤差では動かない粒度にしてある。
 */

import { describe, expect, it } from 'vite-plus/test'

import { TEST_FRAME, TEST_TIMES, buildTestScene } from './fixtures.ts'
import { RARITY_PRESETS } from './rarity.ts'
import { renderFrameBlurred } from './render.ts'

/** 指紋を取る格子の細かさ。読んで形が分かる程度に粗くしてある。 */
const COLS = 12
const ROWS = 9

/**
 * 1 フレームを指紋にする。
 *
 * 格子ごとにアルファと色の平均を出し、16 段階に丸めて 16 進 1 桁で並べる。
 * 目で見てカードの形が分かるので、落ちたときに「どこが変わったか」が読める。
 *
 * @param data - `getImageData` の生データ
 * @param width - フレームの幅（px）
 * @param height - フレームの高さ（px）
 * @returns 行ごとに改行した、`アルファ|色` の格子
 */
function fingerprint(data: Uint8ClampedArray, width: number, height: number): string {
  const rows: string[] = []
  for (let ry = 0; ry < ROWS; ry++) {
    const y0 = Math.floor((ry * height) / ROWS)
    const y1 = Math.floor(((ry + 1) * height) / ROWS)
    let alpha = ''
    let colour = ''
    for (let rx = 0; rx < COLS; rx++) {
      const x0 = Math.floor((rx * width) / COLS)
      const x1 = Math.floor(((rx + 1) * width) / COLS)
      let sumA = 0
      let sumC = 0
      let count = 0
      // 2px おきに間引く。平均を取るので、全部見なくても値はほぼ変わらない
      for (let y = y0; y < y1; y += 2) {
        for (let x = x0; x < x1; x += 2) {
          const i = (y * width + x) * 4
          sumC += (data[i] ?? 0) + (data[i + 1] ?? 0) + (data[i + 2] ?? 0)
          sumA += data[i + 3] ?? 0
          count++
        }
      }
      alpha += Math.min(15, Math.round(sumA / count / 16)).toString(16)
      colour += Math.min(15, Math.round(sumC / count / 3 / 16)).toString(16)
    }
    rows.push(`${alpha}|${colour}`)
  }
  return rows.join('\n')
}

/** 検査用に 1 フレーム描いて、生データを返す。 */
function renderOnce(rarityId: (typeof RARITY_PRESETS)[number]['id'], time: number): ImageData {
  const canvas = new OffscreenCanvas(TEST_FRAME.width, TEST_FRAME.height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D コンテキストを取得できませんでした')
  ctx.clearRect(0, 0, TEST_FRAME.width, TEST_FRAME.height)
  renderFrameBlurred(ctx, time, buildTestScene(rarityId), {
    samples: 2,
    frameDuration: 1 / 30,
    shutter: 0.65,
  })
  return ctx.getImageData(0, 0, TEST_FRAME.width, TEST_FRAME.height)
}

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
  for (const preset of RARITY_PRESETS) {
    for (const time of TEST_TIMES) {
      it(`${preset.id} の ${time.toFixed(2)} 秒が変わっていない`, () => {
        const image = renderOnce(preset.id, time)
        expect(fingerprint(image.data, image.width, image.height)).toMatchSnapshot()
      })
    }
  }

  it('同じ時刻を描き直しても同じ絵になる', () => {
    const first = renderOnce('rainbow', 4.5)
    const second = renderOnce('rainbow', 4.5)
    expect([...second.data]).toEqual([...first.data])
  })

  it('どのレアリティでもフレームの縁は透明のまま', () => {
    // 端に光が残ると、配信画面に四角い板が乗る。演出を足すたびに壊れうるので、
    // 尺全体を粗く走査して押さえておく
    for (const preset of RARITY_PRESETS) {
      for (let time = 0; time <= 8; time += 0.25) {
        const image = renderOnce(preset.id, time)
        expect(edgeAlpha(image.data, image.width, image.height)).toBe(0)
      }
    }
  })
})
