/**
 * レアリティ演出のパーティクル。
 *
 * 位置を毎フレーム積分すると再生位置をシークしたときに絵が変わってしまうため、
 * すべての粒は「生成時に決めたパラメータ + 経過時間」から位置を直接計算する
 * パラメトリック方式にしている。おかげでプレビューのシークと書き出しが常に一致する。
 */

import type { RarityPreset } from "./rarity.ts";
import { createRng, randomBetween, randomPick } from "./math.ts";

/** 粒の描画形状。 */
export type ParticleShape = "circle" | "star" | "shard";

/** 1 粒分の、時間に依存しないパラメータ。 */
export interface Particle {
  /** 出現時刻（秒）。 */
  birth: number;
  /** 出現から消滅までの長さ（秒）。 */
  life: number;
  /** 出現位置 X（カード中心を原点とした px）。 */
  x0: number;
  /** 出現位置 Y（カード中心を原点とした px）。 */
  y0: number;
  /** 初速 X（px/秒）。 */
  vx: number;
  /** 初速 Y（px/秒、上方向が負）。 */
  vy: number;
  /** 落下加速度（px/秒²）。負なら上に吸い上げられる。 */
  gravity: number;
  /** 基準サイズ（px）。 */
  size: number;
  color: string;
  shape: ParticleShape;
  /** 回転速度（ラジアン/秒）。 */
  spin: number;
  /** 横揺れの振幅（px）。 */
  swayAmplitude: number;
  /** 横揺れの周波数（ラジアン/秒）。 */
  swayFrequency: number;
  /** 横揺れの位相オフセット（ラジアン）。 */
  swayPhase: number;
}

/** ある時刻における粒の描画状態。 */
export interface ParticleState {
  x: number;
  y: number;
  size: number;
  /** 不透明度 0-1。 */
  alpha: number;
  /** 回転角（ラジアン）。 */
  rotation: number;
  color: string;
  shape: ParticleShape;
}

/** パーティクル生成に必要なカードの寸法情報。 */
export interface ParticleField {
  /** カードの幅（px）。 */
  cardWidth: number;
  /** カードの高さ（px）。 */
  cardHeight: number;
  /** アニメーション全体の尺（秒）。 */
  duration: number;
  /** 演出が始まる時刻（秒）。登場アニメの着地に合わせる。 */
  startAt: number;
}

/**
 * レアリティに応じたパーティクル一式を生成する。
 *
 * 種類ごとに挙動が違う:
 * - `dust`: カード下端から立ち上り、ゆらゆらと上へ抜けていく
 * - `spark`: カード面から四方へ飛び散り、重力で落ちる火花
 * - `burst`: 登場の瞬間に外向きへ一斉に弾け、その後は残り火が漂う
 *
 * @param preset - レアリティプリセット
 * @param field - カード寸法とタイムライン情報
 * @param seed - 乱数シード。同じ値なら常に同じ配置になる
 * @returns 生成された粒の配列（`kind` が `none` なら空配列）
 */
export function createParticles(
  preset: RarityPreset,
  field: ParticleField,
  seed: number,
): Particle[] {
  const { kind, count, colors } = preset.particle;
  if (kind === "none" || count === 0) return [];

  const rng = createRng(seed);
  const { cardWidth: w, cardHeight: h, duration, startAt } = field;
  // 粒が消えきる前に動画が終わらないよう、生成のリミットを尺から逆算する
  const spawnWindow = Math.max(0.1, duration - startAt);
  // 粒の大きさは短辺、飛ぶ速さはカード全体の大きさに合わせる。
  // どちらも幅だけを基準にすると、横向きのカードで粒が肥大化して飛び方も変わる
  const unit = Math.min(w, h);
  const span = (w + h) / 2;
  const particles: Particle[] = [];

  for (let i = 0; i < count; i++) {
    const shared = {
      color: randomPick(rng, colors),
      spin: randomBetween(rng, -4, 4),
      swayPhase: randomBetween(rng, 0, Math.PI * 2),
    };

    if (kind === "dust") {
      // 下端の少し外側から湧かせ、寿命いっぱいかけて上へ抜けさせる
      const life = randomBetween(rng, 1.1, 2.2);
      particles.push({
        ...shared,
        birth: startAt + randomBetween(rng, 0, spawnWindow),
        life,
        x0: randomBetween(rng, -w * 0.58, w * 0.58),
        y0: randomBetween(rng, h * 0.4, h * 0.62),
        vx: randomBetween(rng, -8, 8),
        vy: randomBetween(rng, -span * 0.42, -span * 0.18),
        gravity: randomBetween(rng, -6, 6),
        size: randomBetween(rng, unit * 0.006, unit * 0.018),
        shape: rng() < 0.25 ? "star" : "circle",
        swayAmplitude: randomBetween(rng, unit * 0.01, unit * 0.05),
        swayFrequency: randomBetween(rng, 1.2, 3.4),
      });
      continue;
    }

    if (kind === "spark") {
      // カード面のどこかから四方へ飛ばす。半分は登場直後に集中させて「弾けた」感を出す
      const angle = randomBetween(rng, 0, Math.PI * 2);
      const speed = randomBetween(rng, span * 0.18, span * 0.55);
      const early = i < count * 0.5;
      particles.push({
        ...shared,
        birth: startAt + (early ? randomBetween(rng, 0, 0.25) : randomBetween(rng, 0, spawnWindow)),
        life: randomBetween(rng, 0.5, 1.3),
        x0: randomBetween(rng, -w * 0.4, w * 0.4),
        y0: randomBetween(rng, -h * 0.35, h * 0.35),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        gravity: randomBetween(rng, span * 0.25, span * 0.6),
        size: randomBetween(rng, unit * 0.005, unit * 0.016),
        shape: rng() < 0.4 ? "shard" : "circle",
        swayAmplitude: 0,
        swayFrequency: 0,
      });
      continue;
    }

    // burst: 7 割は着地の瞬間に中心から放射状へ、残りは漂う残り火にする
    const isBlast = i < count * 0.7;
    const angle = randomBetween(rng, 0, Math.PI * 2);
    if (isBlast) {
      const speed = randomBetween(rng, span * 0.4, span * 1.1);
      particles.push({
        ...shared,
        birth: startAt + randomBetween(rng, 0, 0.12),
        life: randomBetween(rng, 0.6, 1.4),
        x0: Math.cos(angle) * unit * 0.1,
        y0: Math.sin(angle) * unit * 0.1,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        gravity: randomBetween(rng, span * 0.1, span * 0.4),
        size: randomBetween(rng, unit * 0.006, unit * 0.02),
        shape: rng() < 0.5 ? "star" : "shard",
        swayAmplitude: 0,
        swayFrequency: 0,
      });
    } else {
      particles.push({
        ...shared,
        birth: startAt + randomBetween(rng, 0, spawnWindow),
        life: randomBetween(rng, 1.2, 2.4),
        x0: randomBetween(rng, -w * 0.6, w * 0.6),
        y0: randomBetween(rng, h * 0.3, h * 0.6),
        vx: randomBetween(rng, -10, 10),
        vy: randomBetween(rng, -span * 0.36, -span * 0.14),
        gravity: -4,
        size: randomBetween(rng, unit * 0.006, unit * 0.016),
        shape: "circle",
        swayAmplitude: randomBetween(rng, unit * 0.015, unit * 0.06),
        swayFrequency: randomBetween(rng, 1, 3),
      });
    }
  }

  return particles;
}

/**
 * 指定時刻における粒の描画状態を求める。まだ生まれていない、または寿命切れなら `null`。
 *
 * @param particle - 対象の粒
 * @param time - アニメーション先頭からの経過秒
 * @returns 描画状態、または表示対象外を示す `null`
 */
export function particleStateAt(particle: Particle, time: number): ParticleState | null {
  const age = time - particle.birth;
  if (age < 0 || age > particle.life) return null;

  // 寿命内での進み具合。フェードとサイズはこれを基準に決める
  const t = age / particle.life;
  const sway =
    particle.swayAmplitude === 0
      ? 0
      : Math.sin(age * particle.swayFrequency + particle.swayPhase) * particle.swayAmplitude;

  return {
    // 等加速度運動に横揺れを重ねた位置
    x: particle.x0 + particle.vx * age + sway,
    y: particle.y0 + particle.vy * age + 0.5 * particle.gravity * age * age,
    // 出た瞬間に最大、そこから緩やかに縮む
    size: particle.size * (1 - t * 0.55),
    // 最初の 15% で立ち上げ、残りで消していく
    alpha: t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85,
    rotation: particle.spin * age,
    color: particle.color,
    shape: particle.shape,
  };
}
