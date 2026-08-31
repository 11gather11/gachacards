/**
 * カード1フレーム分の描画。
 *
 * プレビューと WebM 書き出しはどちらもこの {@link renderFrame} だけを呼ぶ。
 * 描画結果が時刻 `time` のみに依存する純粋な関数になっているため、
 * 画面で見えているものと書き出されるものが食い違うことがない。
 */

import type { Particle } from "./particles.ts";
import { particleStateAt } from "./particles.ts";
import type { RarityPreset } from "./rarity.ts";
import {
  clamp,
  easeInCubic,
  easeOutCubic,
  easeOutElastic,
  progress,
  pulse,
  smoothstep,
} from "./math.ts";

/** 通常キャンバスとオフスクリーンキャンバスのどちらの 2D コンテキストも受け付ける。 */
export type Canvas2dContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** 1本の動画を描くのに必要な情報一式。 */
export interface CardScene {
  /** 出力の幅（px）。 */
  width: number;
  /** 出力の高さ（px）。 */
  height: number;
  /** カードに貼るアートワーク。未選択なら `null`。 */
  image: CanvasImageSource | null;
  /** アートワークの元幅（px）。cover 計算に使う。 */
  imageWidth: number;
  /** アートワークの元高さ（px）。 */
  imageHeight: number;
  rarity: RarityPreset;
  /** カード下部に出す名前。空文字なら帯ごと描かない。 */
  title: string;
  /** 名前の下に出す小さい文字。 */
  subtitle: string;
  /** 全体の尺（秒）。 */
  duration: number;
  /** 事前生成済みのパーティクル。 */
  particles: readonly Particle[];
  /** ループ用途で退場フェードを省くなら `true`。 */
  loop: boolean;
}

/** 演出の切り替わり時刻。 */
export interface Timeline {
  /** 登場アニメが終わり、カードが定位置に着く時刻（秒）。 */
  entranceEnd: number;
  /** 退場フェードが始まる時刻（秒）。ループ時は尺と同じ値。 */
  exitStart: number;
}

/** カードの矩形。中心を原点としたローカル座標で扱う。 */
interface CardBox {
  width: number;
  height: number;
  /** 角丸の半径（px）。 */
  radius: number;
}

/**
 * 尺から演出の区切り時刻を求める。
 *
 * @param duration - 全体の尺（秒）
 * @param loop - ループ用途かどうか
 */
export function computeTimeline(duration: number, loop: boolean): Timeline {
  // 登場は尺の 2 割強、ただし長尺でも 0.9 秒を超えると間延びするので頭打ちにする
  const entranceEnd = Math.min(0.9, duration * 0.22);
  const exitStart = loop ? duration : Math.max(entranceEnd + 0.2, duration - 0.55);
  return { entranceEnd, exitStart };
}

/**
 * フレームの高さからカードの寸法を求める。
 *
 * パーティクルの生成にも同じ寸法が要るので、描画側と呼び出し側で
 * 値がズレないよう計算はここだけに置く。
 *
 * @param frameHeight - 出力フレームの高さ（px）
 */
export function computeCardSize(frameHeight: number): { width: number; height: number } {
  // カードは 2:3 に固定。金や虹のグローはカード幅の 3 割ほど外に伸びるので、
  // それを飲み込めるだけの余白がフレーム側に残る大きさにしている
  const height = frameHeight * 0.64;
  return { width: height * (2 / 3), height };
}

/** 出力サイズからカードの矩形を決める。 */
function computeCardBox(scene: CardScene): CardBox {
  const { width, height } = computeCardSize(scene.height);
  return { width, height, radius: width * 0.055 };
}

/** 角丸矩形のパスを、中心原点で引く。 */
function roundedRectPath(ctx: Canvas2dContext, box: CardBox, inset = 0): void {
  const w = box.width - inset * 2;
  const h = box.height - inset * 2;
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, Math.max(0, box.radius - inset * 0.6));
}

/** 登場・退場・浮遊をまとめた、その時刻のカードの姿勢。 */
interface CardTransform {
  scale: number;
  offsetY: number;
  alpha: number;
  /** 着地の瞬間だけ 1 に近づく値。フラッシュや衝撃波の強さに使う。 */
  impact: number;
}

/**
 * 時刻からカードの姿勢を求める。
 * 登場の仕方はレアリティの `entrance` で変わり、激アツほど動きが大きい。
 */
function computeTransform(scene: CardScene, timeline: Timeline, time: number): CardTransform {
  const box = computeCardBox(scene);
  const enter = progress(time, 0, timeline.entranceEnd);
  let scale = 1;
  let offsetY = 0;
  let alpha = 1;

  switch (scene.rarity.entrance) {
    case "fade": {
      const e = easeOutCubic(enter);
      scale = 0.94 + 0.06 * e;
      alpha = e;
      break;
    }
    case "rise": {
      const e = easeOutCubic(enter);
      offsetY = (1 - e) * box.height * 0.35;
      scale = 0.96 + 0.04 * e;
      alpha = smoothstep(enter * 1.6);
      break;
    }
    case "zoom": {
      const e = easeOutCubic(enter);
      scale = 1.55 - 0.55 * e;
      alpha = smoothstep(enter * 2);
      break;
    }
    case "slam": {
      // 大きく前に出た状態から一気に縮み、着地点で数回バウンドさせる
      const e = easeOutElastic(enter);
      scale = 1.6 - 0.6 * e;
      alpha = smoothstep(enter * 3);
      break;
    }
  }

  // 着地後はゆっくり上下に漂わせて、静止画に見えないようにする
  const idle = Math.max(0, time - timeline.entranceEnd);
  offsetY += Math.sin(idle * 1.6) * box.height * 0.008 * smoothstep(idle * 2);

  if (!scene.loop && time > timeline.exitStart) {
    const out = easeInCubic(progress(time, timeline.exitStart, scene.duration));
    alpha *= 1 - out;
    scale *= 1 + out * 0.05;
    offsetY -= out * box.height * 0.04;
  }

  return {
    scale,
    offsetY,
    alpha: clamp(alpha, 0, 1),
    // 着地の前後 0.3 秒だけ立ち上がる山
    impact: pulse(progress(time, timeline.entranceEnd - 0.12, timeline.entranceEnd + 0.3)),
  };
}

/** 震えの量を求める。着地直後が最も激しく、指数的に収まる。 */
function computeShake(scene: CardScene, timeline: Timeline, time: number): [number, number] {
  const amount = scene.rarity.shake;
  if (amount === 0) return [0, 0];
  const since = time - timeline.entranceEnd;
  if (since < -0.1) return [0, 0];
  // 着地からの経過で急速に減衰させる
  const decay = Math.exp(-Math.max(0, since) * 4.5);
  const magnitude = amount * scene.width * decay;
  // 互いに素に近い周波数を重ねて、周期を感じさせない揺れにする
  return [
    (Math.sin(time * 47.3) + Math.sin(time * 91.7) * 0.5) * magnitude,
    (Math.cos(time * 53.1) + Math.cos(time * 83.9) * 0.5) * magnitude,
  ];
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
  if (strength <= 0) return 0;

  // グローは拡大後の座標で滲むので、余白も拡大後のカードの大きさで測る
  const margin = Math.min(
    (scene.width - box.width * scale) / 2,
    (scene.height - box.height * scale) / 2,
  );
  if (margin <= 0) return 0;

  // 余白いっぱいまで使うと端で完全に 0 になりきらないので、少し内側で止める。
  // 得られた上限は拡大後の値なので、ローカル座標に戻してから使う
  const maxBlur = (margin * 0.85) / scale;
  return Math.min(box.width * 0.28 * strength, maxBlur);
}

/** 枠に使うグラデーションを作る。虹だけは時間で回るコニックグラデーションにする。 */
function createFrameStyle(
  ctx: Canvas2dContext,
  scene: CardScene,
  box: CardBox,
  time: number,
): CanvasGradient {
  const { frameColors, rainbowFrame } = scene.rarity;

  if (rainbowFrame) {
    // 1 周 2 秒で回転させると、虹色が枠を流れているように見える
    const gradient = ctx.createConicGradient((time * Math.PI) / 1, 0, 0);
    frameColors.forEach((color, index) => {
      gradient.addColorStop(index / (frameColors.length - 1), color);
    });
    return gradient;
  }

  const gradient = ctx.createLinearGradient(
    -box.width / 2,
    -box.height / 2,
    box.width / 2,
    box.height / 2,
  );
  frameColors.forEach((color, index) => {
    gradient.addColorStop(index / Math.max(1, frameColors.length - 1), color);
  });
  return gradient;
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
    const placeholder = ctx.createLinearGradient(x, y, x, y + height);
    placeholder.addColorStop(0, scene.rarity.backdropColors[0]);
    placeholder.addColorStop(1, scene.rarity.backdropColors[1]);
    ctx.fillStyle = placeholder;
    ctx.fillRect(x, y, width, height);
    return;
  }

  // 短い辺を基準に拡大し、枠内を隙間なく埋めてからはみ出しを切り落とす
  const scale = Math.max(width / scene.imageWidth, height / scene.imageHeight);
  const drawWidth = scene.imageWidth * scale;
  const drawHeight = scene.imageHeight * scale;
  ctx.drawImage(
    scene.image,
    x + (width - drawWidth) / 2,
    y + (height - drawHeight) / 2,
    drawWidth,
    drawHeight,
  );
}

/** カード表面を斜めに走る光沢。着地後に `shineCount` 回だけ通る。 */
function drawShine(
  ctx: Canvas2dContext,
  scene: CardScene,
  box: CardBox,
  timeline: Timeline,
  time: number,
): void {
  const { shineCount } = scene.rarity;
  if (shineCount === 0) return;

  const sweepDuration = 0.55;
  const idleSpan = Math.max(0.6, timeline.exitStart - timeline.entranceEnd);
  // 光沢どうしが重ならないよう、アイドル区間を回数で割った間隔に置く
  const interval = idleSpan / shineCount;

  for (let i = 0; i < shineCount; i++) {
    const start = timeline.entranceEnd + 0.08 + i * interval;
    const t = progress(time, start, start + sweepDuration);
    if (t <= 0 || t >= 1) continue;

    // 帯はカードの外から外へ抜ける。移動量に幅を足して端でも切れないようにする
    const travel = box.width * 2.2;
    const x = -travel / 2 + travel * t;
    const bandWidth = box.width * 0.42;
    const gradient = ctx.createLinearGradient(x - bandWidth, 0, x + bandWidth, 0);
    gradient.addColorStop(0, "rgba(255,255,255,0)");
    gradient.addColorStop(0.5, `rgba(255,255,255,${0.42 * pulse(t)})`);
    gradient.addColorStop(1, "rgba(255,255,255,0)");

    ctx.save();
    // 斜めに傾けた帯にするため、キャンバスごと回して塗る
    ctx.rotate(-0.42);
    ctx.fillStyle = gradient;
    ctx.fillRect(-box.width * 1.5, -box.height * 1.5, box.width * 3, box.height * 3);
    ctx.restore();
  }
}

/** 虹レアリティのカード表面に、うっすらホログラム模様を重ねる。 */
function drawHologram(ctx: Canvas2dContext, box: CardBox, time: number): void {
  const gradient = ctx.createConicGradient(-time * 0.8, 0, 0);
  const colors = ["#ff5f6d", "#ffc371", "#4be7a0", "#4aa8ff", "#b06bff", "#ff5f6d"];
  colors.forEach((color, index) => {
    gradient.addColorStop(index / (colors.length - 1), color);
  });
  ctx.save();
  ctx.globalCompositeOperation = "overlay";
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = gradient;
  ctx.fillRect(-box.width / 2, -box.height / 2, box.width, box.height);
  ctx.restore();
}

/** カード下部の名前帯と、左上のレアリティバッジ。 */
function drawLabels(ctx: Canvas2dContext, scene: CardScene, box: CardBox): void {
  const { title, subtitle, rarity } = scene;

  if (title) {
    const bandHeight = box.height * 0.16;
    const bandTop = box.height / 2 - bandHeight - box.width * 0.045;
    // 文字が読めるよう、帯は下に向かって濃くする
    const band = ctx.createLinearGradient(0, bandTop, 0, bandTop + bandHeight);
    band.addColorStop(0, "rgba(0,0,0,0)");
    band.addColorStop(0.45, "rgba(0,0,0,0.72)");
    band.addColorStop(1, "rgba(0,0,0,0.86)");
    ctx.fillStyle = band;
    ctx.fillRect(-box.width / 2, bandTop, box.width, bandHeight + box.width * 0.05);

    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#ffffff";
    ctx.font = `700 ${box.width * 0.098}px "Hiragino Sans", "Noto Sans JP", system-ui, sans-serif`;
    ctx.fillText(title, 0, bandTop + bandHeight * 0.62, box.width * 0.86);

    if (subtitle) {
      ctx.fillStyle = "rgba(255,255,255,0.72)";
      ctx.font = `500 ${box.width * 0.052}px "Hiragino Sans", "Noto Sans JP", system-ui, sans-serif`;
      ctx.fillText(subtitle, 0, bandTop + bandHeight * 0.95, box.width * 0.8);
    }
  }

  // バッジは左上に置く。文字幅に合わせてピルの幅を決める
  ctx.font = `800 ${box.width * 0.058}px system-ui, sans-serif`;
  const textWidth = ctx.measureText(rarity.badge).width;
  const padding = box.width * 0.04;
  const pillWidth = textWidth + padding * 2;
  const pillHeight = box.width * 0.1;
  const pillX = -box.width / 2 + box.width * 0.055;
  const pillY = -box.height / 2 + box.width * 0.055;

  ctx.beginPath();
  ctx.roundRect(pillX, pillY, pillWidth, pillHeight, pillHeight / 2);
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fill();
  ctx.strokeStyle = rarity.frameColors[0]!;
  ctx.lineWidth = box.width * 0.007;
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = rarity.frameColors[0]!;
  ctx.fillText(rarity.badge, pillX + pillWidth / 2, pillY + pillHeight / 2);
}

/** 着地の瞬間に広がる衝撃波のリング。 */
function drawShockwave(
  ctx: Canvas2dContext,
  scene: CardScene,
  timeline: Timeline,
  time: number,
): void {
  const strength = scene.rarity.flash;
  if (strength < 0.3) return;

  const t = progress(time, timeline.entranceEnd - 0.05, timeline.entranceEnd + 0.45);
  if (t <= 0 || t >= 1) return;

  // フレームの外まで広げると、切れた円弧が四角い縁として残ってしまう。
  // 短辺の半分を上限にして、消えるまでをフレーム内に収める
  const maxRadius = Math.min(scene.width, scene.height) * 0.45;
  const radius = maxRadius * (0.25 + 0.75 * easeOutCubic(t));
  ctx.save();
  ctx.globalAlpha = (1 - t) * strength * 0.8;
  ctx.strokeStyle = scene.rarity.glowColor;
  ctx.lineWidth = scene.width * 0.012 * (1 - t);
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/**
 * 着地時の閃光。全面を白く塗るとアラートとして眩しすぎるので、
 * カード中心からのラジアルグラデーションで周囲だけを光らせる。
 */
function drawFlash(ctx: Canvas2dContext, scene: CardScene, impact: number): void {
  const strength = scene.rarity.flash * impact;
  if (strength <= 0.01) return;

  // 光はフレームの短辺に収める。フレームより広く塗ると、透明に落ちきる前に
  // 端で切られて、配信画面に四角い光の板が乗ってしまう
  const radius = Math.min(scene.width, scene.height) * 0.48;
  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
  gradient.addColorStop(0, `rgba(255,255,255,${0.55 * strength})`);
  gradient.addColorStop(0.45, `rgba(255,255,255,${0.18 * strength})`);
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  // グラデーションが 0 になる範囲だけを塗り、矩形の継ぎ目を作らない
  ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
}

/** パーティクルを1枚ずつ描く。形状ごとに描き分ける。 */
function drawParticles(ctx: Canvas2dContext, scene: CardScene, time: number): void {
  for (const particle of scene.particles) {
    const state = particleStateAt(particle, time);
    if (!state || state.alpha <= 0) continue;

    ctx.save();
    ctx.globalAlpha = clamp(state.alpha, 0, 1);
    ctx.globalCompositeOperation = "lighter";
    ctx.translate(state.x, state.y);
    ctx.rotate(state.rotation);
    ctx.fillStyle = state.color;

    switch (state.shape) {
      case "circle": {
        // 芯を残しつつ外側をぼかして、光の粒に見せる
        const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, state.size * 2);
        glow.addColorStop(0, state.color);
        glow.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(0, 0, state.size * 2, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case "star": {
        // 4 方向に伸びる十字型のきらめき
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
          const angle = (i * Math.PI) / 2;
          const long = state.size * 2.6;
          const short = state.size * 0.5;
          ctx.lineTo(Math.cos(angle) * long, Math.sin(angle) * long);
          ctx.lineTo(Math.cos(angle + Math.PI / 4) * short, Math.sin(angle + Math.PI / 4) * short);
        }
        ctx.closePath();
        ctx.fill();
        break;
      }
      case "shard": {
        // 進行方向に伸びた破片
        ctx.beginPath();
        ctx.ellipse(0, 0, state.size * 2.2, state.size * 0.55, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
    }
    ctx.restore();
  }
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
export function renderFrame(ctx: Canvas2dContext, time: number, scene: CardScene): void {
  const box = computeCardBox(scene);
  const timeline = computeTimeline(scene.duration, scene.loop);
  const transform = computeTransform(scene, timeline, time);
  const [shakeX, shakeY] = computeShake(scene, timeline, time);

  ctx.save();
  // 以降はすべてカード中心を原点とした座標で描く
  ctx.translate(scene.width / 2 + shakeX, scene.height / 2 + transform.offsetY + shakeY);
  ctx.globalAlpha = transform.alpha;

  drawShockwave(ctx, scene, timeline, time);

  ctx.save();
  ctx.scale(transform.scale, transform.scale);

  // グローはカード本体の下に敷く。着地の瞬間だけ一段強くする
  const glowPulse = 0.85 + 0.15 * Math.sin(time * 2.4);
  const glowStrength = scene.rarity.glowStrength * glowPulse + transform.impact * 0.4;
  const glowBlur = computeGlowBlur(scene, box, transform.scale, glowStrength);
  if (glowBlur > 0) {
    ctx.save();
    ctx.shadowColor = scene.rarity.glowColor;
    ctx.shadowBlur = glowBlur;
    ctx.fillStyle = "rgba(0,0,0,0.9)";
    roundedRectPath(ctx, box);
    ctx.fill();
    // 一度の shadow では薄いので、同じ形を重ねて滲みを濃くする
    ctx.fill();
    ctx.restore();
  }

  // カード内部の描画。角丸でクリップして、はみ出しを全部切る
  ctx.save();
  roundedRectPath(ctx, box);
  ctx.clip();

  const inset = box.width * 0.035;
  drawArtwork(
    ctx,
    scene,
    -box.width / 2 + inset,
    -box.height / 2 + inset,
    box.width - inset * 2,
    box.height - inset * 2,
  );

  // 四隅を落として中央のアートを浮かせる
  const vignette = ctx.createRadialGradient(0, 0, box.width * 0.2, 0, 0, box.height * 0.72);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = vignette;
  ctx.fillRect(-box.width / 2, -box.height / 2, box.width, box.height);

  if (scene.rarity.rainbowFrame) {
    drawHologram(ctx, box, time);
  }

  drawShine(ctx, scene, box, timeline, time);
  drawLabels(ctx, scene, box);
  ctx.restore();

  // 枠は 2 重。太い外枠の内側に細いラインを入れて、厚みを感じさせる
  const frameStyle = createFrameStyle(ctx, scene, box, time);
  ctx.strokeStyle = frameStyle;
  ctx.lineWidth = box.width * 0.028;
  roundedRectPath(ctx, box, box.width * 0.014);
  ctx.stroke();

  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = box.width * 0.005;
  roundedRectPath(ctx, box, box.width * 0.045);
  ctx.stroke();

  ctx.restore();

  drawParticles(ctx, scene, time);
  drawFlash(ctx, scene, transform.impact);

  ctx.restore();
}
