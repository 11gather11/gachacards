/**
 * 公開用の画像を作る。
 *
 * OGP はカードの描画コードそのもので描く。イラストを別に用意するより、
 * このツールが実際に出すものを見せたほうが伝わるし、演出を変えたときに
 * ここを走らせ直すだけで追随できる。
 *
 * 開発サーバが必要（`pnpm exec vp dev`）。中の canvas は OffscreenCanvas と
 * コニックグラデーションを使うので、実物のブラウザでしか動かない。
 *
 *   node tools/make-assets.mjs [http://localhost:5173]
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ORIGIN = process.argv[2] ?? 'http://localhost:5173'

/** OGP の推奨サイズ。 */
const OG_WIDTH = 1200
const OG_HEIGHT = 630

/** ホーム画面に追加したときのアイコン。 */
const TOUCH_ICON = 180

/**
 * ページの中でカードを 1 枚描き、PNG のバイト列を返す。
 *
 * @param page - Playwright のページ
 * @param origin - 開発サーバの URL
 * @returns PNG のバイト列
 */
async function renderOgImage(page, origin) {
  const dataUrl = await page.evaluate(
    async ({ origin: base, width, height }) => {
      const [render, particles, rarity, scene] = await Promise.all([
        import(`${base}/src/card/render.ts`),
        import(`${base}/src/card/particles.ts`),
        import(`${base}/src/card/rarity.ts`),
        import(`${base}/src/card/scene.ts`),
      ])

      const preset = rarity.RARITY_PRESETS.find((item) => item.id === 'rainbow')
      const card = scene.computeCardSize(width, height)
      const timeline = scene.computeTimeline(8, false, 0)
      const cardScene = {
        width,
        height,
        image: null,
        imageWidth: 0,
        imageHeight: 0,
        rarity: preset,
        badge: preset.badge,
        title: 'GachaCards',
        subtitle: '画像から、透過 WebM のカード演出を作る',
        duration: 8,
        particles: particles.createParticles(
          preset,
          {
            cardWidth: card.width,
            cardHeight: card.height,
            duration: 8,
            startAt: timeline.entranceEnd,
          },
          20260901,
        ),
        intro: null,
        introDuration: 0,
        loop: false,
        focusX: 0.5,
        focusY: 0.5,
      }

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      // OGP は透過を扱えないので、下地を先に敷いてから重ねる
      ctx.fillStyle = '#0d1017'
      ctx.fillRect(0, 0, width, height)
      // 粒が舞い、光沢が走っているあたり
      render.renderFrameBlurred(ctx, 5.2, cardScene, null)
      // OGP に透過は要らない。PNG だと 600KB になるので JPEG で出す
      return canvas.toDataURL('image/jpeg', 0.92)
    },
    { origin, width: OG_WIDTH, height: OG_HEIGHT },
  )
  return Buffer.from(dataUrl.split(',')[1], 'base64')
}

/** favicon の SVG を、指定した大きさの PNG にする。 */
async function renderTouchIcon(page, origin, size) {
  const dataUrl = await page.evaluate(
    async ({ origin: base, size: side }) => {
      // createImageBitmap は SVG の Blob を復号できない。img 経由なら通る
      const image = new Image(side, side)
      image.src = `${base}/favicon.svg`
      await image.decode()
      const canvas = document.createElement('canvas')
      canvas.width = side
      canvas.height = side
      const ctx = canvas.getContext('2d')
      // ホーム画面のアイコンは透過を丸めてくれないので、下地を敷いておく
      ctx.fillStyle = '#0d1017'
      ctx.fillRect(0, 0, side, side)
      // 角の余白ぶん内側に描く。iOS が角を丸めたときに枠が切れないように
      const inset = side * 0.08
      ctx.drawImage(image, inset, inset, side - inset * 2, side - inset * 2)
      return canvas.toDataURL('image/png')
    },
    { origin, size },
  )
  return Buffer.from(dataUrl.split(',')[1], 'base64')
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: OG_WIDTH, height: OG_HEIGHT } })
try {
  const response = await page.goto(ORIGIN)
  if (!response?.ok()) throw new Error(`開発サーバに繋がりません: ${ORIGIN}`)

  await mkdir(join(ROOT, 'public'), { recursive: true })
  await writeFile(join(ROOT, 'public/og.jpg'), await renderOgImage(page, ORIGIN))
  await writeFile(
    join(ROOT, 'public/apple-touch-icon.png'),
    await renderTouchIcon(page, ORIGIN, TOUCH_ICON),
  )
  // no-console はアプリ側の消し忘れを止めるための規則。ここは端末へ
  // 報告するのが仕事のスクリプトなので、標準出力へ直接書く
  process.stdout.write('public/og.jpg と public/apple-touch-icon.png を作りました\n')
} finally {
  await browser.close()
}
