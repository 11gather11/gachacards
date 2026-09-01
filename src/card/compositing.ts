/**
 * canvas への合成まわり。カードの絵そのものには関わらない。
 *
 * 中間レイヤーの確保、モーションブラーのサンプルを積む場所、8bit へ落とす
 * 直前のディザ、フレームの縁を落とすマスク。どれも「何を描くか」ではなく
 * 「どう重ねるか」の話なので、描画の中身とは分けてある。
 */

import { createRng } from './math.ts'

/** 通常キャンバスとオフスクリーンキャンバスのどちらの 2D コンテキストも受け付ける。 */
export type Canvas2dContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

/** 中間描画に使うキャンバスとそのコンテキスト。 */
export interface Layer {
  canvas: OffscreenCanvas
  ctx: OffscreenCanvasRenderingContext2D
}

/** 1 フレーム分の中間レイヤー一式。 */
interface Layers {
  /** ブラーのサンプルを 1 枚ずつ描く場所。 */
  sample: Layer
  /** 縁を落として量子化するまで、合成を積んでおく場所。 */
  accum: Layer
  /**
   * ディザを撒く範囲を切り出す場所。
   *
   * 合成先と違ってこちらは 8bit にする。加算を重ねてアルファを 1 で頭打ちに
   * したいのに、float16 は 1 を超えた値もそのまま持ってしまうため。
   */
  mask: Layer
  /** 量子化直前に足すディザノイズ。8bit で積んでいるときは `null`。 */
  noise: CanvasPattern | null
}

/**
 * float16 のキャンバスを要求するための設定。
 * 型定義がまだ `colorType` を知らないので、ここだけキャストする。
 */
const FLOAT16_CONTEXT = { alpha: true, colorType: 'float16' } as CanvasRenderingContext2DSettings

/** `getContextAttributes` はまだ型定義に無いので、必要な部分だけ足して扱う。 */
type ContextWithAttributes = OffscreenCanvasRenderingContext2D & {
  getContextAttributes?: () => { colorType?: string }
}

/**
 * 中間レイヤーを float16 で持てるか。
 *
 * 8bit で積むと、ブラーの平均もグローの勾配も 1/255 刻みに丸められる。
 * 丸め先が隣り合う画素でそろうと、その境目が等高線になって縞に見える。
 * float16 なら量子化は最後の 1 回だけで済む。
 *
 * 設定を無視して 8bit のコンテキストを返すブラウザがあるので、
 * 要求が通ったかどうかは返ってきた属性で確かめる。
 */
const supportsFloat16 = ((): boolean => {
  if (typeof OffscreenCanvas === 'undefined') return false
  try {
    const probe = new OffscreenCanvas(1, 1).getContext('2d', FLOAT16_CONTEXT)
    const ctx: ContextWithAttributes | null = probe
    return ctx?.getContextAttributes?.().colorType === 'float16'
  } catch {
    return false
  }
})()

/** ディザノイズのタイルの一辺（px）。 */
const NOISE_TILE = 128

/**
 * ディザを撒く範囲を作るときに、合成結果を何回重ねるか。
 * アルファがこの逆数（およそ 6%）を超えていれば、マスクは 1 で頭打ちになる。
 */
const MASK_GAIN = 16

/**
 * ディザ用のノイズタイルを作る。白一色で、アルファだけを画素ごとの乱数にする。
 *
 * シードを固定するのは、描画が時刻だけで決まるという前提を崩さないため。
 * フレームごとに模様が変わると、同じ時刻を描き直したときに絵が変わってしまう。
 */
function createNoiseTile(): OffscreenCanvas | null {
  const canvas = new OffscreenCanvas(NOISE_TILE, NOISE_TILE)
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const image = ctx.createImageData(NOISE_TILE, NOISE_TILE)
  const rng = createRng(0x5eed)
  for (let i = 0; i < NOISE_TILE * NOISE_TILE; i++) {
    image.data[i * 4] = 255
    image.data[i * 4 + 1] = 255
    image.data[i * 4 + 2] = 255
    image.data[i * 4 + 3] = Math.floor(rng() * 256)
  }
  ctx.putImageData(image, 0, 0)
  return canvas
}

/** 中間レイヤーを 1 枚作る。 */
function createLayer(width: number, height: number, highPrecision: boolean): Layer | null {
  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d', highPrecision ? FLOAT16_CONTEXT : { alpha: true })
  if (!ctx) return null
  return { canvas, ctx }
}

/**
 * 描画先ごとに 1 組だけ中間レイヤーを持つ。
 * プレビューと書き出しは別のコンテキストなので、同時に走っても互いのレイヤーを壊さない。
 */
const layerCache = new WeakMap<Canvas2dContext, Layers>()

/** カードのフェード合成に使う 1 枚レイヤー。こちらも描画先ごとに持つ。 */
const fadeLayerCache = new WeakMap<Canvas2dContext, Layer>()

/** 虹のグローを染めるための 1 枚レイヤー。 */
const glowLayerCache = new WeakMap<Canvas2dContext, Layer>()

/**
 * 中間レイヤー一式を用意する。合成先はクリア済みで返る。
 *
 * @param target - 最終的な描画先のコンテキスト
 * @param width - レイヤーの幅（px）
 * @param height - レイヤーの高さ（px）
 * @returns 使えるレイヤー。OffscreenCanvas が使えない環境では `null`
 */
export function acquireLayers(
  target: Canvas2dContext,
  width: number,
  height: number,
): Layers | null {
  if (typeof OffscreenCanvas === 'undefined') return null

  let layers = layerCache.get(target)
  // サイズが変わったら作り直す。それ以外は使い回してフレームごとの確保を避ける
  if (!layers || layers.accum.canvas.width !== width || layers.accum.canvas.height !== height) {
    const sample = createLayer(width, height, supportsFloat16)
    const accum = createLayer(width, height, supportsFloat16)
    const mask = createLayer(width, height, false)
    if (!sample || !accum || !mask) return null
    // 8bit で積むときは、足せる最小の量が 1 レベルそのものなので
    // ディザにならない。ノイズごと諦める
    const tile = supportsFloat16 ? createNoiseTile() : null
    layers = { sample, accum, mask, noise: tile && mask.ctx.createPattern(tile, 'repeat') }
    layerCache.set(target, layers)
  }

  layers.accum.ctx.clearRect(0, 0, width, height)
  return layers
}

/**
 * カードのフェード合成に使うレイヤーを取り出す。中身はクリア済みで返る。
 *
 * ブラーのレイヤーとは寿命が違う。こちらは {@link renderFrame} の内側で、
 * サンプル 1 枚を描いている最中に使うので、別枠で持つ。
 *
 * @param target - フェードを合成する先のコンテキスト
 * @param width - レイヤーの幅（px）
 * @param height - レイヤーの高さ（px）
 * @returns 使えるレイヤー。OffscreenCanvas が使えない環境では `null`
 */
export function acquireFadeLayer(
  target: Canvas2dContext,
  width: number,
  height: number,
): Layer | null {
  return acquireFrom(fadeLayerCache, target, width, height)
}

/**
 * キャッシュから 1 枚レイヤーを取り出す。中身はクリア済みで返る。
 *
 * @param cache - 取り出し先のキャッシュ
 * @param target - このレイヤーを使う描画先のコンテキスト
 * @param width - レイヤーの幅（px）
 * @param height - レイヤーの高さ（px）
 * @returns 使えるレイヤー。OffscreenCanvas が使えない環境では `null`
 */
function acquireFrom(
  cache: WeakMap<Canvas2dContext, Layer>,
  target: Canvas2dContext,
  width: number,
  height: number,
): Layer | null {
  if (typeof OffscreenCanvas === 'undefined') return null

  let layer = cache.get(target)
  if (!layer || layer.canvas.width !== width || layer.canvas.height !== height) {
    const created = createLayer(width, height, supportsFloat16)
    if (!created) return null
    layer = created
    cache.set(target, layer)
  }

  layer.ctx.clearRect(0, 0, width, height)
  return layer
}

/**
 * 量子化の直前に、1 レベル未満のノイズを足す。
 *
 * なだらかな勾配を 8bit に落とすと、同じ値が何 px も続いてから 1 段落ちる。
 * その段の境目が等高線として見えるのがバンディングで、白いグローのように
 * 広い範囲を薄く覆う絵ほど目立つ。落とす前に 1 レベル未満の乱数を足しておけば、
 * どちらに丸まるかが画素ごとにばらけて、段が縞ではなく粒に散る。
 *
 * @param layers - 合成済みの中間レイヤー
 */
export function ditherAccum(layers: Layers): void {
  if (!layers.noise) return

  const { ctx, canvas } = layers.accum
  const { width, height } = canvas

  // 何もないところにまでノイズを撒くと、透明なはずの一面が 0 と 1 のまだらになる。
  // 目には見えないが、VP9 はアルファを別の動画として持つので、その一面のノイズが
  // そのままビットレートに乗る（実測でファイルが 26% 増えた）。
  // 合成結果そのものをマスクにして、光が乗っているところにだけ撒く
  const mask = layers.mask.ctx
  mask.clearRect(0, 0, width, height)
  mask.save()
  mask.globalCompositeOperation = 'lighter'
  // 薄いところこそディザが要る。重ね塗りでアルファを飽和させ、
  // わずかでも光があれば 1 になるマスクにする
  for (let i = 0; i < MASK_GAIN; i++) mask.drawImage(canvas, 0, 0)
  mask.globalCompositeOperation = 'source-in'
  mask.fillStyle = layers.noise
  mask.fillRect(0, 0, width, height)
  mask.restore()

  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  // タイルのアルファは 0..255。1/255 を掛けて、足す量を 1 レベル未満に収める
  ctx.globalAlpha = 1 / 255
  ctx.drawImage(layers.mask.canvas, 0, 0)
  ctx.restore()
}

/**
 * フレームの縁に向けてアルファを落とす。
 *
 * グローや粒、ブラーで伸びた光が端に届くと、そこで断ち切られて透過素材に
 * 四角い縁が残る。個々の演出の半径を削って回避すると光そのものが痩せるので、
 * 最後にマスクを掛けて縁だけを確実に 0 にする。
 *
 * ぼかした矩形を destination-in で合成しているだけなので、
 * 中身がどれだけ変わってもこの一手で必ず縁が消える。
 *
 * @param ctx - 描画先
 * @param width - フレームの幅（px）
 * @param height - フレームの高さ（px）
 */
/**
 * 縁のマスクの丸み。2 でちょうど楕円、大きくするほど矩形に近づく。
 *
 * 矩形で切ると、直角の内側だけ縦横のフェードが掛け算になって急に落ちる。
 * 等高線もそこで直角に折れるので、丸いグローの中に四角い縁が浮き出てしまう。
 * 楕円寄りにしておくと落ち方が全周でそろい、縁が見えなくなる。
 */
const MASK_POWER = 2.5

/** マスクの輪郭を近似する線分の数。ぼかしが乗るのでこの粗さで足りる。 */
const MASK_STEPS = 96

/**
 * 超楕円のパスを引く。`power` が 2 なら楕円、大きくするほど角が立つ。
 *
 * @param ctx - 描画先
 * @param cx - 中心の x 座標（px）
 * @param cy - 中心の y 座標（px）
 * @param rx - x 方向の半径（px）
 * @param ry - y 方向の半径（px）
 * @param power - 丸みの指数。既定は {@link MASK_POWER}
 */
function superellipsePath(
  ctx: Canvas2dContext,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  power: number = MASK_POWER,
): void {
  ctx.beginPath()
  for (let i = 0; i <= MASK_STEPS; i++) {
    const angle = (i / MASK_STEPS) * Math.PI * 2
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    // |cos t|^(2/n) に符号を戻したものが超楕円の媒介変数表示。n = 2 で楕円に戻る
    const x = cx + rx * Math.sign(cos) * Math.abs(cos) ** (2 / power)
    const y = cy + ry * Math.sign(sin) * Math.abs(sin) ** (2 / power)
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
}

export function fadeFrameEdges(ctx: Canvas2dContext, width: number, height: number): void {
  // 幅を広く取るほど光は緩やかに溶けて消える。ただし広げすぎると、
  // スラムで 1.6 倍に膨らんだカードの角にまで届いて本体が透けてしまう。
  // 実測では短辺の 7% で本体が削られ始めるので、その手前で止める。
  // ぼかしは幅の半分。canvas の blur(r) は 1.5r ほどで消えるため、
  // 輪郭から外へ 0.75 * fade で 0 になり、端まで余裕が残る
  const fade = Math.min(width, height) * 0.06
  ctx.save()
  ctx.globalCompositeOperation = 'destination-in'
  ctx.filter = `blur(${fade / 2}px)`
  ctx.fillStyle = '#000'
  superellipsePath(ctx, width / 2, height / 2, width / 2 - fade, height / 2 - fade)
  ctx.fill()
  ctx.restore()
}

/** モーションブラーの設定。 */
export interface MotionBlur {
  /** 1 フレームあたりのサンプル数。1 ならブラーなし。 */
  samples: number
  /** 1 フレームの長さ（秒）。サンプルを散らす幅の基準になる。 */
  frameDuration: number
  /**
   * シャッター開角。1 でフレームいっぱい露光し、0.5 なら前半だけ。
   * 大きいほどブラーが伸びるが、輪郭は甘くなる。
   */
  shutter: number
}

/**
 * 虹のグローを染めるレイヤーを取り出す。中身はクリア済みで返る。
 *
 * @param target - このレイヤーを使う描画先のコンテキスト
 * @param width - レイヤーの幅（px）
 * @param height - レイヤーの高さ（px）
 * @returns 使えるレイヤー。OffscreenCanvas が使えない環境では `null`
 */
export function acquireGlowLayer(
  target: Canvas2dContext,
  width: number,
  height: number,
): Layer | null {
  return acquireFrom(glowLayerCache, target, width, height)
}
