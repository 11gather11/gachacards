/**
 * カード1フレーム分の描画。
 *
 * プレビューと WebM の書き出しはどちらもこの {@link renderFrameBlurred} だけを呼ぶ。
 * 結果が時刻 `time` のみに依存する純関数になっているため、
 * 画面で見えているものと書き出されるものが食い違うことがない。
 */

import { drawCardSurface } from './card-face.ts'
import type { Canvas2dContext, MotionBlur } from './compositing.ts'
import { acquireFadeLayer, acquireLayers, ditherAccum, fadeFrameEdges } from './compositing.ts'
import { drawFlash, drawImpactBurst, drawParticles, drawShockwave } from './effects.ts'
import { drawIntro } from './intro.ts'
import type { CardScene, CardTransform, Timeline } from './scene.ts'
import { computeCardBox, computeShake, computeTimeline, computeTransform } from './scene.ts'

/**
 * モーションブラーを掛けて 1 フレーム描く。
 *
 * 描画は時刻だけで決まる純関数なので、1 フレームの露光時間のあいだで時刻を
 * ずらして何度か描き、平均すればそのままモーションブラーになる。
 * 速度ベクトルを持ち回る必要がない。
 *
 * 合成は加算 (`lighter`) で、各サンプルを 1/N の濃さで足していく。
 * `source-over` で重ねると色は平均されるがアルファが平均されず、
 * 一枚でも不透明なサンプルがあればその場所は不透明のまま残る。
 * 結果、光が通り過ぎた跡が「不透明な暗い色」で埋まって黒ずむ。
 * 加算ならアルファも色も（プリマルチプライドのまま）正しく平均される。
 *
 * 合成はすべて中間レイヤーの上で済ませ、8bit に落とすのは最後の 1 回だけにする。
 * 途中で丸めると、その誤差が隣り合う画素でそろって縞になる。
 *
 * @param ctx - 描画先。呼び出し前にクリアしておくこと
 * @param time - アニメーション先頭からの経過秒
 * @param scene - 描画するシーン
 * @param blur - ブラー設定。`null` かサンプル数 1 ならそのまま 1 枚描く
 */
export function renderFrameBlurred(
  ctx: Canvas2dContext,
  time: number,
  scene: CardScene,
  blur: MotionBlur | null,
): void {
  const layers = acquireLayers(ctx, scene.width, scene.height)

  // 中間レイヤーが作れない環境では、直に描いて縁だけ落とす
  if (!layers) {
    renderFrame(ctx, time, scene)
    fadeFrameEdges(ctx, scene.width, scene.height)
    return
  }

  const samples = blur ? Math.max(1, Math.floor(blur.samples)) : 1
  const accum = layers.accum.ctx

  if (!blur || samples <= 1) {
    renderFrame(accum, time, scene)
  } else {
    const span = blur.frameDuration * blur.shutter
    accum.save()
    accum.globalCompositeOperation = 'lighter'
    accum.globalAlpha = 1 / samples
    for (let i = 0; i < samples; i++) {
      layers.sample.ctx.clearRect(0, 0, scene.width, scene.height)
      renderFrame(layers.sample.ctx, time + (i / samples) * span, scene)
      accum.drawImage(layers.sample.canvas, 0, 0)
    }
    accum.restore()
  }

  // ディザは全面に一様なノイズを足すので、透明なところも 1 レベルだけ浮く。
  // 先に足しておけば、続くマスクが縁をきっちり 0 に戻してくれる
  ditherAccum(layers)

  // ブラーを掛けるとサブフレームごとの揺れ幅が乗って光が端まで届きやすい。
  // 合成しきったあとに縁を落とす
  fadeFrameEdges(accum, scene.width, scene.height)
  ctx.drawImage(layers.accum.canvas, 0, 0)
}

/**
 * シーンの指定時刻を 1 フレーム描画する。呼び出し側でキャンバスをクリアしてから呼ぶこと。
 *
 * @param ctx - 描画先の 2D コンテキスト
 * @param time - アニメーション先頭からの経過秒
 * @param scene - 描画するシーン
 *
 * @example
 * ctx.clearRect(0, 0, scene.width, scene.height);
 * renderFrame(ctx, 1.2, scene);
 */
function renderFrame(ctx: Canvas2dContext, time: number, scene: CardScene): void {
  const timeline = computeTimeline(scene.duration, scene.loop, scene.introDuration)

  // 入り演出はカードのフェードとは別物なので、レイヤーを挟まずそのまま描く
  if (scene.intro) {
    drawIntro(ctx, scene, scene.intro, timeline.introEnd, time)
  }

  const transform = computeTransform(scene, timeline, time)
  if (transform.alpha <= 0) return

  if (transform.alpha >= 0.999) {
    drawCard(ctx, time, scene, timeline, transform)
    return
  }

  // フェード中は、一度レイヤーに不透明で描いてから 1 回だけ合成する。
  // カードはグロー・アート・ビネット・枠・ラベルと層を重ねて描いているため、
  // 各層に globalAlpha を掛けると 1-(1-a)^層数 で不透明に戻ってしまい、
  // フェードがほとんど効かなくなる
  const layer = acquireFadeLayer(ctx, scene.width, scene.height)
  if (!layer) {
    // レイヤーを用意できない環境では、精度を落としてでも描画を続ける
    ctx.save()
    ctx.globalAlpha = transform.alpha
    drawCard(ctx, time, scene, timeline, transform)
    ctx.restore()
    return
  }

  drawCard(layer.ctx, time, scene, timeline, transform)
  ctx.save()
  ctx.globalAlpha = transform.alpha
  ctx.drawImage(layer.canvas, 0, 0)
  ctx.restore()
}

/**
 * カード一式を不透明で描く。全体のフェードは呼び出し側が担当する。
 *
 * @param ctx - 描画先。フェード中はレイヤーのコンテキストが渡る
 * @param time - アニメーション先頭からの経過秒
 * @param scene - 描画するシーン
 * @param timeline - 演出の区切り時刻
 * @param transform - その時刻のカードの姿勢
 */
function drawCard(
  ctx: Canvas2dContext,
  time: number,
  scene: CardScene,
  timeline: Timeline,
  transform: CardTransform,
): void {
  const box = computeCardBox(scene)
  const [shakeX, shakeY] = computeShake(scene, timeline, time)

  ctx.save()
  // 以降はすべてカード中心を原点とした座標で描く
  ctx.translate(scene.width / 2 + shakeX, scene.height / 2 + transform.offsetY + shakeY)

  drawShockwave(ctx, scene, timeline, time)

  drawCardSurface(ctx, time, scene, box, timeline, transform)

  drawParticles(ctx, scene, box, transform.scale, time)
  drawImpactBurst(ctx, scene, timeline, time)
  drawFlash(ctx, scene, transform.impact)

  ctx.restore()
}
