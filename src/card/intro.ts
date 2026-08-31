/**
 * カードが出る前の共通演出。
 *
 * 光が中心に集まり、膨らんで、弾けた瞬間にカードが出る。ここまではどのレアリティでも
 * 同じ動きで、違うのは「光の色」だけ。
 *
 * 光は必ず白から始まり、そこから本来のレアリティまで保留カラーを 1 段ずつ上がっていく。
 * パチンコの保留変化と同じ「色が変わった瞬間にアツくなる」を、段数のぶんだけ繰り返す。
 * 上位のレアリティほど通る段数が多く、そのぶん演出も長くなる。
 */

import { createRng, easeOutCubic, progress, pulse, randomBetween } from "./math.ts";
import type { RarityPreset } from "./rarity.ts";
import { RARITY_PRESETS } from "./rarity.ts";
import type { Canvas2dContext } from "./render.ts";

/** UI から選ぶ入り演出の設定。`"off"` なら演出そのものを出さない。 */
export type IntroMode = "off" | "on";

/** 白から目的の色まで、どう刻んで上がるか。 */
export type PromotionStep =
  /** 保留カラーを 1 段ずつすべて通る */
  | "all"
  /** 途中の色をひとつだけ挟んで飛ばす */
  | "skip"
  /** 白から目的の色へ一撃で飛ぶ */
  | "jump";

/** 光の色が切り替わる 1 段階。 */
export interface IntroStage {
  /** 入り演出を 0-1 に正規化した時刻。この時刻からこの色になる。 */
  at: number;
  rarity: RarityPreset;
}

/** 中心へ吸い込まれていく光の粒。位置は時刻から直接求める。 */
export interface IntroParticle {
  /** 出現する方角（ラジアン）。 */
  angle: number;
  /** 出現時の中心からの距離。フレーム短辺に対する比率。 */
  startRadius: number;
  /**
   * 出現時刻。入り演出の長さに対する比率（0-1）で持つ。
   * 演出が長いレアリティでは、そのぶん粒が長く湧き続ける。
   */
  delay: number;
  /**
   * 中心に届くまでの秒数。
   * 比率ではなく実時間で持つことで、演出の長さが変わっても吸い込む速さは変わらない。
   */
  travelSeconds: number;
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
 * 白から目的のレアリティまで、何段上がるかを返す。白なら 0。
 */
function countPromotions(target: RarityPreset): number {
  return Math.max(
    0,
    RARITY_PRESETS.findIndex((preset) => preset.id === target.id),
  );
}

/**
 * 入り演出の長さ（秒）。
 *
 * レアリティによらず一定にしている。段数に比例させると下位レアリティの前振りが
 * 一瞬で終わってしまい、演出として物足りなくなるため。上位らしさは
 * 「同じ時間の中で何段上がるか」と「光の強さ」で出す。
 */
const INTRO_SECONDS = 1.8;

/**
 * 入り演出の長さを決める。
 *
 * @param duration - 全体の尺（秒）
 * @param enabled - 入り演出を出すかどうか
 * @returns 入り演出の長さ（秒）。無効なら 0
 *
 * @example
 * computeIntroDuration(8, true); // => 1.8
 * computeIntroDuration(2, true); // => 0.9（尺が短いので詰められる）
 */
export function computeIntroDuration(duration: number, enabled: boolean): number {
  if (!enabled) return 0;
  // 尺の半分近くを前振りに使うとカードを見せる時間が残らないので頭打ちにする
  return Math.min(INTRO_SECONDS, duration * 0.45);
}

/**
 * 色の段取りを組み立てる。
 *
 * 光は必ず白から始まり、目的の色に着地する。途中をどう刻むかは `step` で決まる。
 * 乱数を使わないので、同じ組み合わせなら毎回同じ段取りになる。
 *
 * @param target - 最終的に落ち着くレアリティ
 * @param step - 白から目的の色までの刻み方
 * @returns `at` の昇順に並んだ段階の配列。先頭は必ず白（`at` は 0）
 *
 * @example
 * buildIntroStages(getRarity("rainbow"), "all");  // 白 → 青 → 緑 → 赤 → 金 → 虹
 * buildIntroStages(getRarity("rainbow"), "skip"); // 白 → 緑 → 虹
 * buildIntroStages(getRarity("rainbow"), "jump"); // 白 → 虹
 */
export function buildIntroStages(target: RarityPreset, step: PromotionStep): IntroStage[] {
  const targetIndex = countPromotions(target);
  if (targetIndex === 0) return [{ at: 0, rarity: target }];

  // 通る色を決める。先頭は必ず白、末尾は必ず目的の色
  const path = [0];
  if (step === "all") {
    for (let i = 1; i <= targetIndex; i++) path.push(i);
  } else {
    // 間引きは中間の色をひとつだけ挟む。青のように 1 段しかない場合は
    // 挟める色がないので、結果的に一撃と同じ道のりになる
    const middle = step === "skip" ? Math.floor(targetIndex / 2) : 0;
    if (middle > 0) path.push(middle);
    path.push(targetIndex);
  }

  const hops = path.length - 1;
  return path.map((rarityIndex, i) => ({
    // 白をひと呼吸見せてから上げ始め、最後の色は弾ける前に必ず出しておく。
    // 刻み方が変わっても着地の時刻は動かないので、溜めの長さが一定になる
    at: i === 0 ? 0 : 0.2 + (0.55 * i) / hops,
    rarity: RARITY_PRESETS[rarityIndex]!,
  }));
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
      travelSeconds: randomBetween(rng, 0.35, 0.7),
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

/** 昇格の合図を見せる長さ（秒）。演出の長さによらず一定にする。 */
const PROMOTION_FLASH_SECONDS = 0.18;

/**
 * 直前の色替わりからどれだけ経ったかを 0-1 で返す。1 なら十分時間が経っている。
 *
 * 比率ではなく秒で測る。正規化時間で測ると、演出が長いレアリティほど
 * 合図の光がゆっくり間延びしてしまうため。
 */
function sinceStageChange(
  stages: readonly IntroStage[],
  time: number,
  introDuration: number,
): number {
  let last = 0;
  for (const stage of stages) {
    if (time >= stage.at * introDuration) last = stage.at;
  }
  if (last === 0) return 1;

  const changedAt = last * introDuration;
  return progress(time, changedAt, changedAt + PROMOTION_FLASH_SECONDS);
}

/** 入り演出の描画に必要なフレームの寸法。 */
interface IntroFrame {
  width: number;
  height: number;
}

/**
 * その段階で使う光の色を返す。
 *
 * 虹だけは単色で表せないうえ、`glowColor` が白なので、そのまま使うと
 * 始点の白と見分けがつかない。虹の間だけ枠色を素早く巡回させて虹らしく光らせる。
 *
 * @param stage - 現在の段階
 * @param p - 入り演出内の正規化時刻（0-1）
 * @returns 光の主色と、放射光に使う濃いめの色
 */
function stageColors(stage: IntroStage, p: number): { color: string; accent: string } {
  const { rarity } = stage;
  if (!rarity.rainbowFrame) {
    return { color: rarity.glowColor, accent: rarity.frameColors[1] ?? rarity.glowColor };
  }

  const colors = rarity.frameColors;
  const index = Math.floor(p * 40) % colors.length;
  return { color: colors[index]!, accent: colors[(index + 2) % colors.length]! };
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
  const { color, accent } = stageColors(stage, p);
  const unit = Math.min(frame.width, frame.height);
  // ここを超えるとフレーム端で光が切られる
  const maxRadius = unit * 0.46;

  // 溜めと弾けを分ける。弾けはカードの登場に重なる。
  // 弾ける速さは演出の長さによらず一定にしたいので、秒で切り出す
  const burstSeconds = Math.min(0.22, introDuration * 0.35);
  const burstStart = introDuration - burstSeconds;
  // 光の立ち上がりも実時間で決める。演出全体の進行に紐づけると、
  // 尺の長い上位レアリティほど光り始めがゆっくりになってしまう
  const grow = progress(time, 0, Math.min(0.5, burstStart));
  // 段が上がるごとに一段強く光る。上位らしさは「長さ」と「強さ」で出し、
  // 動きの速さはどのレアリティでも変えない
  const stageBoost = 1 + Math.max(0, intro.stages.indexOf(stage)) * 0.12;
  const burst = progress(time, burstStart, introDuration);
  // 色が変わった直後だけ 1 に近づく。昇格の見せ場に使う
  const promotion = 1 - sinceStageChange(intro.stages, time, introDuration);

  ctx.save();
  ctx.translate(frame.width / 2, frame.height / 2);
  // 光の重なりを素直に足し合わせる
  ctx.globalCompositeOperation = "lighter";

  // 回転する放射光。溜めが進むほど長く伸びる
  const rayCount = 12;
  const rayLength = maxRadius * (0.25 + 0.75 * easeOutCubic(grow));
  ctx.save();
  // 角速度は秒あたりで決める。正規化時刻で回すと長い演出ほど回転が鈍くなる
  ctx.rotate(time * 1.6);
  ctx.globalAlpha = 0.32 * grow * (1 - burst);
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

  // 外から中心へ繰り返し縮んでいくリング。
  // 収束の周期も秒で決める。演出が長いレアリティでも吸い込む速さは変わらない
  for (let i = 0; i < 3; i++) {
    const t = (time * 1.35 + i / 3) % 1;
    drawSoftRing(
      ctx,
      maxRadius * (1 - easeOutCubic(t)),
      unit * 0.022 * (1 - t * 0.5),
      color,
      pulse(t) * 0.45 * grow * (1 - burst),
    );
  }

  // 吸い込まれる粒。湧く間隔は演出の長さに合わせ、吸い込む速さは秒で固定する
  for (const particle of intro.particles) {
    const bornAt = particle.delay * introDuration;
    const q = progress(time, bornAt, bornAt + particle.travelSeconds);
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
  const pulseScale = 1 + 0.1 * Math.sin(time * 26) * grow;
  const orbRadius =
    unit *
    (0.025 + 0.13 * easeOutCubic(grow)) *
    stageBoost *
    pulseScale *
    (1 + 0.6 * promotion) *
    (1 + 2.6 * easeOutCubic(burst));
  ctx.globalAlpha = Math.min(1, 0.35 + grow) * (1 - burst);
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
      promotion * promotion * 0.7,
    );
  }

  ctx.restore();
}
