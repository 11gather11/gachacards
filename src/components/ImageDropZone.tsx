import { useCallback, useRef, useState } from 'react'

import { toErrorMessage } from '../errors.ts'
import type { Artwork } from '../types.ts'

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
      className={`dropzone${isDragging ? ' dropzone--active' : ''}`}
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
        <div className="dropzone__loaded">
          <strong>{artwork.fileName}</strong>
          <span>
            {artwork.width} × {artwork.height}
          </span>
          <span className="dropzone__hint">クリックまたはドロップで差し替え</span>
        </div>
      ) : (
        <div className="dropzone__empty">
          <span className="dropzone__icon">＋</span>
          <strong>画像をドロップ</strong>
          <span className="dropzone__hint">クリックしてファイルを選択</span>
        </div>
      )}
    </div>
  )
}
