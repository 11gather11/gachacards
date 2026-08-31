import * as stylex from '@stylexjs/stylex'
import { useCallback, useRef, useState } from 'react'

import { toErrorMessage } from '../errors.ts'
import { colors } from '../theme.stylex.ts'
import type { Artwork } from '../types.ts'

const styles = stylex.create({
  zone: {
    display: 'grid',
    placeItems: 'center',
    minHeight: 108,
    padding: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 10,
    cursor: 'pointer',
    textAlign: 'center',
    transitionProperty: 'border-color, background',
    transitionDuration: '0.15s',
    // ドラッグ中の見た目は hover と同じにする。ホバーは擬似クラスで足りるが、
    // ドラッグ中は状態として持たないと表せない
    backgroundColor: {
      default: colors.panelSoft,
      ':hover': '#212a3a',
    },
    borderColor: {
      default: colors.line,
      ':hover': colors.accent,
    },
  },
  zoneDragging: {
    backgroundColor: '#212a3a',
    borderColor: colors.accent,
  },
  stack: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    alignItems: 'center',
  },
  icon: {
    fontSize: 22,
    color: colors.textDim,
  },
  hint: {
    color: colors.textDim,
    fontSize: 11,
  },
})

interface ImageDropZoneProps {
  artwork: Artwork | null
  onSelect: (artwork: Artwork) => void
  onError: (message: string) => void
}

/**
 * 画像のドラッグ&ドロップとファイル選択を受け付ける領域。
 * 受け取った画像は `createImageBitmap` でデコードしてから親に渡す。
 */
export function ImageDropZone({ artwork, onSelect, onError }: ImageDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('image/')) {
        onError(`画像ファイルではありません: ${file.name}`)
        return
      }
      try {
        // デコードを先に済ませておくと、描画のたびに待たされない
        const bitmap = await createImageBitmap(file)
        onSelect({
          bitmap,
          width: bitmap.width,
          height: bitmap.height,
          fileName: file.name.replace(/\.[^.]+$/, ''),
        })
      } catch (error) {
        onError(`画像を読み込めませんでした: ${toErrorMessage(error)}`)
      }
    },
    [onSelect, onError],
  )

  return (
    <div
      {...stylex.props(styles.zone, isDragging && styles.zoneDragging)}
      onDragOver={(event) => {
        event.preventDefault()
        setIsDragging(true)
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(event) => {
        event.preventDefault()
        setIsDragging(false)
        const file = event.dataTransfer.files[0]
        if (file) void load(file)
      }}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') inputRef.current?.click()
      }}
      role="button"
      tabIndex={0}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void load(file)
          // 同じファイルを選び直せるようにリセットする
          event.target.value = ''
        }}
      />
      {artwork ? (
        <div {...stylex.props(styles.stack)}>
          <strong>{artwork.fileName}</strong>
          <span>
            {artwork.width} × {artwork.height}
          </span>
          <span {...stylex.props(styles.hint)}>クリックまたはドロップで差し替え</span>
        </div>
      ) : (
        <div {...stylex.props(styles.stack)}>
          <span {...stylex.props(styles.icon)}>＋</span>
          <strong>画像をドロップ</strong>
          <span {...stylex.props(styles.hint)}>クリックしてファイルを選択</span>
        </div>
      )}
    </div>
  )
}
