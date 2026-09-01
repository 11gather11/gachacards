/**
 * カード本体の描画。
 *
 * 裏に敷くグロー、角丸に切り抜いた中身（アート・ホログラム・オーロラ・
 * 光沢・文字）、そして枠と周回する光。どれもカードの矩形に貼りついていて、
 * カードと一緒に拡大・回転する。
 *
 * フレーム全体に広がる演出は effects.ts のほうにある。
 */

import type { Canvas2dContext } from './compositing.ts'
import { acquireGlowLayer } from './compositing.ts'
import { progress, pulse } from './math.ts'
import type { CardBox, CardScene, CardTransform, Timeline } from './scene.ts'

/** 虹のグローを枠色で染める強さ。1 で純色、0 で白のまま。 */
const GLOW_TINT = 0.7

/** オーロラの帯がカードを 1 回横切るのにかける秒数。 */
const AURORA_CYCLE = 3.2

/** 枠を回る光が 1 周するのにかける秒数。 */
const COMET_CYCLE = 2.4

/**
 * 角丸矩形のパスを、中心原点で引く。
 *
 * 内側に寄せた分だけ半径も同じだけ小さくする。ここを縮めきらないと角の曲率が
 * 外周と揃わず、内側の線だけが丸く膨らんで見える。
 */
function roundedRectPath(ctx: Canvas2dContext, box: CardBox, inset = 0): void {
  const w = box.width - inset * 2
  const h = box.height - inset * 2
  ctx.beginPath()
  ctx.roundRect(-w / 2, -h / 2, w, h, Math.max(0, box.radius - inset))
}

/**
 * グローのぼかし半径を求める。
 *
 * 素の値はカード幅とレアリティの強さから決まるが、それをそのまま使うと
 * 金や虹ではフレームの余白より広くなり、光が端で切られて透過素材に
 * 四角い縁が出る。カードとフレームの隙間に収まるところまで必ず切り詰める。
 *
 * @param scene - 描画中のシーン
 * @param box - カードの矩形
 * @param scale - 現在のカードの拡大率
 * @param strength - レアリティ由来のグローの強さ
 * @returns ローカル座標系でのぼかし半径（px）
 */
function computeGlowBlur(scene: CardScene, box: CardBox, scale: number, strength: number): number {
  if (strength <= 0) return 0

  // グローは拡大後の座標で滲むので、余白も拡大後のカードの大きさで測る
  const margin = Math.min(
    (scene.width - box.width * scale) / 2,
    (scene.height - box.height * scale) / 2,
  )
  if (margin <= 0) return 0

  // 得られた上限は拡大後の値なので、ローカル座標に戻してから使う。
  // これは保険で、ふだんは素の値のほうが小さい。スラムで一気に膨らんだときだけ
  // ここが効いて、光がフレームからはみ出すのを止める
  const maxBlur = (margin * 0.85) / scale
  return Math.min(box.unit * 0.38 * strength, maxBlur)
}

/**
 * カードの下に敷くグローを 1 色で描く。
 *
 * @param ctx - 描画先。カード中心を原点とした座標系に入っていること
 * @param box - カードの矩形
 * @param color - 光の色
 * @param blur - ぼかし半径（px）
 */
function paintGlow(ctx: Canvas2dContext, box: CardBox, color: string, blur: number): void {
  ctx.save()
  ctx.shadowColor = color
  ctx.fillStyle = 'rgba(0,0,0,0.9)'
  roundedRectPath(ctx, box)

  // 締まった内側の光。一度の shadow では薄いので、同じ形を重ねて濃くする。
  // ここを重ねすぎると芯が硬くなるので、濃さは外側の拡散で稼ぐ
  ctx.shadowBlur = blur
  ctx.fill()
  ctx.fill()

  // 遠くまで届く薄い拡散を上から重ねる。一層のまま濃くすると縁が硬くなるが、
  // 広い層を足すと光量を上げても自然に散る。
  // ただし広げすぎるとフレームの余白に収まらず、裾を fadeFrameEdges が
  // 断ち切って楕円の輪郭が浮く。端まで届く前に消えきる濃さと広さにする
  ctx.globalAlpha *= 0.35
  ctx.shadowBlur = blur * 1.5
  ctx.fill()
  ctx.restore()
}

/**
 * グローを描く。虹だけは枠と同じコニックグラデーションで染める。
 *
 * `shadowColor` には単色しか渡せないので、いったん白で形だけ作り、
 * `source-in` で色を差し替える。枠と同じ角度で回すため、
 * それぞれの辺で halo と枠の色がそろう。
 *
 * @param ctx - 描画先。カード中心を原点とした座標系に入っていること
 * @param scene - 描画するシーン
 * @param box - カードの矩形
 * @param blur - ぼかし半径（px）。0 以下なら何も描かない
 * @param time - アニメーション先頭からの経過秒
 */
function drawGlow(
  ctx: Canvas2dContext,
  scene: CardScene,
  box: CardBox,
  blur: number,
  time: number,
): void {
  if (blur <= 0) return

  const layer = scene.rarity.rainbowFrame ? acquireGlowLayer(ctx, scene.width, scene.height) : null
  if (!layer) {
    paintGlow(ctx, box, scene.rarity.glowColor, blur)
    return
  }

  // 変換も合成モードも、次にこのレイヤーを使うときまで残る。変換が残っていると
  // 次回の clearRect がずれた範囲を消し、前のフレームが四角く居座る
  layer.ctx.save()
  // 呼び出し元と同じ座標系に合わせる。グラデーションの中心もカード中心になる
  layer.ctx.setTransform(ctx.getTransform())
  paintGlow(layer.ctx, box, '#ffffff', blur)

  // 白のまま残した分だけ明るさが保たれる。純色は白より輝度がずっと低いので、
  // 完全に置き換えると halo が急に暗く見える
  layer.ctx.globalCompositeOperation = 'source-atop'
  layer.ctx.globalAlpha = GLOW_TINT
  layer.ctx.fillStyle = createFrameStyle(layer.ctx, scene, box, time)
  // グラデーションの座標は塗る時点の変換で決まるので、変換は掛けたまま塗る。
  // 拡大率がどうであれフレーム全体を覆えるだけの大きさを取る
  const cover = Math.max(scene.width, scene.height) * 2
  layer.ctx.fillRect(-cover, -cover, cover * 2, cover * 2)
  layer.ctx.restore()

  // レイヤーはフレームと同じ大きさなので、変換を外して等倍で戻す
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.drawImage(layer.canvas, 0, 0)
  ctx.restore()
}

/**
 * 枠に沿って光が周回する演出。虹（LR）だけ。
 *
 * 線を破線にして、1 本ぶんだけ残るようにギャップを周長いっぱいに取る。
 * あとは `lineDashOffset` を時間で動かせば、パスの上を光が走る。
 * 座標を自前で追わずに済むので、角丸のままきれいに回る。
 *
 * 尾は長さの違う 3 本を、終点をそろえて重ねて作る。長いほど薄くする。
 *
 * @param ctx - 描画先。カード中心を原点とした座標系に入っていること
 * @param scene - 描画するシーン
 * @param box - カードの矩形
 * @param time - アニメーション先頭からの経過秒
 */
function drawFrameComet(ctx: Canvas2dContext, scene: CardScene, box: CardBox, time: number): void {
  const { frameColors, rainbowFrame } = scene.rarity
  if (!rainbowFrame) return

  // 外枠と同じ位置を走らせる。周長は破線の指定に要るので自前で出す
  const inset = box.unit * 0.014
  const width = box.width - inset * 2
  const height = box.height - inset * 2
  const radius = Math.max(0, box.radius - inset)
  const perimeter = 2 * (width - 2 * radius) + 2 * (height - 2 * radius) + 2 * Math.PI * radius
  if (perimeter <= 0) return

  // 頭の位置。パスの始点からの道のりで表す
  const head = ((time / COMET_CYCLE) % 1) * perimeter
  // 尾が枠を一周するあいだに虹も一周するので、光の色は常にその場の枠色に近い
  const colorIndex = Math.floor((head / perimeter) * frameColors.length) % frameColors.length

  ctx.save()
  const fade = ctx.globalAlpha
  ctx.globalCompositeOperation = 'lighter'
  ctx.lineCap = 'round'
  // にじみは影で作る。太い線を重ねるより重いが、外へ向かって落ちる裾が出るので
  // 光が枠から漏れているように見える
  ctx.shadowColor = frameColors[colorIndex] ?? '#ffffff'
  ctx.shadowBlur = box.unit * 0.07

  for (const [lengthRatio, alpha, widthRatio] of COMET_TRAIL) {
    const dash = perimeter * lengthRatio
    ctx.setLineDash([dash, perimeter - dash])
    // 破線は「始点 − offset」から始まる。終点を head にそろえるので、
    // 長さのぶんだけ手前から引き始める
    ctx.lineDashOffset = dash - head
    // カード側のフェードに乗せる。代入すると退場後も光だけが枠を回り続ける
    ctx.globalAlpha = alpha * fade
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = box.unit * widthRatio
    roundedRectPath(ctx, box, inset)
    ctx.stroke()
  }

  ctx.restore()
}

/** 周回する光の尾。`[周長に対する長さ, 濃さ, 短辺に対する太さ]` を長い順に。 */
const COMET_TRAIL: readonly (readonly [number, number, number])[] = [
  [0.14, 0.18, 0.01],
  [0.06, 0.4, 0.013],
  [0.02, 0.9, 0.016],
]

/** 枠に使うグラデーションを作る。虹だけは時間で回るコニックグラデーションにする。 */
function createFrameStyle(
  ctx: Canvas2dContext,
  scene: CardScene,
  box: CardBox,
  time: number,
): CanvasGradient {
  const { frameColors, rainbowFrame } = scene.rarity

  if (rainbowFrame) {
    // 1 周 2 秒で回転させると、虹色が枠を流れているように見える
    const gradient = ctx.createConicGradient((time * Math.PI) / 1, 0, 0)
    frameColors.forEach((color, index) => {
      gradient.addColorStop(index / (frameColors.length - 1), color)
    })
    return gradient
  }

  const gradient = ctx.createLinearGradient(
    -box.width / 2,
    -box.height / 2,
    box.width / 2,
    box.height / 2,
  )
  frameColors.forEach((color, index) => {
    gradient.addColorStop(index / Math.max(1, frameColors.length - 1), color)
  })
  return gradient
}

/** アートワークを指定矩形に cover 配置で描く。 */
function drawArtwork(
  ctx: Canvas2dContext,
  scene: CardScene,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  if (!scene.image || scene.imageWidth === 0 || scene.imageHeight === 0) {
    // 画像が無いときは、レアリティ色の下地だけを見せてレイアウトを確認できるようにする
    const placeholder = ctx.createLinearGradient(x, y, x, y + height)
    placeholder.addColorStop(0, scene.rarity.backdropColors[0])
    placeholder.addColorStop(1, scene.rarity.backdropColors[1])
    ctx.fillStyle = placeholder
    ctx.fillRect(x, y, width, height)
    return
  }

  // 短い辺を基準に拡大し、枠内を隙間なく埋めてからはみ出しを切り落とす
  const scale = Math.max(width / scene.imageWidth, height / scene.imageHeight)
  const drawWidth = scene.imageWidth * scale
  const drawHeight = scene.imageHeight * scale
  ctx.drawImage(
    scene.image,
    x + (width - drawWidth) / 2,
    y + (height - drawHeight) / 2,
    drawWidth,
    drawHeight,
  )
}

/** カード表面を斜めに走る光沢。着地後に `shineCount` 回だけ通る。 */
/**
 * 帯の傾き（ラジアン）。光沢とオーロラで共有する。
 * 別々に持つと、片方だけ直したときに 2 本の帯が平行でなくなる。
 */
const SWEEP_TILT = -0.42

/**
 * 斜めの帯を 1 本塗る。
 *
 * キャンバスごと傾けてから、カードを覆いきる大きさの矩形をグラデーションで
 * 塗りつぶす。回した状態でも隅まで届くよう、矩形はカードの 3 倍を取る。
 *
 * @param ctx - 描画先。カード中心を原点とした座標系に入っていること
 * @param box - カードの矩形
 * @param gradient - 帯の色。横方向に並べておくと斜めの帯になる
 */
function paintSweep(ctx: Canvas2dContext, box: CardBox, gradient: CanvasGradient): void {
  ctx.rotate(SWEEP_TILT)
  ctx.fillStyle = gradient
  ctx.fillRect(-box.width * 1.5, -box.height * 1.5, box.width * 3, box.height * 3)
}

/**
 * カード面を斜めに流れ続ける虹のオーロラ。虹（LR）だけの演出。
 *
 * {@link drawShine} の白い帯は登場後に決まった回数だけ走るが、こちらは
 * 尺のあいだずっと流れ続ける。「常に何かが動いている」ことで最上位を示す。
 *
 * @param ctx - 描画先。カードの角丸でクリップされた中に入っていること
 * @param scene - 描画するシーン
 * @param box - カードの矩形
 * @param time - アニメーション先頭からの経過秒
 */
function drawAurora(ctx: Canvas2dContext, scene: CardScene, box: CardBox, time: number): void {
  const { frameColors, rainbowFrame } = scene.rarity
  if (!rainbowFrame || frameColors.length < 2) return

  // 帯はカードの外から外へ抜ける。折り返しはカードの外で起きるので、
  // 位置が一周して戻ってもつなぎ目は見えない
  const phase = (time % AURORA_CYCLE) / AURORA_CYCLE
  const travel = box.width * 3.2
  const center = -travel / 2 + travel * phase
  const half = box.width * 0.45

  const gradient = ctx.createLinearGradient(center - half, 0, center + half, 0)
  gradient.addColorStop(0, 'rgba(0,0,0,0)')
  frameColors.forEach((color, index) => {
    gradient.addColorStop(0.12 + (0.76 * index) / (frameColors.length - 1), color)
  })
  gradient.addColorStop(1, 'rgba(0,0,0,0)')

  ctx.save()
  // 加算だと白く飛んでアートが消える。screen なら明るいところを持ち上げつつ色が残る
  ctx.globalCompositeOperation = 'screen'
  // 代入するとカードのフェードを打ち消し、登場前から帯だけが見えてしまう
  ctx.globalAlpha *= 0.32
  paintSweep(ctx, box, gradient)
  ctx.restore()
}

function drawShine(
  ctx: Canvas2dContext,
  scene: CardScene,
  box: CardBox,
  timeline: Timeline,
  time: number,
): void {
  const { shineCount } = scene.rarity
  if (shineCount === 0) return

  const sweepDuration = 0.55
  const idleSpan = Math.max(0.6, timeline.exitStart - timeline.entranceEnd)
  // 光沢どうしが重ならないよう、アイドル区間を回数で割った間隔に置く
  const interval = idleSpan / shineCount

  for (let i = 0; i < shineCount; i++) {
    const start = timeline.entranceEnd + 0.08 + i * interval
    const t = progress(time, start, start + sweepDuration)
    if (t <= 0 || t >= 1) continue

    // 帯はカードの外から外へ抜ける。移動量に幅を足して端でも切れないようにする
    const travel = box.width * 2.2
    const x = -travel / 2 + travel * t
    const bandWidth = box.width * 0.42
    const gradient = ctx.createLinearGradient(x - bandWidth, 0, x + bandWidth, 0)
    gradient.addColorStop(0, 'rgba(255,255,255,0)')
    gradient.addColorStop(0.5, `rgba(255,255,255,${0.58 * pulse(t)})`)
    gradient.addColorStop(1, 'rgba(255,255,255,0)')

    ctx.save()
    paintSweep(ctx, box, gradient)
    ctx.restore()
  }
}

/** 虹レアリティのカード表面に、うっすらホログラム模様を重ねる。 */
function drawHologram(ctx: Canvas2dContext, box: CardBox, time: number): void {
  const gradient = ctx.createConicGradient(-time * 0.8, 0, 0)
  const colors = ['#ff5f6d', '#ffc371', '#4be7a0', '#4aa8ff', '#b06bff', '#ff5f6d']
  colors.forEach((color, index) => {
    gradient.addColorStop(index / (colors.length - 1), color)
  })
  ctx.save()
  ctx.globalCompositeOperation = 'overlay'
  // 代入するとカードのフェードインが無視され、登場前から模様だけが出てしまう
  ctx.globalAlpha *= 0.4
  ctx.fillStyle = gradient
  ctx.fillRect(-box.width / 2, -box.height / 2, box.width, box.height)
  ctx.restore()
}

/** カード下部の名前帯と、左上のレアリティバッジ。 */
function drawLabels(ctx: Canvas2dContext, scene: CardScene, box: CardBox): void {
  const { title, subtitle, rarity, badge } = scene

  if (title) {
    // 帯の厚みは文字の大きさに追従させる。カードの高さを基準にすると、
    // 横向きのときに帯だけが不釣り合いに薄くなる
    const bandHeight = box.unit * 0.24
    const bandTop = box.height / 2 - bandHeight - box.unit * 0.045
    // 文字が読めるよう、帯は下に向かって濃くする
    const band = ctx.createLinearGradient(0, bandTop, 0, bandTop + bandHeight)
    band.addColorStop(0, 'rgba(0,0,0,0)')
    band.addColorStop(0.45, 'rgba(0,0,0,0.72)')
    band.addColorStop(1, 'rgba(0,0,0,0.86)')
    ctx.fillStyle = band
    ctx.fillRect(-box.width / 2, bandTop, box.width, bandHeight + box.unit * 0.05)

    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    ctx.fillStyle = '#ffffff'
    ctx.font = `700 ${box.unit * 0.098}px "Hiragino Sans", "Noto Sans JP", system-ui, sans-serif`
    // 折り返しはできないので、はみ出す長さは maxWidth で詰めさせる
    ctx.fillText(title, 0, bandTop + bandHeight * 0.62, box.width * 0.86)

    if (subtitle) {
      ctx.fillStyle = 'rgba(255,255,255,0.72)'
      ctx.font = `500 ${box.unit * 0.052}px "Hiragino Sans", "Noto Sans JP", system-ui, sans-serif`
      ctx.fillText(subtitle, 0, bandTop + bandHeight * 0.95, box.width * 0.8)
    }
  }

  if (!badge) return

  // バッジは左上に置く。文字幅に合わせてピルの幅を決める
  ctx.font = `800 ${box.unit * 0.058}px system-ui, sans-serif`
  const textWidth = ctx.measureText(badge).width
  const padding = box.unit * 0.04
  const pillWidth = textWidth + padding * 2
  const pillHeight = box.unit * 0.1
  const pillX = -box.width / 2 + box.unit * 0.055
  const pillY = -box.height / 2 + box.unit * 0.055

  ctx.beginPath()
  ctx.roundRect(pillX, pillY, pillWidth, pillHeight, pillHeight / 2)
  ctx.fillStyle = 'rgba(0,0,0,0.55)'
  ctx.fill()
  ctx.strokeStyle = rarity.frameColors[0]!
  ctx.lineWidth = box.unit * 0.007
  ctx.stroke()

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = rarity.frameColors[0]!
  ctx.fillText(badge, pillX + pillWidth / 2, pillY + pillHeight / 2)
}

/**
 * カード本体を描く。グローを敷き、角丸で切り抜いた中に絵と文字を置き、
 * 枠を重ねて、最後に周回する光を走らせる。
 *
 * 拡大はこの中で掛ける。粒や衝撃波はカードと一緒に拡大させたくないので、
 * 呼び出し側の座標系は等倍のまま残す。
 *
 * @param ctx - 描画先。カード中心を原点とした等倍の座標系に入っていること
 * @param time - アニメーション先頭からの経過秒
 * @param scene - 描画するシーン
 * @param box - カードの矩形
 * @param timeline - 演出の区切り時刻
 * @param transform - その時刻のカードの姿勢
 */
export function drawCardSurface(
  ctx: Canvas2dContext,
  time: number,
  scene: CardScene,
  box: CardBox,
  timeline: Timeline,
  transform: CardTransform,
): void {
  ctx.save()
  ctx.scale(transform.scale, transform.scale)

  // グローはカード本体の下に敷く。着地の瞬間だけ一段強くする
  const glowPulse = 0.85 + 0.15 * Math.sin(time * 2.4)
  const glowStrength = scene.rarity.glowStrength * glowPulse + transform.impact * 0.4
  const glowBlur = computeGlowBlur(scene, box, transform.scale, glowStrength)
  drawGlow(ctx, scene, box, glowBlur, time)

  // カード内部の描画。角丸でクリップして、はみ出しを全部切る
  ctx.save()
  roundedRectPath(ctx, box)
  ctx.clip()

  const inset = box.unit * 0.035
  drawArtwork(
    ctx,
    scene,
    -box.width / 2 + inset,
    -box.height / 2 + inset,
    box.width - inset * 2,
    box.height - inset * 2,
  )

  // 四隅を落として中央のアートを浮かせる
  // 外周半径はカードの対角に合わせる。片方の辺だけを基準にすると、
  // 横向きのときに左右の端だけが黒く沈んでしまう
  const vignette = ctx.createRadialGradient(
    0,
    0,
    box.unit * 0.2,
    0,
    0,
    Math.hypot(box.width, box.height) * 0.6,
  )
  vignette.addColorStop(0, 'rgba(0,0,0,0)')
  vignette.addColorStop(1, 'rgba(0,0,0,0.55)')
  ctx.fillStyle = vignette
  ctx.fillRect(-box.width / 2, -box.height / 2, box.width, box.height)

  if (scene.rarity.rainbowFrame) {
    drawHologram(ctx, box, time)
  }

  drawAurora(ctx, scene, box, time)
  drawShine(ctx, scene, box, timeline, time)
  drawLabels(ctx, scene, box)
  ctx.restore()

  // 枠は 2 重。太い外枠の内側に細いラインを入れて、厚みを感じさせる
  const frameStyle = createFrameStyle(ctx, scene, box, time)
  ctx.strokeStyle = frameStyle
  ctx.lineWidth = box.unit * 0.028
  roundedRectPath(ctx, box, box.unit * 0.014)
  ctx.stroke()

  ctx.strokeStyle = 'rgba(255,255,255,0.55)'
  ctx.lineWidth = box.unit * 0.005
  roundedRectPath(ctx, box, box.unit * 0.045)
  ctx.stroke()

  drawFrameComet(ctx, scene, box, time)

  ctx.restore()
}
