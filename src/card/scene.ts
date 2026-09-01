/**
 * カードの寸法と、時刻ごとの姿勢。
 *
 * 絵は描かない。「いつ・どこに・どれだけの大きさで」だけを決める。
 * canvas に触れないので、描画の作りを変えてもここは影響を受けない。
 */

import type { IntroConfig } from './intro.ts'
import {
  clamp,
  easeInCubic,
  easeOutCubic,
  easeOutElastic,
  progress,
  pulse,
  smoothstep,
} from './math.ts'
import type { Particle } from './particles.ts'
import type { RarityPreset } from './rarity.ts'

/** 1本の動画を描くのに必要な情報一式。 */
export interface CardScene {
  /** 出力の幅（px）。 */
  width: number
  /** 出力の高さ（px）。 */
  height: number
  /** カードに貼るアートワーク。未選択なら `null`。 */
  image: CanvasImageSource | null
  /** アートワークの元幅（px）。cover 計算に使う。 */
  imageWidth: number
  /** アートワークの元高さ（px）。 */
  imageHeight: number
  /**
   * アートワークのどこを枠の中央に置くか。0 が左端／上端、1 が右端／下端、
   * 0.5 で中央。縦横比が枠と違うと必ずどちらかがはみ出すので、その切り落とし
   * 位置を決める。顔が上寄りの写真なら小さくする。
   */
  focusX: number
  focusY: number
  rarity: RarityPreset
  /** カード左上のランク表記。空文字ならバッジごと描かない。 */
  badge: string
  /** カード下部に出す名前。空文字なら帯ごと描かない。 */
  title: string
  /** 名前の下に出す小さい文字。 */
  subtitle: string
  /** 全体の尺（秒）。 */
  duration: number
  /** 事前生成済みのパーティクル。 */
  particles: readonly Particle[]
  /** カードが出る前の共通演出。使わないなら `null`。 */
  intro: IntroConfig | null
  /** 入り演出の長さ（秒）。`intro` が `null` なら 0。 */
  introDuration: number
  /** ループ用途で退場フェードを省くなら `true`。 */
  loop: boolean
}

/** 演出の切り替わり時刻。 */
export interface Timeline {
  /** 入り演出が終わり、カードが動き始める時刻（秒）。入り演出なしなら 0。 */
  introEnd: number
  /** 登場アニメが終わり、カードが定位置に着く時刻（秒）。 */
  entranceEnd: number
  /** 退場フェードが始まる時刻（秒）。ループ時は尺と同じ値。 */
  exitStart: number
}

/** カードの矩形。中心を原点としたローカル座標で扱う。 */
export interface CardBox {
  width: number
  height: number
  /** 角丸の半径（px）。 */
  radius: number
  /**
   * 短辺の長さ（px）。枠の太さや文字の大きさはここを基準にする。
   * 幅を基準にすると、横向きのカードで枠も文字も引き伸ばされてしまう。
   */
  unit: number
}

/**
 * 尺から演出の区切り時刻を求める。
 *
 * @param duration - 全体の尺（秒）
 * @param loop - ループ用途かどうか
 */
export function computeTimeline(duration: number, loop: boolean, introDuration = 0): Timeline {
  // 入り演出のぶんカードの登場は後ろにずれる。残り時間から登場の長さを取り直す
  const introEnd = Math.min(introDuration, Math.max(0, duration - 0.5))
  const remaining = duration - introEnd
  // 登場は残りの 2 割強、ただし長尺でも 0.9 秒を超えると間延びするので頭打ちにする
  const entranceEnd = introEnd + Math.min(0.9, remaining * 0.22)
  const exitStart = loop ? duration : Math.max(entranceEnd + 0.2, duration - 0.55)
  return { introEnd, entranceEnd, exitStart }
}

/**
 * フレームの大きさからカードの寸法を求める。
 *
 * パーティクルの生成にも同じ寸法が要るので、描画側と呼び出し側で
 * 値がズレないよう計算はここだけに置く。
 *
 * @param frameWidth - 出力フレームの幅（px）
 * @param frameHeight - 出力フレームの高さ（px）
 */
export function computeCardSize(
  frameWidth: number,
  frameHeight: number,
): { width: number; height: number } {
  // フレームが横長ならカードも寝かせる。縦横比は 2:3 のまま向きだけ入れ替える
  const isLandscape = frameWidth > frameHeight
  // カードは 2:3 に固定。金や虹のグローはカード短辺の 4 割ほど外に伸び、
  // さらにスラム時は 1.6 倍まで膨らむ。その両方を飲み込む余白がフレーム側に
  // 残る大きさにしている
  const long = (isLandscape ? frameWidth : frameHeight) * 0.58
  const short = long * (2 / 3)
  return isLandscape ? { width: long, height: short } : { width: short, height: long }
}

/** 出力サイズからカードの矩形を決める。 */
export function computeCardBox(scene: CardScene): CardBox {
  const { width, height } = computeCardSize(scene.width, scene.height)
  const unit = Math.min(width, height)
  return { width, height, radius: unit * 0.055, unit }
}

/** 登場・退場・浮遊をまとめた、その時刻のカードの姿勢。 */
export interface CardTransform {
  scale: number
  offsetY: number
  alpha: number
  /** 着地の瞬間だけ 1 に近づく値。フラッシュや衝撃波の強さに使う。 */
  impact: number
}

/**
 * 時刻からカードの姿勢を求める。
 * 登場の仕方はレアリティの `entrance` で変わり、激アツほど動きが大きい。
 */
export function computeTransform(
  scene: CardScene,
  timeline: Timeline,
  time: number,
): CardTransform {
  const box = computeCardBox(scene)
  // 入り演出が終わってから登場を始める
  const enter = progress(time, timeline.introEnd, timeline.entranceEnd)
  let scale = 1
  let offsetY = 0
  let alpha = 1

  switch (scene.rarity.entrance) {
    case 'fade': {
      const e = easeOutCubic(enter)
      scale = 0.94 + 0.06 * e
      alpha = e
      break
    }
    case 'rise': {
      const e = easeOutCubic(enter)
      offsetY = (1 - e) * box.height * 0.35
      scale = 0.96 + 0.04 * e
      alpha = smoothstep(enter * 1.6)
      break
    }
    case 'zoom': {
      const e = easeOutCubic(enter)
      scale = 1.55 - 0.55 * e
      alpha = smoothstep(enter * 2)
      break
    }
    case 'slam': {
      // 大きく前に出た状態から一気に縮み、着地点で数回バウンドさせる
      const e = easeOutElastic(enter)
      scale = 1.6 - 0.6 * e
      alpha = smoothstep(enter * 3)
      break
    }
  }

  // 着地後はゆっくり上下に漂わせて、静止画に見えないようにする
  const idle = Math.max(0, time - timeline.entranceEnd)
  offsetY += Math.sin(idle * 1.6) * box.height * 0.008 * smoothstep(idle * 2)

  if (!scene.loop && time > timeline.exitStart) {
    const out = easeInCubic(progress(time, timeline.exitStart, scene.duration))
    alpha *= 1 - out
    scale *= 1 + out * 0.05
    offsetY -= out * box.height * 0.04
  }

  return {
    scale,
    offsetY,
    alpha: clamp(alpha, 0, 1),
    // 着地の前後 0.3 秒だけ立ち上がる山
    impact: pulse(progress(time, timeline.entranceEnd - 0.12, timeline.entranceEnd + 0.3)),
  }
}

/** 震えの量を求める。着地直後が最も激しく、指数的に収まる。 */
export function computeShake(scene: CardScene, timeline: Timeline, time: number): [number, number] {
  const amount = scene.rarity.shake
  if (amount === 0) return [0, 0]
  const since = time - timeline.entranceEnd
  if (since < -0.1) return [0, 0]
  // 着地からの経過で急速に減衰させる
  const decay = Math.exp(-Math.max(0, since) * 4.5)
  const magnitude = amount * scene.width * decay
  // 互いに素に近い周波数を重ねて、周期を感じさせない揺れにする
  return [
    (Math.sin(time * 47.3) + Math.sin(time * 91.7) * 0.5) * magnitude,
    (Math.cos(time * 53.1) + Math.cos(time * 83.9) * 0.5) * magnitude,
  ]
}
