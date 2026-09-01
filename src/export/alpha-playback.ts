/**
 * 書き出した WebM の透過を、このブラウザが再生できるかどうかの判定。
 *
 * ブラウザ名やエンジンからは決めない。iOS では Chrome も Edge も中身は
 * WebKit なので、「Chrome で開いてください」は同じ端末では答えにならない。
 * 逆に将来 WebKit が対応すれば、名前で弾く作りは間違ったまま残る。
 *
 * 書き出した実物を再生して、透明なはずの場所が透明に見えるかを測る。
 * 知りたいことをそのまま測っているので、どのブラウザでも正しく答えが出る。
 */

/** 四隅から何 px 内側を見るか。端ちょうどは圧縮の影響を受けやすい。 */
const PROBE_INSET = 3

/** 透明とみなすアルファの上限。VP9 は非可逆なので、少しの濁りは許す。 */
const CLEAR_ALPHA = 24

/** 読み込みとシークに許す時間（ミリ秒）。 */
const PROBE_TIMEOUT_MS = 5000

/** `video` が指定の状態になるまで待つ。時間切れでも例外にはしない。 */
function waitFor(video: HTMLVideoElement, event: 'loadeddata' | 'seeked'): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      video.removeEventListener(event, done)
      resolve()
    }
    video.addEventListener(event, done)
    setTimeout(done, PROBE_TIMEOUT_MS)
  })
}

/**
 * 書き出した動画の透過が、このブラウザで見えるかどうかを調べる。
 *
 * カードの演出はフレームの四隅が必ず透明になるよう作ってある
 * （`fadeFrameEdges`。テストでも押さえている）。そこを読み戻して
 * 不透明なら、このブラウザはアルファを捨てて再生している。
 *
 * @param url - 書き出した Blob のオブジェクト URL
 * @returns 透過が見えるなら `true`。判定できなかった場合も `true`
 * （出せない注意書きを出すより、黙っているほうがまし）
 *
 * @example
 * const ok = await canPlayAlpha(URL.createObjectURL(blob))
 * if (!ok) showNotice()
 */
export async function canPlayAlpha(url: string): Promise<boolean> {
  const video = document.createElement('video')
  video.src = url
  video.muted = true
  video.playsInline = true

  try {
    await waitFor(video, 'loadeddata')
    if (!video.videoWidth || !video.videoHeight) return true

    // 頭は入り演出の前で全面が透明なので、判定にならない。
    // カードが出ているあたりまで進めてから測る
    video.currentTime = Math.min(video.duration || 0, 0.1) + (video.duration || 0) * 0.6
    await waitFor(video, 'seeked')

    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return true

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(video, 0, 0)

    // 四隅すべてを見る。1 点だけだと、たまたま粒が乗っていたときに誤判定する
    const corners = [
      [PROBE_INSET, PROBE_INSET],
      [canvas.width - 1 - PROBE_INSET, PROBE_INSET],
      [PROBE_INSET, canvas.height - 1 - PROBE_INSET],
      [canvas.width - 1 - PROBE_INSET, canvas.height - 1 - PROBE_INSET],
    ] as const
    return corners.every(([x, y]) => (ctx.getImageData(x, y, 1, 1).data[3] ?? 0) <= CLEAR_ALPHA)
  } catch {
    // 測れなかったときは黙っておく
    return true
  } finally {
    video.src = ''
  }
}
