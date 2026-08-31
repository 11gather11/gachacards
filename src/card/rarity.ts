/**
 * パチンコの保留玉カラーになぞらえたレアリティ定義。
 * 白 → 青 → 緑 → 赤 → 金 → 虹 の順に「信頼度」が上がり、演出も派手になる。
 */

/** レアリティの識別子。配列順がそのまま信頼度の低い順。 */
export type RarityId = 'white' | 'blue' | 'green' | 'red' | 'gold' | 'rainbow'

/** パーティクルの見た目と挙動のタイプ。 */
export type ParticleKind =
  /** パーティクルを出さない */
  | 'none'
  /** 上に舞い上がる細かい粒 */
  | 'dust'
  /** 弾けて散る火花 */
  | 'spark'
  /** 登場時に一気に弾ける爆発 */
  | 'burst'

/** カードの登場アニメーションのタイプ。 */
export type EntranceKind =
  /** ふわっとフェードイン */
  | 'fade'
  /** 下からせり上がる */
  | 'rise'
  /** 手前に迫ってくる */
  | 'zoom'
  /** 勢いよく叩きつける（激アツ用） */
  | 'slam'

/** 1つのレアリティが持つ、見た目と演出のパラメータ一式。 */
export interface RarityPreset {
  id: RarityId
  /** UI に出す表示名 */
  label: string
  /** カード上に焼き込むランク表記の既定値。UI から上書きできる。 */
  badge: string
  /** 枠のグラデーションに使う色（外→内の順）。 */
  frameColors: readonly string[]
  /** カード背景のベース色（上→下）。 */
  backdropColors: readonly [string, string]
  /** 外側に滲ませるグローの色。 */
  glowColor: string
  /** グローの強さ。0 で無し、1 で最大。 */
  glowStrength: number
  /** 表面を走る光沢スイープの回数。 */
  shineCount: number
  /** カードの震え幅（px 相当、カード幅に対する比率で使う）。 */
  shake: number
  /** 登場時の白フラッシュの強さ。0-1。 */
  flash: number
  /** 枠を虹色に回転させるか（プレミア演出）。 */
  rainbowFrame: boolean
  /** パーティクルの設定。 */
  particle: {
    kind: ParticleKind
    /** 生成する粒の総数。 */
    count: number
    /** 粒に割り当てる色のパレット。 */
    colors: readonly string[]
  }
  entrance: EntranceKind
}

/**
 * 信頼度の低い順に並んだレアリティプリセット。
 * UI のボタン並びと書き出しのデフォルト順はこの配列に従う。
 */
export const RARITY_PRESETS: readonly RarityPreset[] = [
  {
    id: 'white',
    label: '白',
    badge: 'N',
    frameColors: ['#f4f6fb', '#c9d2e0', '#eef2f8'],
    backdropColors: ['#2a3242', '#151a24'],
    glowColor: '#dce5f5',
    glowStrength: 0.25,
    shineCount: 2,
    shake: 0,
    flash: 0.15,
    rainbowFrame: false,
    particle: { kind: 'dust', count: 18, colors: ['#eef2f8', '#ffffff'] },
    entrance: 'fade',
  },
  {
    id: 'blue',
    label: '青',
    badge: 'R',
    frameColors: ['#8fd4ff', '#2f7fe0', '#bfe6ff'],
    backdropColors: ['#16304d', '#0a1526'],
    glowColor: '#4aa8ff',
    glowStrength: 0.45,
    shineCount: 2,
    shake: 0,
    flash: 0.25,
    rainbowFrame: false,
    particle: { kind: 'dust', count: 44, colors: ['#9fd8ff', '#ffffff'] },
    entrance: 'rise',
  },
  {
    id: 'green',
    label: '緑',
    badge: 'SR',
    frameColors: ['#a9f5b9', '#22a95a', '#d6ffe2'],
    backdropColors: ['#123322', '#071a10'],
    glowColor: '#3ddc7f',
    glowStrength: 0.6,
    shineCount: 3,
    shake: 0.005,
    flash: 0.35,
    rainbowFrame: false,
    particle: { kind: 'dust', count: 76, colors: ['#8cf3ac', '#e9fff1', '#3ddc7f'] },
    entrance: 'rise',
  },
  {
    id: 'red',
    label: '赤',
    badge: 'SSR',
    frameColors: ['#ffb3a7', '#d92d20', '#ffd9d2'],
    backdropColors: ['#3d1210', '#1a0605'],
    glowColor: '#ff4d3d',
    glowStrength: 0.8,
    shineCount: 3,
    shake: 0.009,
    flash: 0.7,
    rainbowFrame: false,
    particle: { kind: 'spark', count: 120, colors: ['#ff6a4d', '#ffb98a', '#fff0e0'] },
    entrance: 'zoom',
  },
  {
    id: 'gold',
    label: '金',
    badge: 'UR',
    frameColors: ['#fff3c4', '#e0a021', '#fffbe8'],
    backdropColors: ['#3d2f0c', '#1a1305'],
    glowColor: '#ffd24d',
    glowStrength: 0.95,
    shineCount: 4,
    shake: 0.013,
    flash: 0.9,
    rainbowFrame: false,
    particle: { kind: 'spark', count: 170, colors: ['#ffd24d', '#fff2b8', '#ffffff'] },
    entrance: 'slam',
  },
  {
    id: 'rainbow',
    label: '虹',
    badge: 'LR',
    frameColors: ['#ff5f6d', '#ffc371', '#4be7a0', '#4aa8ff', '#b06bff', '#ff5f6d'],
    backdropColors: ['#2b1245', '#0a0616'],
    glowColor: '#ffffff',
    glowStrength: 1,
    shineCount: 4,
    shake: 0.016,
    flash: 1,
    rainbowFrame: true,
    particle: {
      kind: 'burst',
      count: 240,
      colors: ['#ff5f6d', '#ffc371', '#4be7a0', '#4aa8ff', '#b06bff', '#ffffff'],
    },
    entrance: 'slam',
  },
] as const

/**
 * 識別子からプリセットを引く。未知の ID の場合は白にフォールバックする。
 *
 * @param id - レアリティ識別子
 * @returns 対応する {@link RarityPreset}
 */
export function getRarity(id: RarityId): RarityPreset {
  return RARITY_PRESETS.find((preset) => preset.id === id) ?? RARITY_PRESETS[0]!
}
