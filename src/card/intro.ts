/**
 * カードが出る前の共通演出。
 *
 * 光が中心に集まり、膨らんで、弾けた瞬間にカードが出る。ここまではどのレアリティでも
 * 同じ動きで、違うのは「光の色」だけ。集まっている最中に色が上がっていくことで、
 * パチンコの保留変化と同じ「色が変わった瞬間にアツくなる」を作る。
 *
 * 色の段取り（昇格・ガセ落ち）は seed から決まるので、同じ seed なら毎回同じ演出になる。
 */

import { createRng, easeOutCubic, progress, pulse, randomBetween } from "./math.ts";
import type { RarityPreset } from "./rarity.ts";
import { RARITY_PRESETS } from "./rarity.ts";
import type { Canvas2dContext } from "./render.ts";

/** 入りの演出で色をどう動かすか。 */
export type PromotionMode =
  /** 最初からレアリティの色。色では何も引っ張らない */
  | "none"
  /** 下位の色から始めて、段階的に本来の色まで上げる */
  | "promote"
  /** 昇格に加えて、本来より上の色を一瞬だけ見せてから落とす（ガセ） */
  | "fake";

/** UI から選ぶ入り演出の設定。`"off"` なら演出そのものを出さない。 */
export type IntroMode = "off" | PromotionMode;

/** 光の色が切り替わる 1 段階。 */
export interface IntroStage {
  /** 入り演出を 0-1 に正規化した時刻。この時刻からこの色になる。 */
  at: number;
  rarity: RarityPreset;
  /** 本来より上の色を一瞬見せているだけの段階なら `true`。 */
  fake: boolean;
}

/** 中心へ吸い込まれていく光の粒。位置は時刻から直接求める。 */
export interface IntroParticle {
  /** 出現する方角（ラジアン）。 */
  angle: number;
  /** 出現時の中心からの距離。フレーム短辺に対する比率。 */
  startRadius: number;
  /** 入り演出内での出現時刻（0-1）。 */
  delay: number;
  /** 中心に届くまでの長さ（0-1）。 */
  span: number;
  /** 粒の大きさ。フレーム短辺に対する比率。 */
  size: number;
  /** 吸い込まれる間に回り込む角度（ラジアン）。 */
  swirl: number;
}

/** 入り演出を描くのに必要な一式。 */
export interface IntroConfig {
  /** 色の段取り。`at` の昇順。 */
  stages: readonly IntroStage[];
  particles: readonly IntroParticle[];
}

/**
 * 入り演出の長さを決める。
 *
 * @param duration - 全体の尺（秒）
 * @param enabled - 入り演出を出すかどうか
 * @returns 入り演出の長さ（秒）。無効なら 0
 */
export function computeIntroDuration(duration: number, enabled: boolean): number {
  if (!enabled) return 0;
  // 長い尺でも溜めすぎると間延びするので上限を置き、短い尺では比率で縮める
  return Math.min(1.3, duration * 0.35);
}

/**
 * 色の段取りを組み立てる。
 *
 * `promote` では本来の色より下から始めて段階的に上げ、`fake` ではその途中に
 * 「本来より上の色が一瞬出て、すぐ落ちる」段階を挟む。
 *
 * @param target - 最終的に落ち着くレアリティ
 * @param mode - 色の動かし方
 * @param seed - 乱数シード。段数とガセの有無がこれで決まる
 * @returns `at` の昇順に並んだ段階の配列。先頭は必ず 0 から始まる
 *
 * @example
 * // 金 + promote なら 緑 → 赤 → 金 のように上がっていく
 * buildIntroStages(getRarity("gold"), "promote", 1);
 */
export function buildIntroStages(
  target: RarityPreset,
  mode: PromotionMode,
  seed: number,
): IntroStage[] {
  const targetIndex = RARITY_PRESETS.findIndex((preset) => preset.id === target.id);
  const finalStage: IntroStage = { at: 0, rarity: target, fake: false };
  if (mode === "none" || targetIndex <= 0) return [finalStage];

  const rng = createRng(seed ^ 0x5eed);
  // 何段下から始めるか。最大 2 段だが、下位レアリティでは白より下に行けない
  const climb = Math.min(targetIndex, 1 + Math.floor(rng() * 2));
  const stages: IntroStage[] = [];

  // 昇格は後半に寄せる。前半で上がりきると、溜めの間ずっと同じ色になって間延びする
  for (let step = 0; step <= climb; step++) {
    stages.push({
      at: step === 0 ? 0 : 0.3 + (0.5 * (step - 1)) / Math.max(1, climb - 1 || 1),
      rarity: RARITY_PRESETS[targetIndex - climb + step]!,
      fake: false,
    });
  }

  // ガセは「本来より上の色が一瞬出て、弾ける直前に落ちる」。
  // 本来が最上位なら上がないので、代わりに一段落として見せる
  if (mode === "fake" && rng() < 0.55) {
    const isTop = targetIndex >= RARITY_PRESETS.length - 1;
    const teaser = RARITY_PRESETS[isTop ? targetIndex - 1 : targetIndex + 1]!;
    stages.push({ at: 0.68, rarity: teaser, fake: true });
    stages.push({ at: 0.82, rarity: target, fake: false });
  }

  stages.sort((a, b) => a.at - b.at);
  return stages;
}

/**
 * 中心へ吸い込まれる粒を作る。
 *
 * 演出は共通なので、粒の数や散らばりはレアリティによらず同じにしている。
 *
 * @param count - 粒の数
 * @param seed - 乱数シード
 */
export function createIntroParticles(count: number, seed: number): IntroParticle[] {
  const rng = createRng(seed ^ 0xfade);
  const particles: IntroParticle[] = [];

  for (let i = 0; i < count; i++) {
    particles.push({
      angle: randomBetween(rng, 0, Math.PI * 2),
      // フレームの外から湧かせると端で粒が切れるので、内側から吸い込ませる
      startRadius: randomBetween(rng, 0.2, 0.45),
      // 弾ける直前まで吸い込みが続くよう、出現を演出の前半〜中盤に散らす
      delay: randomBetween(rng, 0, 0.7),
      span: randomBetween(rng, 0.25, 0.5),
      size: randomBetween(rng, 0.004, 0.012),
      swirl: randomBetween(rng, -1.2, 1.2),
    });
  }

  return particles;
}

/**
 * その時刻に有効な段階を返す。
 *
 * @param stages - 色の段取り
 * @param p - 入り演出内の正規化時刻（0-1）
 */
export function currentStage(stages: readonly IntroStage[], p: number): IntroStage {
  let current = stages[0]!;
  for (const stage of stages) {
    if (p >= stage.at) current = stage;
  }
  return current;
}

/** 直前の色替わりからどれだけ経ったかを 0-1 で返す。1 なら十分時間が経っている。 */
function sinceStageChange(stages: readonly IntroStage[], p: number): number {
  let last = 0;
  for (const stage of stages) {
    if (p >= stage.at) last = stage.at;
  }
  if (last === 0) return 1;
  // 色が変わってからの 0.12（正規化時間）を昇格の見せ場として使う
  return progress(p, last, last + 0.12);
}

/** 入り演出の描画に必要なフレームの寸法。 */
interface IntroFrame {
  width: number;
  height: number;
}

/**
 * 縁のぼやけたリングを描く。
 *
 * ストロークで描くと線が硬く、光ではなく輪郭線に見えてしまうため、
 * 内外に向かって透明に落ちるグラデーションのドーナツとして塗っている。
 *
 * @param ctx - 描画先。中心が原点になるよう変換済みであること
 * @param radius - リングの中心半径（px）
 * @param thickness - にじみの幅（px）
 * @param color - リングの色
 * @param alpha - 不透明度 0-1
 */
function drawSoftRing(
  ctx: Canvas2dContext,
  radius: number,
  thickness: number,
  color: string,
  alpha: number,
): void {
  if (radius <= 0 || alpha <= 0 || thickness <= 0) return;

  const outer = radius + thickness;
  const gradient = ctx.createRadialGradient(0, 0, Math.max(0, radius - thickness), 0, 0, outer);
  gradient.addColorStop(0, "rgba(0,0,0,0)");
  gradient.addColorStop(0.5, color);
  gradient.addColorStop(1, "rgba(0,0,0,0)");

  ctx.globalAlpha = alpha;
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(0, 0, outer, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * 入り演出を 1 フレーム描く。
 *
 * カードのフェードとは独立した演出なので、呼び出し側で `globalAlpha` を掛けない。
 * 光はすべて加算合成で描き、半径はフレームの内側に収まる範囲に制限している
 * （端で切ると透過素材に四角い光の板が残るため）。
 *
 * @param ctx - 描画先
 * @param frame - 出力フレームの寸法
 * @param intro - 色の段取りと粒
 * @param introDuration - 入り演出の長さ（秒）
 * @param time - アニメーション先頭からの経過秒
 */
export function drawIntro(
  ctx: Canvas2dContext,
  frame: IntroFrame,
  intro: IntroConfig,
  introDuration: number,
  time: number,
): void {
  const p = progress(time, 0, introDuration);
  if (p <= 0 || p >= 1) return;

  const stage = currentStage(intro.stages, p);
  const color = stage.rarity.glowColor;
  const accent = stage.rarity.frameColors[1] ?? color;
  const unit = Math.min(frame.width, frame.height);
  // ここを超えるとフレーム端で光が切られる
  const maxRadius = unit * 0.46;

  // 溜めと弾けを分ける。弾けはカードの登場に重なる
  const charge = progress(p, 0, 0.86);
  const burst = progress(p, 0.86, 1);
  // 色が変わった直後だけ 1 に近づく。昇格の見せ場に使う
  const promotion = 1 - sinceStageChange(intro.stages, p);

  ctx.save();
  ctx.translate(frame.width / 2, frame.height / 2);
  // 光の重なりを素直に足し合わせる
  ctx.globalCompositeOperation = "lighter";

  // 回転する放射光。溜めが進むほど長く伸びる
  const rayCount = 12;
  const rayLength = maxRadius * (0.25 + 0.75 * easeOutCubic(charge));
  ctx.save();
  ctx.rotate(p * 2.2);
  ctx.globalAlpha = 0.32 * charge * (1 - burst);
  for (let i = 0; i < rayCount; i++) {
    const angle = (i / rayCount) * Math.PI * 2;
    const ray = ctx.createLinearGradient(
      0,
      0,
      Math.cos(angle) * rayLength,
      Math.sin(angle) * rayLength,
    );
    ray.addColorStop(0, accent);
    ray.addColorStop(1, "rgba(0,0,0,0)");
    ctx.strokeStyle = ray;
    ctx.lineWidth = unit * 0.012;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(angle) * rayLength, Math.sin(angle) * rayLength);
    ctx.stroke();
  }
  ctx.restore();

  // 外から中心へ繰り返し縮んでいくリング
  for (let i = 0; i < 3; i++) {
    const t = (charge * 2.4 + i / 3) % 1;
    drawSoftRing(
      ctx,
      maxRadius * (1 - easeOutCubic(t)),
      unit * 0.022 * (1 - t * 0.5),
      color,
      pulse(t) * 0.45 * charge * (1 - burst),
    );
  }

  // 吸い込まれる粒
  for (const particle of intro.particles) {
    const q = progress(p, particle.delay, particle.delay + particle.span);
    if (q <= 0 || q >= 1) continue;

    const radius = particle.startRadius * unit * (1 - easeOutCubic(q));
    const angle = particle.angle + particle.swirl * q;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    // 出た直後に立ち上げ、中心へ着く頃には吸い込まれて消える
    const size = particle.size * unit * (1 - q * 0.6);

    ctx.globalAlpha = Math.min(1, q * 4) * (1 - q) * (1 - burst);
    const glow = ctx.createRadialGradient(x, y, 0, x, y, size * 2.5);
    glow.addColorStop(0, "#ffffff");
    glow.addColorStop(0.4, color);
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, size * 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // 中心の光球。溜めるほど大きく、昇格の瞬間に一段膨らむ
  const pulseScale = 1 + 0.1 * Math.sin(p * 42) * charge;
  const orbRadius =
    unit *
    (0.025 + 0.13 * easeOutCubic(charge)) *
    pulseScale *
    (1 + 0.6 * promotion) *
    (1 + 2.6 * easeOutCubic(burst));
  ctx.globalAlpha = Math.min(1, 0.35 + charge) * (1 - burst);
  const orb = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.min(orbRadius, maxRadius));
  orb.addColorStop(0, "#ffffff");
  orb.addColorStop(0.35, color);
  orb.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = orb;
  ctx.beginPath();
  ctx.arc(0, 0, Math.min(orbRadius, maxRadius), 0, Math.PI * 2);
  ctx.fill();

  // 昇格した瞬間に走るリング。色が変わったことを見逃さないための合図。
  // 太くはっきり描くと光ではなく輪郭線に見えてしまうので、細く、素早く消す
  if (promotion > 0.01) {
    drawSoftRing(
      ctx,
      maxRadius * (0.15 + 0.5 * easeOutCubic(1 - promotion)),
      unit * 0.02 * promotion,
      "#ffffff",
      promotion * promotion * (stage.fake ? 0.4 : 0.7),
    );
  }

  ctx.restore();
}
