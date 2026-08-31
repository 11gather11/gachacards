import * as stylex from '@stylexjs/stylex'
import { useEffect, useRef, useState } from 'react'

import type { CardScene } from '../card/render.ts'
import { renderFrame } from '../card/render.ts'
import { colors } from '../theme.stylex.ts'
import { ui } from '../ui.ts'

const styles = stylex.create({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    alignItems: 'center',
    maxWidth: '100%',
  },
  stage: {
    display: 'grid',
    placeItems: 'center',
    minHeight: 0,
  },
  canvas: {
    maxHeight: '62vh',
    maxWidth: '100%',
    height: 'auto',
    width: 'auto',
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
}

/**
 * シーンをループ再生するプレビュー。
 *
 * 再生位置は state ではなく ref で持ち、描画ループの中で canvas とシークバーを
 * 直接更新している。毎フレーム再レンダリングを起こすと 60fps を維持できないため。
 */
export function PreviewCanvas({ scene }: PreviewCanvasProps) {
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
      renderFrame(ctx, timeRef.current, scene)

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
  }, [scene])

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
