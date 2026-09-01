import * as stylex from '@stylexjs/stylex'
import { useEffect, useRef, useState } from 'react'

import { renderFrameBlurred } from '../card/render.ts'
import type { CardScene } from '../card/scene.ts'
import { colors } from '../theme.stylex.ts'
import { ui } from '../ui.ts'

const styles = stylex.create({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    alignItems: 'center',
    maxWidth: '100%',
    // 親のグリッド領域いっぱいを取る。取らないと中身の高さで決まってしまい、
    // 下に何か増えたときにキャンバスが縮まない
    height: '100%',
    minHeight: 0,
  },
  stage: {
    display: 'grid',
    placeItems: 'center',
    flex: 1,
    minHeight: 0,
    maxWidth: '100%',
  },
  canvas: {
    // 高さは vh ではなく親に対して決める。書き出し結果が出て場所が狭まったら、
    // そのぶんキャンバスが縮んで画面に収まり続ける
    maxHeight: '100%',
    maxWidth: '100%',
    height: 'auto',
    width: 'auto',
    // グリッドの子は min-height: auto、つまり「中身より小さくならない」が既定。
    // canvas は 900x700 という実寸を持つ置換要素なので、これが下限として効いて
    // max-height を無視してしまう。0 を許して初めて縮む
    minHeight: 0,
    minWidth: 0,
  },
  controls: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    width: '100%',
  },
  seek: {
    flex: 1,
  },
  time: {
    color: colors.textDim,
    fontSize: 12,
    fontVariantNumeric: 'tabular-nums',
    minWidth: 96,
    textAlign: 'right',
  },
})

interface PreviewCanvasProps {
  scene: CardScene
  /** モーションブラーのサンプル数。書き出しと同じ値を渡す。 */
  motionBlurSamples: number
  /** 書き出し時の fps。ブラーの露光幅を書き出しと揃えるために要る。 */
  fps: number
}

/**
 * シーンをループ再生するプレビュー。
 *
 * 再生位置は state ではなく ref で持ち、描画ループの中で canvas とシークバーを
 * 直接更新している。毎フレーム再レンダリングを起こすと 60fps を維持できないため。
 */
export function PreviewCanvas({ scene, motionBlurSamples, fps }: PreviewCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rangeRef = useRef<HTMLInputElement>(null)
  const timeLabelRef = useRef<HTMLSpanElement>(null)
  const timeRef = useRef(0)
  const scrubbingRef = useRef(false)
  const [isPlaying, setIsPlaying] = useState(true)
  const playingRef = useRef(true)

  useEffect(() => {
    playingRef.current = isPlaying
  }, [isPlaying])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) return undefined

    // 尺を縮めたときに再生位置が範囲外に取り残されないようにする
    if (timeRef.current > scene.duration) timeRef.current = 0

    let frameHandle = 0
    let previous = performance.now()

    const loop = (now: number) => {
      // タブが裏に回った直後の巨大な差分でアニメが飛ばないよう上限を設ける
      const delta = Math.min(0.1, (now - previous) / 1000)
      previous = now

      if (playingRef.current && !scrubbingRef.current) {
        timeRef.current = (timeRef.current + delta) % scene.duration
      }

      ctx.clearRect(0, 0, scene.width, scene.height)
      // 露光幅は画面の実フレームレートではなく書き出しの fps に合わせる。
      // そうしないとプレビューと書き出しでブラーの長さが変わる
      renderFrameBlurred(ctx, timeRef.current, scene, {
        samples: motionBlurSamples,
        frameDuration: 1 / fps,
        shutter: 0.65,
      })

      if (!scrubbingRef.current && rangeRef.current) {
        rangeRef.current.value = String(timeRef.current)
      }
      if (timeLabelRef.current) {
        timeLabelRef.current.textContent = `${timeRef.current.toFixed(2)}s / ${scene.duration.toFixed(1)}s`
      }

      frameHandle = requestAnimationFrame(loop)
    }

    frameHandle = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frameHandle)
  }, [scene, motionBlurSamples, fps])

  return (
    <div {...stylex.props(styles.root)}>
      <div {...stylex.props(styles.stage)}>
        <canvas
          ref={canvasRef}
          width={scene.width}
          height={scene.height}
          {...stylex.props(styles.canvas)}
        />
      </div>

      <div {...stylex.props(styles.controls)}>
        <button
          type="button"
          onClick={() => setIsPlaying((value) => !value)}
          {...stylex.props(ui.button)}
        >
          {isPlaying ? '■ 停止' : '▶ 再生'}
        </button>
        <input
          ref={rangeRef}
          type="range"
          min={0}
          max={scene.duration}
          step={0.01}
          defaultValue={0}
          {...stylex.props(styles.seek)}
          onPointerDown={() => {
            scrubbingRef.current = true
          }}
          onPointerUp={() => {
            scrubbingRef.current = false
          }}
          onInput={(event) => {
            timeRef.current = Number(event.currentTarget.value)
          }}
        />
        <span ref={timeLabelRef} {...stylex.props(styles.time)} />
      </div>
    </div>
  )
}
