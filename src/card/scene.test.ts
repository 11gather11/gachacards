/**
 * 寸法・タイムライン・段取り・粒の、絵を描かない部分のテスト。
 *
 * 描画の指紋（render.test.ts）は「変わった」ことしか教えてくれない。
 * こちらは「どうあるべきか」を書いておく側で、落ちたときに理由が分かる。
 */

import { describe, expect, it } from 'vite-plus/test'

import { buildIntroStages, computeIntroDuration, listIntermediateRarities } from './intro.ts'
import { createRng } from './math.ts'
import { createParticles, particleStateAt } from './particles.ts'
import { getRarity } from './rarity.ts'
import { computeCardSize, computeTimeline } from './render.ts'

describe('computeCardSize', () => {
  it('カードは 2:3 のまま、向きだけが入れ替わる', () => {
    const landscape = computeCardSize(900, 700)
    const portrait = computeCardSize(700, 900)
    expect(landscape.width / landscape.height).toBeCloseTo(3 / 2, 5)
    expect(portrait.height / portrait.width).toBeCloseTo(3 / 2, 5)
  })

  it('スラムで 1.6 倍に膨らんでもフレームに収まる', () => {
    // ここが収まらないと余白が負になり、グローが丸ごと消える
    for (const [width, height] of [
      [640, 480],
      [900, 700],
      [1280, 960],
    ] as const) {
      const card = computeCardSize(width, height)
      expect(card.width * 1.6).toBeLessThan(width)
      expect(card.height * 1.6).toBeLessThan(height)
    }
  })
})

describe('computeTimeline', () => {
  it('入り演出のぶんだけ登場が後ろにずれる', () => {
    const without = computeTimeline(8, false, 0)
    const withIntro = computeTimeline(8, false, 2)
    expect(without.introEnd).toBe(0)
    expect(withIntro.introEnd).toBe(2)
    expect(withIntro.entranceEnd).toBeGreaterThan(without.entranceEnd)
  })

  it('ループなら退場のフェードを取らない', () => {
    expect(computeTimeline(8, true, 0).exitStart).toBe(8)
    expect(computeTimeline(8, false, 0).exitStart).toBeLessThan(8)
  })

  it('尺より長い入り演出は詰められる', () => {
    const timeline = computeTimeline(3, false, 10)
    expect(timeline.introEnd).toBeLessThanOrEqual(3)
    expect(timeline.entranceEnd).toBeLessThanOrEqual(3)
  })
})

describe('computeIntroDuration', () => {
  it('無効なら 0', () => {
    expect(computeIntroDuration(4, 8, false)).toBe(0)
  })

  it('尺の 6 割を超えない', () => {
    expect(computeIntroDuration(4, 8, true)).toBe(4)
    expect(computeIntroDuration(4, 5, true)).toBeCloseTo(3, 5)
  })
})

describe('buildIntroStages', () => {
  it('必ず白から始まり、目的の色で終わる', () => {
    for (const id of ['white', 'blue', 'green', 'red', 'gold', 'rainbow'] as const) {
      const rarity = getRarity(id)
      const stages = buildIntroStages(
        rarity,
        listIntermediateRarities(rarity).map((preset) => preset.id),
      )
      expect(stages[0]?.rarity.id).toBe('white')
      expect(stages.at(-1)?.rarity.id).toBe(id)
    }
  })

  it('通す色を外すと段が減る。白と目的の色は残る', () => {
    const rainbow = getRarity('rainbow')
    const full = buildIntroStages(rainbow, ['blue', 'green', 'red', 'gold'])
    const skipped = buildIntroStages(rainbow, ['blue'])
    const direct = buildIntroStages(rainbow, [])
    expect(full).toHaveLength(6)
    expect(skipped.map((stage) => stage.rarity.id)).toEqual(['white', 'blue', 'rainbow'])
    expect(direct.map((stage) => stage.rarity.id)).toEqual(['white', 'rainbow'])
  })

  it('切り替わりの時刻は昇順で、最初は 0', () => {
    const stages = buildIntroStages(getRarity('gold'), ['blue', 'green', 'red'])
    expect(stages[0]?.at).toBe(0)
    for (let i = 1; i < stages.length; i++) {
      expect(stages[i]!.at).toBeGreaterThan(stages[i - 1]!.at)
    }
  })
})

describe('listIntermediateRarities', () => {
  it('白と目的の色は含まない', () => {
    expect(listIntermediateRarities(getRarity('rainbow')).map((preset) => preset.id)).toEqual([
      'blue',
      'green',
      'red',
      'gold',
    ])
    // 白から 1 段しかない青には、間に挟める色がない
    expect(listIntermediateRarities(getRarity('blue'))).toHaveLength(0)
    expect(listIntermediateRarities(getRarity('white'))).toHaveLength(0)
  })
})

describe('createRng', () => {
  it('同じシードなら同じ並びを返す', () => {
    const a = createRng(42)
    const b = createRng(42)
    const c = createRng(43)
    const first = [a(), a(), a()]
    expect([b(), b(), b()]).toEqual(first)
    expect([c(), c(), c()]).not.toEqual(first)
  })
})

describe('createParticles', () => {
  const field = { cardWidth: 522, cardHeight: 348, duration: 8, startAt: 2.9 }

  it('同じシードなら同じ配置になる', () => {
    const a = createParticles(getRarity('gold'), field, 12345)
    const b = createParticles(getRarity('gold'), field, 12345)
    const c = createParticles(getRarity('gold'), field, 12346)
    expect(b).toEqual(a)
    expect(c).not.toEqual(a)
  })

  it('位置は経過時間だけで決まる。飛ばして描いても同じ', () => {
    // 積分方式だとシークのたびに絵が変わってしまう。ここが崩れると
    // プレビューと書き出しが食い違う
    const [particle] = createParticles(getRarity('rainbow'), field, 7)
    expect(particle).toBeDefined()
    const direct = particleStateAt(particle!, 5)
    for (let time = 0; time < 5; time += 0.1) particleStateAt(particle!, time)
    expect(particleStateAt(particle!, 5)).toEqual(direct)
  })
})
