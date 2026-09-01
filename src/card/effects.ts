/**
 * カードの外側で起きる演出。
 *
 * 衝撃波・集中線・閃光・パーティクル。どれもカードの矩形には貼りつかず、
 * フレーム全体に広がる。カード面の描画（card-face.ts）とは別に置いてある。
 */

import type { Canvas2dContext } from './compositing.ts'
import { clamp, easeOutCubic, progress } from './math.ts'
import { particleStateAt } from './particles.ts'
import type { CardBox, CardScene, Timeline } from './scene.ts'

/** カードの上に乗った粒の濃さ。バッジや名前を隠さないよう落とす。 */
const PARTICLE_OVER_CARD = 0.35

/**
 * 集中線 1 本の色を返す。虹だけは枠と同じ色を一周ぶん割り当てる。
 *
 * 枠のコニックグラデーションと同じく、一周で虹が 1 回りするように並べる。
 * 6 色を繰り返すと本数ぶん虹が何度も回ってしまい、枠との対応が崩れる。
 *
 * @param scene - 描画するシーン
 * @param around - 一周のどこか。0 以上 1 未満
 */
function rayColorAt(scene: CardScene, around: number): string {
  const { frameColors, rainbowFrame, glowColor } = scene.rarity
  if (!rainbowFrame) return glowColor
  const index = Math.floor(around * frameColors.length) % frameColors.length
  return frameColors[index] ?? glowColor
}

/** 着地の瞬間に広がる衝撃波のリング。 */
export function drawShockwave(
  ctx: Canvas2dContext,
  scene: CardScene,
  timeline: Timeline,
  time: number,
): void {
  const strength = scene.rarity.flash
  if (strength < 0.3) return

  const t = progress(time, timeline.entranceEnd - 0.05, timeline.entranceEnd + 0.45)
  if (t <= 0 || t >= 1) return

  // フレームの外まで広げると、切れた円弧が四角い縁として残ってしまう。
  // 短辺の半分を上限にして、消えるまでをフレーム内に収める
  const maxRadius = Math.min(scene.width, scene.height) * 0.45
  ctx.save()
  // カード側のフェードに乗せる。代入するとフェードを打ち消してしまう
  ctx.globalAlpha *= (1 - t) * strength * 0.8
  ctx.strokeStyle = scene.rarity.glowColor

  // 上位は 3 本を少しずつ遅らせて重ねる。緑のような下位は 1 本だけにして、
  // 着地の重さでも段の差が分かるようにする
  const waveCount = strength >= 0.6 ? 3 : 1
  for (let i = 0; i < waveCount; i++) {
    const delayed = progress(t, i * 0.16, 1)
    if (delayed <= 0) continue
    ctx.globalAlpha *= i === 0 ? 1 : 0.62
    ctx.lineWidth = scene.width * 0.012 * (1 - delayed)
    ctx.beginPath()
    ctx.arc(0, 0, maxRadius * (0.25 + 0.75 * easeOutCubic(delayed)), 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.restore()
}

/**
 * 着地の瞬間だけ走る集中線と十字フレア。
 *
 * カードが出た瞬間をいちばん強い山にしたいので、衝撃波や閃光に重ねて
 * 一度だけ弾けさせる。半径はフレームの内側に収める。
 *
 * @param ctx - 描画先。カード中心が原点になるよう変換済みであること
 * @param scene - 描画中のシーン
 * @param timeline - 演出の区切り時刻
 * @param time - アニメーション先頭からの経過秒
 */
export function drawImpactBurst(
  ctx: Canvas2dContext,
  scene: CardScene,
  timeline: Timeline,
  time: number,
): void {
  // 集中線は赤（SSR）以上だけの特権にする。下位まで出すと段の差が消えて、
  // 「集中線が走った＝上位」という手がかりにならない
  const strength = scene.rarity.flash
  if (strength < 0.5) return

  const t = progress(time, timeline.entranceEnd - 0.04, timeline.entranceEnd + 0.34)
  if (t <= 0 || t >= 1) return

  const unit = Math.min(scene.width, scene.height)
  const maxRadius = unit * 0.46
  const reach = maxRadius * (0.35 + 0.65 * easeOutCubic(t))
  const fade = (1 - t) * strength

  ctx.save()
  ctx.globalCompositeOperation = 'lighter'

  // 放射状の集中線。着地の瞬間に外へ突き抜ける
  const rayCount = 20
  ctx.globalAlpha *= fade * 0.55
  ctx.rotate(t * 0.5)
  for (let i = 0; i < rayCount; i++) {
    const angle = (i / rayCount) * Math.PI * 2
    const x = Math.cos(angle) * reach
    const y = Math.sin(angle) * reach
    // 中心を透明にして、カードのアートを覆わずに外側だけ突き抜けさせる
    const ray = ctx.createLinearGradient(0, 0, x, y)
    ray.addColorStop(0, 'rgba(0,0,0,0)')
    ray.addColorStop(0.4, '#ffffff')
    ray.addColorStop(0.58, rayColorAt(scene, i / rayCount))
    ray.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.strokeStyle = ray
    ctx.lineWidth = unit * 0.014 * (1 - t)
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(x, y)
    ctx.stroke()
  }

  // 横に長い十字フレア。派手さを一段足す
  for (const angle of [0, Math.PI / 2]) {
    const fx = Math.cos(angle) * reach
    const fy = Math.sin(angle) * reach
    // 十字も中心は抜いて、カードの左右・上下に伸びる光にする
    const flare = ctx.createLinearGradient(-fx, -fy, fx, fy)
    flare.addColorStop(0, 'rgba(0,0,0,0)')
    flare.addColorStop(0.25, '#ffffff')
    flare.addColorStop(0.5, 'rgba(0,0,0,0)')
    flare.addColorStop(0.75, '#ffffff')
    flare.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.strokeStyle = flare
    ctx.lineWidth = unit * (angle === 0 ? 0.018 : 0.012) * (1 - t)
    ctx.beginPath()
    ctx.moveTo(-fx, -fy)
    ctx.lineTo(fx, fy)
    ctx.stroke()
  }

  ctx.restore()
}

/**
 * 着地時の閃光。全面を白く塗るとアラートとして眩しすぎるので、
 * カード中心からのラジアルグラデーションで周囲だけを光らせる。
 */
export function drawFlash(ctx: Canvas2dContext, scene: CardScene, impact: number): void {
  const strength = scene.rarity.flash * impact
  if (strength <= 0.01) return

  // 光はフレームの短辺に収める。フレームより広く塗ると、透明に落ちきる前に
  // 端で切られて、配信画面に四角い光の板が乗ってしまう
  const radius = Math.min(scene.width, scene.height) * 0.48
  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radius)
  gradient.addColorStop(0, `rgba(255,255,255,${0.72 * strength})`)
  gradient.addColorStop(0.45, `rgba(255,255,255,${0.26 * strength})`)
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = gradient
  // グラデーションが 0 になる範囲だけを塗り、矩形の継ぎ目を作らない
  ctx.fillRect(-radius, -radius, radius * 2, radius * 2)
}

/**
 * パーティクルを1枚ずつ描く。形状ごとに描き分ける。
 *
 * @param ctx - 描画先。カード中心を原点とした座標系に入っていること
 * @param scene - 描画するシーン
 * @param box - カードの矩形。上に乗った粒を薄くするのに使う
 * @param scale - その時刻のカードの拡大率
 * @param time - アニメーション先頭からの経過秒
 */
export function drawParticles(
  ctx: Canvas2dContext,
  scene: CardScene,
  box: CardBox,
  scale: number,
  time: number,
): void {
  for (const particle of scene.particles) {
    const state = particleStateAt(particle, time)
    if (!state || state.alpha <= 0) continue

    // 粒はカードの外まで飛ぶ。フレーム端で切れると加算合成のぶん
    // 四角い縁がはっきり出るので、端に近づくほど薄くして消す
    const fadeMargin = Math.min(scene.width, scene.height) * 0.09
    const distanceToEdge = Math.min(
      scene.width / 2 - Math.abs(state.x),
      scene.height / 2 - Math.abs(state.y),
    )
    const edgeFade = clamp(distanceToEdge / fadeMargin, 0, 1)
    if (edgeFade <= 0) continue

    // カードの上に乗る粒は薄くする。加算合成なので、濃いまま重なると
    // バッジや名前が読めなくなる。カードの外周で切ると矩形の線が見えるので、
    // 縁から内側へ少しの幅を使って滑らかに落とす
    const softness = box.unit * 0.06
    const insideCard = Math.min(
      (box.width * scale) / 2 - Math.abs(state.x),
      (box.height * scale) / 2 - Math.abs(state.y),
    )
    const overCard = clamp(insideCard / softness, 0, 1)
    const cardFade = 1 - overCard * (1 - PARTICLE_OVER_CARD)

    ctx.save()
    // カード側のフェードに乗せる。代入すると退場後も粒だけが残る
    ctx.globalAlpha *= clamp(state.alpha, 0, 1) * edgeFade * cardFade
    ctx.globalCompositeOperation = 'lighter'
    ctx.translate(state.x, state.y)
    ctx.rotate(state.rotation)
    ctx.fillStyle = state.color

    switch (state.shape) {
      case 'circle': {
        // 芯を残しつつ外側をぼかして、光の粒に見せる
        const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, state.size * 2)
        glow.addColorStop(0, state.color)
        glow.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = glow
        ctx.beginPath()
        ctx.arc(0, 0, state.size * 2, 0, Math.PI * 2)
        ctx.fill()
        break
      }
      case 'star': {
        // 4 方向に伸びる十字型のきらめき
        ctx.beginPath()
        for (let i = 0; i < 4; i++) {
          const angle = (i * Math.PI) / 2
          const long = state.size * 2.6
          const short = state.size * 0.5
          ctx.lineTo(Math.cos(angle) * long, Math.sin(angle) * long)
          ctx.lineTo(Math.cos(angle + Math.PI / 4) * short, Math.sin(angle + Math.PI / 4) * short)
        }
        ctx.closePath()
        ctx.fill()
        break
      }
      case 'shard': {
        // 進行方向に伸びた破片
        ctx.beginPath()
        ctx.ellipse(0, 0, state.size * 2.2, state.size * 0.55, 0, 0, Math.PI * 2)
        ctx.fill()
        break
      }
    }
    ctx.restore()
  }
}
