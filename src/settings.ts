/**
 * 作りかけの設定をブラウザに残すための保存と復元。
 *
 * パーティクルの seed は、同じ値を入れれば同じ配置が再現できる。
 * その seed を含めて設定を残しておかないと、日をまたいだときに
 * 前回と同じカードを作り直せなくなるため、設定一式を保存している。
 */

import type { IntroMode } from "./card/intro.ts";
import type { RarityId } from "./card/rarity.ts";
import type { Orientation } from "./types.ts";

/** 保存対象の設定。アートワークは容量が大きいので含めない。 */
export interface Settings {
  rarityId: RarityId;
  /**
   * カード左上のランク表記の上書き。
   * `null` ならレアリティごとの既定値、空文字ならバッジを出さない。
   */
  badge: string | null;
  title: string;
  subtitle: string;
  /** 尺（秒）。 */
  duration: number;
  fps: number;
  /** カードが出る前の共通演出の出し方。 */
  introMode: IntroMode;
  /** カードの向き。 */
  orientation: Orientation;
  /** {@link SIZE_PRESETS} の ID。 */
  sizeId: string;
  /** {@link QUALITY_PRESETS} の ID。 */
  qualityId: string;
  loop: boolean;
  /** パーティクル配置を決めるシード。 */
  seed: number;
}

const STORAGE_KEY = "card-alert-maker:settings";

/** 何も保存されていないときに使う初期設定。 */
export const DEFAULT_SETTINGS: Settings = {
  rarityId: "gold",
  badge: null,
  title: "",
  subtitle: "",
  duration: 4,
  fps: 30,
  introMode: "on",
  // 配信のアラート枠は横長なことが多いので、既定は寝かせた向きにする
  orientation: "landscape",
  sizeId: "md",
  qualityId: "mid",
  loop: false,
  seed: 1,
};

/**
 * 保存済みの設定を読み出す。壊れていたり読めない場合は既定値を返す。
 *
 * @returns 復元した設定。プライベートウィンドウなどで localStorage が
 * 使えない場合も例外を投げず既定値を返す
 */
export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    // 保存後にキーが増えても壊れないよう、既定値の上に読めた分だけ重ねる
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      // 以前は "none" / "promote" / "fake" を保存していた。
      // 演出の種類は無くなったので、出すか出さないかだけを引き継ぐ
      introMode: parsed.introMode === "off" ? "off" : "on",
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * 設定を保存する。保存できない環境では黙って諦める。
 *
 * @param settings - 保存する設定
 */
export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // 保存できなくてもアプリの動作自体は続けられるので握りつぶす
  }
}

/**
 * 新しいシードを引く。値は UI に表示され、あとから手で入力し直せる。
 *
 * @returns 0 以上 100000 未満の整数
 */
export function drawSeed(): number {
  return Math.floor(Math.random() * 100_000);
}
