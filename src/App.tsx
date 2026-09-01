import * as stylex from '@stylexjs/stylex'
import { useEffect, useMemo, useRef, useState } from 'react'

import type { IntroMode } from './card/intro.ts'
import {
  buildIntroStages,
  computeIntroDuration,
  createIntroParticles,
  listIntermediateRarities,
} from './card/intro.ts'
import { createParticles } from './card/particles.ts'
import type { RarityId } from './card/rarity.ts'
import { getRarity } from './card/rarity.ts'
import type { CardScene } from './card/scene.ts'
import { computeCardSize, computeTimeline } from './card/scene.ts'
import { ImageDropZone } from './components/ImageDropZone.tsx'
import { PreviewCanvas } from './components/PreviewCanvas.tsx'
import { RarityPicker } from './components/RarityPicker.tsx'
import { toErrorMessage } from './errors.ts'
import { canExportTransparentWebm, exportWebm } from './export/webm.ts'
import { DEFAULT_SETTINGS, drawSeed, loadSettings, saveSettings } from './settings.ts'
import { colors } from './theme.stylex.ts'
import type { Artwork, Orientation } from './types.ts'
import { QUALITY_PRESETS, SIZE_PRESETS, isOrientation, resolveFrameSize } from './types.ts'
import { ui } from './ui.ts'

/**
 * 透過を確かめるための市松模様。
 *
 * stylex.create の中身はビルド時に静的解析されるので、関数を呼んで組み立てられない
 * （`Unsupported expression` で弾かれる）。タイルの大きさ違いで 2 回書いているのは
 * そのため。
 */
const CHECKER_IMAGE = [
  'linear-gradient(45deg, #1d2432 25%, transparent 25%)',
  'linear-gradient(-45deg, #1d2432 25%, transparent 25%)',
  'linear-gradient(45deg, transparent 75%, #1d2432 75%)',
  'linear-gradient(-45deg, transparent 75%, #1d2432 75%)',
].join(', ')

const styles = stylex.create({
  app: {
    display: 'grid',
    gridTemplateColumns: { default: '340px 1fr', '@media (max-width: 900px)': '1fr' },
    minHeight: '100vh',
    // 画面の高さで頭打ちにして、書き出し結果が増えたぶんはプレビューを縮めて吸収する。
    // ここが伸びると、結果が出た瞬間にページ全体がスクロールしてカードが見切れる。
    // 縦に積む狭い画面では、逆に潰れてしまうので外す
    height: { default: '100vh', '@media (max-width: 900px)': 'auto' },
  },
  panel: {
    display: 'flex',
    flexDirection: 'column',
    gap: 18,
    padding: 20,
    backgroundColor: colors.panel,
    borderRightWidth: 1,
    borderRightStyle: 'solid',
    borderRightColor: colors.line,
    overflowY: 'auto',
    maxHeight: { default: '100vh', '@media (max-width: 900px)': 'none' },
  },
  title: {
    margin: 0,
    fontSize: 18,
    letterSpacing: '0.02em',
  },
  subtitle: {
    margin: '4px 0 0',
    color: colors.textDim,
    fontSize: 12,
  },
  stage: {
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    padding: 20,
    minWidth: 0,
    // flex の子は既定で内容より小さくならない。0 を許してプレビューを縮められるようにする
    minHeight: 0,
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  chip: {
    padding: '5px 12px',
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: colors.line,
    borderRadius: 999,
    color: colors.textDim,
    font: 'inherit',
    fontSize: 12,
    cursor: 'pointer',
  },
  chipActive: {
    borderColor: colors.accent,
    color: colors.text,
  },
  view: {
    display: 'grid',
    placeItems: 'center',
    flex: 1,
    minHeight: 0,
    padding: 16,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: colors.line,
    borderRadius: 12,
    overflow: 'hidden',
  },
  viewChecker: {
    backgroundColor: '#2a3242',
    backgroundImage: CHECKER_IMAGE,
    backgroundSize: '24px 24px',
    backgroundPosition: '0 0, 0 12px, 12px -12px, -12px 0',
  },
  viewDark: { backgroundColor: '#05070b' },
  viewLight: { backgroundColor: '#e9eef7' },
  viewStream: {
    backgroundImage: [
      'radial-gradient(circle at 30% 20%, #2f4d7a, transparent 60%)',
      'radial-gradient(circle at 70% 80%, #6b2f5e, transparent 55%)',
      'linear-gradient(160deg, #101828, #1d2a3f)',
    ].join(', '),
  },
  via: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
  },
  viaCheckbox: {
    gap: 5,
    color: colors.text,
  },
  result: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  resultHead: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  resultVideo: {
    maxHeight: '22vh',
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: colors.line,
    borderRadius: 10,
    backgroundColor: '#2a3242',
    backgroundImage: CHECKER_IMAGE,
    backgroundSize: '16px 16px',
    backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0',
  },
})

/** プレビュー背景の値から、対応するスタイルを引く。 */
const VIEW_STYLES = {
  checker: styles.viewChecker,
  dark: styles.viewDark,
  light: styles.viewLight,
  stream: styles.viewStream,
} as const

/** プレビューの下に敷く背景。透過の確認用に切り替える。 */
type PreviewBackground = 'checker' | 'dark' | 'light' | 'stream'

/** 書き出し済みのファイル。保存を押すまではメモリ上に置いておく。 */
interface ExportedFile {
  blob: Blob
  /** プレビュー再生用のオブジェクト URL。 */
  url: string
  fileName: string
  /** サイズやフレーム数をまとめた表示用の文字列。 */
  summary: string
}

const FPS_OPTIONS = [24, 30, 60] as const

/**
 * モーションブラーの強さ。サンプル数がそのまま描画回数の倍率になるので、
 * 上げるほど書き出しに時間がかかる。
 */
const MOTION_BLUR_OPTIONS = [
  { samples: 1, label: 'なし' },
  { samples: 2, label: '弱 (2x)' },
  { samples: 4, label: '中 (4x)' },
  { samples: 8, label: '強 (8x)' },
] as const

/** 前回の設定。アプリ起動時に一度だけ読む。 */
const INITIAL = loadSettings()

/** Blob をファイルとして保存させる。 */
function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  // クリック直後に revoke すると保存が始まらない環境があるため、一拍置いてから解放する
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export function App() {
  const [artwork, setArtwork] = useState<Artwork | null>(null)
  const [rarityId, setRarityId] = useState<RarityId>(INITIAL.rarityId)
  const [badge, setBadge] = useState<string | null>(INITIAL.badge)
  const [title, setTitle] = useState(INITIAL.title)
  const [subtitle, setSubtitle] = useState(INITIAL.subtitle)
  const [duration, setDuration] = useState(INITIAL.duration)
  const [fps, setFps] = useState<number>(INITIAL.fps)
  const [introMode, setIntroMode] = useState<IntroMode>(INITIAL.introMode)
  const [introSeconds, setIntroSeconds] = useState(INITIAL.introSeconds)
  const [motionBlur, setMotionBlur] = useState(INITIAL.motionBlur)
  const [via, setVia] = useState<RarityId[]>(INITIAL.via)
  const [orientation, setOrientation] = useState<Orientation>(INITIAL.orientation)
  const [sizeId, setSizeId] = useState(INITIAL.sizeId)
  const [qualityId, setQualityId] = useState(INITIAL.qualityId)
  const [loop, setLoop] = useState(INITIAL.loop)
  const [seed, setSeed] = useState(INITIAL.seed)
  const [background, setBackground] = useState<PreviewBackground>('checker')
  const [resetArmed, setResetArmed] = useState(false)

  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ExportedFile | null>(null)
  const [isSupported, setIsSupported] = useState<boolean | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    void canExportTransparentWebm().then(setIsSupported)
  }, [])

  // 別の日に同じカードを作り直せるよう、seed を含めた設定を残しておく
  useEffect(() => {
    saveSettings({
      rarityId,
      badge,
      title,
      subtitle,
      duration,
      fps,
      introMode,
      introSeconds,
      motionBlur,
      via,
      orientation,
      sizeId,
      qualityId,
      loop,
      seed,
    })
  }, [
    rarityId,
    badge,
    title,
    subtitle,
    duration,
    fps,
    introMode,
    introSeconds,
    motionBlur,
    via,
    orientation,
    sizeId,
    qualityId,
    loop,
    seed,
  ])

  // 「もう一度押すと戻る」状態を置きっぱなしにしない。
  // 次に開いたときに構えたままだと、1 押しで消えたように見えてしまう
  useEffect(() => {
    const timer = resetArmed ? setTimeout(() => setResetArmed(false), 4000) : null
    return () => {
      if (timer !== null) clearTimeout(timer)
    }
  }, [resetArmed])

  // 書き出し結果の URL は差し替えのたびに解放する
  useEffect(() => {
    const url = result?.url
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [result])

  const sizePreset = SIZE_PRESETS.find((preset) => preset.id === sizeId) ?? SIZE_PRESETS[1]!
  // 毎レンダリングで新しい物体になると scene の再計算が止まらないので、ここで固定する
  const size = useMemo(() => resolveFrameSize(sizePreset, orientation), [sizePreset, orientation])
  const quality = QUALITY_PRESETS.find((preset) => preset.id === qualityId) ?? QUALITY_PRESETS[1]!
  const rarity = getRarity(rarityId)
  // null は「上書きしていない」の意味なので、レアリティ側の既定値に落とす
  const effectiveBadge = badge ?? rarity.badge
  // 長さはレアリティによらず一定。変わるのは同じ時間に何段上がるか
  const introDuration = computeIntroDuration(introSeconds, duration, introMode === 'on')
  // 尺を伸ばすとファイルがどれだけ膨らむかを、書き出す前に見せる
  const estimatedSizeMb = (quality.bitrate * duration) / 8 / 1024 / 1024
  // 段取りは表示にも使うので、シーンと同じものをここで組み立てて共有する
  const introStages = useMemo(() => buildIntroStages(rarity, via), [rarity, via])
  // 白と目的の色は必ず通るので、選べるのはその間の色だけ
  const intermediates = listIntermediateRarities(rarity)

  const scene = useMemo<CardScene>(() => {
    const card = computeCardSize(size.width, size.height)
    const timeline = computeTimeline(duration, loop, introDuration)
    const intro =
      introMode === 'off'
        ? null
        : {
            stages: introStages,
            particles: createIntroParticles(130, seed),
          }
    const particles = createParticles(
      rarity,
      {
        cardWidth: card.width,
        cardHeight: card.height,
        duration,
        // 粒はカードが着地してから出す。登場前から舞っていると演出の順番が崩れる
        startAt: timeline.entranceEnd,
      },
      seed,
    )

    return {
      width: size.width,
      height: size.height,
      image: artwork?.bitmap ?? null,
      imageWidth: artwork?.width ?? 0,
      imageHeight: artwork?.height ?? 0,
      rarity,
      badge: effectiveBadge,
      title,
      subtitle,
      duration,
      particles,
      intro,
      introDuration,
      loop,
    }
  }, [
    size,
    rarity,
    effectiveBadge,
    artwork,
    title,
    subtitle,
    duration,
    introMode,
    introDuration,
    introStages,
    loop,
    seed,
  ])

  const handleExport = async () => {
    setError(null)
    setProgress(0)
    const controller = new AbortController()
    abortRef.current = controller

    try {
      const exported = await exportWebm({
        scene,
        fps,
        bitrate: quality.bitrate,
        motionBlurSamples: motionBlur,
        signal: controller.signal,
        onProgress: setProgress,
      })

      // 自動で保存はしない。何本も試して気に入ったものだけ残せるようにする
      setResult({
        blob: exported.blob,
        url: URL.createObjectURL(exported.blob),
        // 出来上がったファイルから seed を辿れるよう、名前に焼き込む
        fileName: `${artwork?.fileName ?? 'card'}-${rarityId}-s${seed}.webm`,
        summary: `${(exported.blob.size / 1024 / 1024).toFixed(2)} MB / ${exported.frameCount} フレーム / ${(exported.elapsedMs / 1000).toFixed(1)} 秒`,
      })
    } catch (caught) {
      setError(toErrorMessage(caught))
    } finally {
      setProgress(null)
      abortRef.current = null
    }
  }

  const isExporting = progress !== null

  /**
   * 設定一式を既定値へ戻す。アートワークは設定ではないので残す。
   *
   * 押し間違いでカード名や seed を失うと戻せないため、2 回押させる。
   * ブラウザの confirm はプレビューの再生を止めてしまうので使わない。
   */
  const handleReset = () => {
    if (!resetArmed) {
      setResetArmed(true)
      return
    }
    setResetArmed(false)
    setRarityId(DEFAULT_SETTINGS.rarityId)
    setBadge(DEFAULT_SETTINGS.badge)
    setTitle(DEFAULT_SETTINGS.title)
    setSubtitle(DEFAULT_SETTINGS.subtitle)
    setDuration(DEFAULT_SETTINGS.duration)
    setFps(DEFAULT_SETTINGS.fps)
    setIntroMode(DEFAULT_SETTINGS.introMode)
    setIntroSeconds(DEFAULT_SETTINGS.introSeconds)
    setMotionBlur(DEFAULT_SETTINGS.motionBlur)
    // 既定値の配列をそのまま渡すと、あとでチェックを外したときに既定値ごと変わる
    setVia([...DEFAULT_SETTINGS.via])
    setOrientation(DEFAULT_SETTINGS.orientation)
    setSizeId(DEFAULT_SETTINGS.sizeId)
    setQualityId(DEFAULT_SETTINGS.qualityId)
    setLoop(DEFAULT_SETTINGS.loop)
    setSeed(DEFAULT_SETTINGS.seed)
  }

  return (
    <div {...stylex.props(styles.app)}>
      <aside {...stylex.props(styles.panel)}>
        <header>
          <h1 {...stylex.props(styles.title)}>Card Alert Maker</h1>
          <p {...stylex.props(styles.subtitle)}>画像から、透過 WebM のカード演出を作る</p>
        </header>

        <section {...stylex.props(ui.field)}>
          <span {...stylex.props(ui.label)}>アートワーク</span>
          <ImageDropZone artwork={artwork} onSelect={setArtwork} onError={setError} />
        </section>

        <section {...stylex.props(ui.field)}>
          <span {...stylex.props(ui.label)}>レアリティ（保留カラー）</span>
          <RarityPicker value={rarityId} onChange={setRarityId} />
        </section>

        <section {...stylex.props(ui.field)}>
          <label {...stylex.props(ui.label)} htmlFor="badge">
            ランク表記（空ならバッジを出さない）
          </label>
          <div {...stylex.props(ui.inputRow)}>
            <input
              id="badge"
              type="text"
              {...stylex.props(ui.input)}
              value={effectiveBadge}
              maxLength={12}
              onChange={(event) => setBadge(event.target.value)}
            />
            <button
              type="button"
              {...stylex.props(ui.button)}
              title="レアリティごとの既定値に戻す"
              disabled={badge === null}
              onClick={() => setBadge(null)}
            >
              ↺
            </button>
          </div>
        </section>

        <section {...stylex.props(ui.field)}>
          <label {...stylex.props(ui.label)} htmlFor="title">
            カード名（空なら帯を出さない）
          </label>
          <input
            id="title"
            type="text"
            {...stylex.props(ui.input)}
            value={title}
            placeholder="例: 伝説のドラゴン"
            onChange={(event) => setTitle(event.target.value)}
          />
          <input
            type="text"
            {...stylex.props(ui.input)}
            value={subtitle}
            placeholder="サブテキスト（任意）"
            onChange={(event) => setSubtitle(event.target.value)}
          />
        </section>

        <section {...stylex.props(ui.field)}>
          <label {...stylex.props(ui.label)} htmlFor="duration">
            尺: {duration.toFixed(1)} 秒（推定 {estimatedSizeMb.toFixed(1)} MB）
          </label>
          <input
            id="duration"
            type="range"
            min={2}
            max={30}
            step={0.5}
            value={duration}
            onChange={(event) => setDuration(Number(event.target.value))}
          />
        </section>

        <section {...stylex.props(ui.field)}>
          <label {...stylex.props(ui.checkbox)}>
            <input
              type="checkbox"
              checked={introMode === 'on'}
              onChange={(event) => setIntroMode(event.target.checked ? 'on' : 'off')}
            />
            入りの演出（光が集まって弾ける）
          </label>
          {introMode === 'on' && (
            <>
              <label {...stylex.props(ui.label)} htmlFor="introSeconds">
                入りの長さ: {introSeconds.toFixed(1)} 秒
                {introDuration < introSeconds - 0.05 &&
                  `（尺に収まらないので ${introDuration.toFixed(1)} 秒に短縮）`}
              </label>
              <input
                id="introSeconds"
                type="range"
                min={0.5}
                max={8}
                step={0.1}
                value={introSeconds}
                onChange={(event) => setIntroSeconds(Number(event.target.value))}
              />
              {intermediates.length > 0 && (
                <>
                  <span {...stylex.props(ui.label)}>途中で通す色（外すと飛ばす）</span>
                  <div {...stylex.props(styles.via)}>
                    {intermediates.map((preset) => (
                      <label key={preset.id} {...stylex.props(ui.checkbox, styles.viaCheckbox)}>
                        <input
                          type="checkbox"
                          checked={via.includes(preset.id)}
                          onChange={(event) =>
                            setVia((current) =>
                              event.target.checked
                                ? [...current, preset.id]
                                : current.filter((id) => id !== preset.id),
                            )
                          }
                        />
                        {preset.label}
                      </label>
                    ))}
                    <button
                      type="button"
                      {...stylex.props(ui.button, ui.buttonSlim)}
                      onClick={() => setVia(intermediates.map((preset) => preset.id))}
                    >
                      全部
                    </button>
                    <button
                      type="button"
                      {...stylex.props(ui.button, ui.buttonSlim)}
                      onClick={() => setVia([])}
                    >
                      一気に
                    </button>
                  </div>
                </>
              )}
              <p {...stylex.props(ui.notice)}>
                {introStages.map((stage) => stage.rarity.label).join(' → ')}
                {' / '}
                {introDuration.toFixed(2)} 秒
              </p>
            </>
          )}
        </section>

        <section {...stylex.props(ui.field, ui.fieldRow)}>
          <label {...stylex.props(ui.fieldSub)}>
            <span {...stylex.props(ui.label)}>向き</span>
            <select
              {...stylex.props(ui.input)}
              value={orientation}
              onChange={(event) => {
                if (isOrientation(event.target.value)) setOrientation(event.target.value)
              }}
            >
              <option value="landscape">横長</option>
              <option value="portrait">縦長</option>
            </select>
          </label>
          <label {...stylex.props(ui.fieldSub)}>
            <span {...stylex.props(ui.label)}>サイズ</span>
            <select
              {...stylex.props(ui.input)}
              value={sizeId}
              onChange={(event) => setSizeId(event.target.value)}
            >
              {SIZE_PRESETS.map((preset) => {
                const frame = resolveFrameSize(preset, orientation)
                return (
                  <option key={preset.id} value={preset.id}>
                    {preset.label} ({frame.width}×{frame.height})
                  </option>
                )
              })}
            </select>
          </label>
        </section>

        <section {...stylex.props(ui.field, ui.fieldRow)}>
          <label {...stylex.props(ui.fieldSub)}>
            <span {...stylex.props(ui.label)}>fps</span>
            <select
              {...stylex.props(ui.input)}
              value={fps}
              onChange={(event) => setFps(Number(event.target.value))}
            >
              {FPS_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label {...stylex.props(ui.fieldSub)}>
            <span {...stylex.props(ui.label)}>ブラー</span>
            <select
              {...stylex.props(ui.input)}
              value={motionBlur}
              onChange={(event) => setMotionBlur(Number(event.target.value))}
            >
              {MOTION_BLUR_OPTIONS.map((option) => (
                <option key={option.samples} value={option.samples}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label {...stylex.props(ui.fieldSub)}>
            <span {...stylex.props(ui.label)}>画質</span>
            <select
              {...stylex.props(ui.input)}
              value={qualityId}
              onChange={(event) => setQualityId(event.target.value)}
            >
              {QUALITY_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>
          </label>
        </section>

        <section {...stylex.props(ui.field, ui.fieldRow)}>
          <label {...stylex.props(ui.fieldSub)}>
            <span {...stylex.props(ui.label)}>パーティクルの種</span>
            <div {...stylex.props(ui.inputRow)}>
              <input
                type="number"
                {...stylex.props(ui.input)}
                value={seed}
                min={0}
                step={1}
                onChange={(event) =>
                  setSeed(Math.max(0, Math.floor(Number(event.target.value) || 0)))
                }
              />
              <button
                type="button"
                {...stylex.props(ui.button)}
                title="別の配置を引き直す"
                onClick={() => setSeed(drawSeed())}
              >
                🎲
              </button>
            </div>
          </label>
        </section>

        <section {...stylex.props(ui.field)}>
          <label {...stylex.props(ui.checkbox)}>
            <input
              type="checkbox"
              checked={loop}
              onChange={(event) => setLoop(event.target.checked)}
            />
            ループ用（最後のフェードアウトを省く）
          </label>
        </section>

        <section {...stylex.props(ui.field)}>
          <button
            type="button"
            {...stylex.props(ui.button, ui.buttonPrimary)}
            onClick={() => void handleExport()}
            disabled={isExporting || isSupported === false}
          >
            {isExporting
              ? `書き出し中 ${Math.round((progress ?? 0) * 100)}%`
              : '透過 WebM を書き出す'}
          </button>
          {isExporting && (
            <button
              type="button"
              {...stylex.props(ui.button)}
              onClick={() => abortRef.current?.abort()}
            >
              中断
            </button>
          )}
          {isSupported === false && (
            <p {...stylex.props(ui.notice, ui.noticeError)}>
              このブラウザは VP9 エンコードに対応していません。Chrome か Edge で開いてください。
            </p>
          )}
          {error && <p {...stylex.props(ui.notice, ui.noticeError)}>{error}</p>}
        </section>

        <section {...stylex.props(ui.field)}>
          <button
            type="button"
            {...stylex.props(ui.button, ui.buttonSlim)}
            onClick={handleReset}
            disabled={isExporting}
          >
            {resetArmed ? 'もう一度押すと戻ります' : '↺ 設定を規定に戻す'}
          </button>
        </section>
      </aside>

      <main {...stylex.props(styles.stage)}>
        <div {...stylex.props(styles.toolbar)}>
          <span {...stylex.props(ui.label)}>プレビュー背景</span>
          {(['checker', 'dark', 'light', 'stream'] as const).map((value) => (
            <button
              key={value}
              type="button"
              {...stylex.props(styles.chip, background === value && styles.chipActive)}
              onClick={() => setBackground(value)}
            >
              {value === 'checker' && '市松'}
              {value === 'dark' && '暗い'}
              {value === 'light' && '明るい'}
              {value === 'stream' && '配信風'}
            </button>
          ))}
        </div>

        <div {...stylex.props(styles.view, VIEW_STYLES[background])}>
          <PreviewCanvas scene={scene} motionBlurSamples={motionBlur} fps={fps} />
        </div>

        {result && (
          <div {...stylex.props(styles.result)}>
            <div {...stylex.props(styles.resultHead)}>
              <span {...stylex.props(ui.label)}>
                書き出した WebM（透過のまま再生中） — {result.summary}
              </span>
              <button
                type="button"
                {...stylex.props(ui.button, ui.buttonPrimary)}
                onClick={() => downloadBlob(result.blob, result.fileName)}
              >
                ⬇ {result.fileName} を保存
              </button>
            </div>
            <video
              src={result.url}
              autoPlay
              loop
              muted
              playsInline
              {...stylex.props(styles.resultVideo)}
            />
          </div>
        )}
      </main>
    </div>
  )
}
