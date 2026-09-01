import * as stylex from '@stylexjs/stylex'
import { useEffect, useMemo, useRef, useState } from 'react'

import {
  buildIntroStages,
  computeIntroDuration,
  createIntroParticles,
  listIntermediateRarities,
} from './card/intro.ts'
import { createParticles } from './card/particles.ts'
import { getRarity } from './card/rarity.ts'
import type { CardScene } from './card/scene.ts'
import { computeCardSize, computeTimeline } from './card/scene.ts'
import { CardFields } from './components/CardFields.tsx'
import { ImageDropZone } from './components/ImageDropZone.tsx'
import { IntroFields } from './components/IntroFields.tsx'
import { OutputFields } from './components/OutputFields.tsx'
import { PreviewCanvas } from './components/PreviewCanvas.tsx'
import { RarityPicker } from './components/RarityPicker.tsx'
import { toErrorMessage } from './errors.ts'
import { canPlayAlpha } from './export/alpha-playback.ts'
import { canExportTransparentWebm, exportWebm } from './export/webm.ts'
import { DEFAULT_SETTINGS } from './settings.ts'
import { colors } from './theme.stylex.ts'
import type { Artwork } from './types.ts'
import { QUALITY_PRESETS, SIZE_PRESETS, resolveFrameSize } from './types.ts'
import { ui } from './ui.ts'
import { useSettings } from './useSettings.ts'

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
  const { settings, update, reset, resetArmed } = useSettings()
  // 読む側は今までどおりの名前で書けるよう、ここで開いておく
  const {
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
  } = settings

  const [background, setBackground] = useState<PreviewBackground>('checker')

  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ExportedFile | null>(null)
  const [isSupported, setIsSupported] = useState<boolean | null>(null)
  // 書き出したものの透過が、このブラウザで見えるかどうか
  const [alphaVisible, setAlphaVisible] = useState(true)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    void canExportTransparentWebm().then(setIsSupported)
  }, [])

  // 書き出し結果の URL は差し替えのたびに解放する
  useEffect(() => {
    const url = result?.url
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [result])

  // 保存値が未知の id だったときは既定に戻す。並び順に頼ると、
  // プリセットを増やしたときに黙って別のサイズになる
  const sizePreset =
    SIZE_PRESETS.find((preset) => preset.id === sizeId) ??
    SIZE_PRESETS.find((preset) => preset.id === DEFAULT_SETTINGS.sizeId)!
  // 毎レンダリングで新しい物体になると scene の再計算が止まらないので、ここで固定する
  const size = useMemo(() => resolveFrameSize(sizePreset, orientation), [sizePreset, orientation])
  const quality =
    QUALITY_PRESETS.find((preset) => preset.id === qualityId) ??
    QUALITY_PRESETS.find((preset) => preset.id === DEFAULT_SETTINGS.qualityId)!
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
      const url = URL.createObjectURL(exported.blob)
      // 下のプレビューが不透過に見える環境があるので、先に測っておく
      setAlphaVisible(await canPlayAlpha(url))
      setResult({
        blob: exported.blob,
        url,
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
          <RarityPicker value={rarityId} onChange={(value) => update('rarityId', value)} />
        </section>

        <CardFields
          settings={settings}
          update={update}
          effectiveBadge={effectiveBadge}
          estimatedSizeMb={estimatedSizeMb}
        />

        <IntroFields
          settings={settings}
          update={update}
          introDuration={introDuration}
          intermediates={intermediates}
          introStages={introStages}
        />

        <OutputFields settings={settings} update={update} />

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
              このブラウザは VP9 の書き出しに対応していません。パソコンの Chrome か Edge で
              開いてください。iPhone・iPad では、Chrome や Edge も中身は Safari と同じ
              仕組みなので、同じ端末でブラウザを変えても書き出せません。
            </p>
          )}
          {error && <p {...stylex.props(ui.notice, ui.noticeError)}>{error}</p>}
        </section>

        <section {...stylex.props(ui.field)}>
          <button
            type="button"
            {...stylex.props(ui.button, ui.buttonSlim)}
            onClick={reset}
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
                書き出した WebM{alphaVisible && '（透過のまま再生中）'} — {result.summary}
              </span>
              <button
                type="button"
                {...stylex.props(ui.button, ui.buttonPrimary)}
                onClick={() => downloadBlob(result.blob, result.fileName)}
              >
                ⬇ {result.fileName} を保存
              </button>
            </div>
            {!alphaVisible && (
              <p {...stylex.props(ui.notice)}>
                このブラウザは透過付きの WebM を再生できないため、下のプレビューは背景が
                黒く出ます。<strong>ファイル自体は正しく透過しています</strong>ので、
                そのまま保存して Streamlabs で使えます。
                <br />
                見た目を確かめたい場合は、パソコンの Chrome か Edge で開いてください。 iPhone・iPad
                では、Chrome や Edge も中身は Safari と同じ仕組みなので、
                同じ端末でブラウザを変えても結果は変わりません。
              </p>
            )}
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
