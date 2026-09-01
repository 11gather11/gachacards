/**
 * テストから使う、決め打ちのシーン組み立て。
 *
 * 描画は時刻だけで決まる純関数なので、同じシーンを渡せば何度でも同じ絵が出る。
 * その前提を利用して、リファクタの前後で絵が変わっていないことを確かめる。
 */

import { buildIntroStages, createIntroParticles } from './intro.ts'
import { createParticles } from './particles.ts'
import type { RarityId } from './rarity.ts'
import { RARITY_PRESETS, getRarity } from './rarity.ts'
import { renderFrameBlurred } from './render.ts'
import type { CardScene } from './scene.ts'
import { computeCardSize, computeTimeline } from './scene.ts'

/** テストで使うフレームの大きさ。既定のサイズプリセット（横長）に合わせる。 */
const TEST_FRAME = { width: 900, height: 700 } as const

/** テストで使う尺と入り演出の長さ（秒）。UI の既定値と同じ。 */
const TEST_DURATION = 8
const TEST_INTRO = 2

/** 粒とノイズのシード。値を変えると絵が変わるので、テストでは固定する。 */
const TEST_SEED = 12345

/**
 * レアリティを 1 つ選んで、テスト用のシーンを組み立てる。
 *
 * @param rarityId - レアリティ
 * @returns 描画に渡せるシーン。アートワークは無し（背景のビネットだけが出る）
 *
 * @example
 * const scene = buildTestScene('gold')
 * renderFrameBlurred(ctx, 4, scene, null)
 */
function buildTestScene(rarityId: RarityId): CardScene {
  const rarity = getRarity(rarityId)
  const card = computeCardSize(TEST_FRAME.width, TEST_FRAME.height)
  const timeline = computeTimeline(TEST_DURATION, false, TEST_INTRO)

  return {
    width: TEST_FRAME.width,
    height: TEST_FRAME.height,
    image: null,
    imageWidth: 1,
    imageHeight: 1,
    rarity,
    badge: rarity.badge,
    title: 'テストカード',
    subtitle: 'SUB',
    duration: TEST_DURATION,
    particles: createParticles(
      rarity,
      {
        cardWidth: card.width,
        cardHeight: card.height,
        duration: TEST_DURATION,
        startAt: timeline.entranceEnd,
      },
      TEST_SEED,
    ),
    intro: {
      // 途中の色をすべて通す道のり。UI の既定値と同じ
      stages: buildIntroStages(
        rarity,
        RARITY_PRESETS.map((preset) => preset.id),
      ),
      particles: createIntroParticles(90, TEST_SEED),
    },
    introDuration: TEST_INTRO,
    loop: false,
  }
}

/**
 * 検査する時刻。演出の切り替わりを一通り踏むように選んである。
 *
 * 入り演出の途中 / 弾ける直前 / 着地の衝撃 / 落ち着いたあと / 退場の途中。
 */
export const TEST_TIMES = [1.2, 1.95, 2.95, 4.5, 7.7] as const

/**
 * 検査用に 1 フレーム描いて、生データを返す。
 *
 * @param rarityId - レアリティ
 * @param time - アニメーション先頭からの経過秒
 * @returns 描き上がったフレームの生データ
 */
export function renderTestFrame(rarityId: RarityId, time: number): ImageData {
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
