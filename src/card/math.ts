/**
 * 描画で使うイージングと、シード固定の擬似乱数。
 *
 * プレビューと書き出しで完全に同じ絵を出す必要があるため、
 * 乱数は必ずここの {@link createRng} を通し、`Math.random` は使わない。
 */

/** 値を [min, max] に収める。 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * `from`〜`to` の区間で value がどこにいるかを 0-1 で返す。区間外はクランプされる。
 *
 * @example
 * progress(1.5, 1, 2) // => 0.5
 */
export function progress(value: number, from: number, to: number): number {
  if (to === from) return value >= to ? 1 : 0;
  return clamp((value - from) / (to - from), 0, 1);
}

/** 0-1 を滑らかな 0-1 に変換する（両端で速度 0）。 */
export function smoothstep(t: number): number {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

/** 減速しながら着地する。登場の基本。 */
export function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

/** 加速しながら消える。退場の基本。 */
export function easeInCubic(t: number): number {
  return t ** 3;
}

/** 目標を一度行き過ぎてから戻る。勢いのある登場向け。 */
export function easeOutBack(t: number, overshoot = 1.7): number {
  const c = overshoot + 1;
  return 1 + c * (t - 1) ** 3 + overshoot * (t - 1) ** 2;
}

/**
 * 目標地点で数回バウンドしてから止まる。叩きつける登場（slam）向け。
 */
export function easeOutElastic(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const period = 0.35;
  return 2 ** (-10 * t) * Math.sin(((t - period / 4) * (2 * Math.PI)) / period) + 1;
}

/** 0-1 を 0→1→0 の山にする。フラッシュなど一瞬の演出に使う。 */
export function pulse(t: number): number {
  return Math.sin(clamp(t, 0, 1) * Math.PI);
}

/** シード固定の擬似乱数生成器。呼ぶたびに 0 以上 1 未満を返す。 */
export type Rng = () => number;

/**
 * mulberry32 による決定論的な擬似乱数生成器を作る。
 * 同じシードなら常に同じ数列を返すので、書き出しのたびに絵が変わることがない。
 *
 * @param seed - 任意の整数シード
 * @returns 0 以上 1 未満を返す関数
 */
export function createRng(seed: number): Rng {
  // 32bit に丸めた内部状態を、呼び出しごとに黄金比由来の定数で進める
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    // 状態を自身のシフト値と掛け合わせて撹拌する
    let x = state;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    // 上位ビットを取り出して 0-1 に正規化する
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** rng を使って [min, max) の実数を得る。 */
export function randomBetween(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min);
}

/** rng を使って配列から 1 要素選ぶ。 */
export function randomPick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length) % items.length]!;
}
