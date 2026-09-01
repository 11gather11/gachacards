import { readdir } from 'node:fs/promises'

import stylex from '@stylexjs/unplugin/vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite-plus'
import { defineConfig } from 'vite-plus'
import { playwright } from 'vite-plus/test/browser-playwright'

/**
 * Cloudflare Web Analytics のビーコンを、トークンが渡されたときだけ差し込む。
 *
 * Cookie を使わないので同意バナーが要らない。トークンはページに載せて使う
 * 公開値で、秘密ではない。
 *
 * 素の `%VITE_...%` を HTML に直書きすると、環境変数が無いビルドでその文字列が
 * そのまま残り、毎回無効なトークンでリクエストが飛ぶ。差し込みを条件にすれば、
 * 未設定のときは何も出ない。
 *
 * 独自ドメインを Cloudflare 経由にしている場合は、ダッシュボードから
 * 自動で挿す設定もある。その場合はこの環境変数を渡さなければよい。
 */
function cloudflareAnalytics(): Plugin {
  return {
    name: 'cloudflare-web-analytics',
    transformIndexHtml() {
      const token = process.env.CF_ANALYTICS_TOKEN
      if (!token) return []
      return [
        {
          tag: 'script',
          injectTo: 'head',
          attrs: {
            defer: true,
            src: 'https://static.cloudflareinsights.com/beacon.min.js',
            'data-cf-beacon': JSON.stringify({ token }),
          },
        },
      ]
    },
  }
}

/**
 * sitemap.xml をビルド時に出す。
 *
 * ページは `index.html` と `public/*.html` の静的ファイルなので、そこを読めば
 * 一覧は自分で分かる。手で並べた配列を持たない理由は、ページを足したときに
 * 更新を忘れても気づけないため。
 *
 * URL は `.html` を落とした形にする。配信側が `/privacy.html` を `/privacy` へ
 * 転送するので、拡張子付きを載せると sitemap 経由の巡回が毎回転送を挟む。
 *
 * `lastmod` は書かない。ここで生成時刻を入れると、中身が変わっていないページも
 * ビルドのたびに更新されたことになり、日付として嘘になる。
 */
function sitemap(origin: string): Plugin {
  return {
    name: 'sitemap',
    async generateBundle() {
      const files = await readdir('public')
      const paths = [
        '/',
        ...files.filter((f) => f.endsWith('.html')).map((f) => `/${f.replace(/\.html$/, '')}`),
      ]
      const urls = paths.map((path) => `  <url><loc>${origin}${path}</loc></url>`).join('\n')

      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`,
      })
    },
  }
}

/**
 * Google AdSense のタグを、パブリッシャー ID が渡されたときだけ差し込む。
 *
 * アクセス解析と同じ理由で条件付きにしてある。手元とプルリクのビルドから
 * 広告配信のリクエストが飛ぶのは、開発の邪魔になるうえ意味がない。
 *
 * ID はページに載せて使う公開値で、秘密ではない。
 */
function googleAdsense(): Plugin {
  return {
    name: 'google-adsense',
    transformIndexHtml() {
      const client = process.env.ADSENSE_CLIENT
      if (!client) return []
      return [
        {
          tag: 'script',
          injectTo: 'head',
          attrs: {
            async: true,
            src: `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}`,
            crossorigin: 'anonymous',
          },
        },
      ]
    },
  }
}

export default defineConfig(({ mode }) => ({
  // StyleX はビルド時に静的 CSS へ畳む。react より先に置く必要がある。
  // 生成された CSS は、既存の CSS アセット（global.css）に注入される
  plugins: [
    stylex({
      useCSSLayers: true,
      dev: mode === 'development',
      runtimeInjection: false,
    }),
    react(),
    cloudflareAnalytics(),
    googleAdsense(),
    sitemap('https://gachacards.11gather11.com'),
  ],
  // カードの描画は OffscreenCanvas・float16 キャンバス・コニックグラデーション・
  // canvas の blur フィルタに依存している。どれも Node には無いので、
  // テストは実物の Chromium の中で走らせる
  test: {
    include: ['src/**/*.test.ts'],
    // テストが終わったあと、何かが Node の終了を妨げていて既定の 10 秒を
    // 待たされる。結果は出きっているので、待つ意味がない
    teardownTimeout: 1000,
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      // Safari/iOS で崩れていないかを見るため WebKit も回す。
      // ctx.filter のぼかしのように「設定は通るのに効かない」差は、
      // 実際に描いてみないと分からない
      instances: [{ browser: 'chromium' }, { browser: 'webkit' }],
    },
  },
  staged: {
    '*': 'vp check --fix',
  },
  fmt: {
    ignorePatterns: ['dist/**'],
    // 生成物の既定に合わせる。ここを書いておかないと oxfmt の既定が変わったときに
    // 全ファイルが差分だらけになる
    printWidth: 100,
    semi: false,
    singleQuote: true,
    sortPackageJson: true,
    sortImports: true,
  },
  lint: {
    ignorePatterns: ['dist/**'],
    // react は既定で無効。有効にしないと hooks のルールが一切効かない
    plugins: ['react', 'typescript', 'unicorn', 'oxc', 'import', 'promise'],
    categories: {
      correctness: 'error',
      suspicious: 'error',
      perf: 'warn',
    },
    jsPlugins: [{ name: 'vite-plus', specifier: 'vite-plus/oxlint-plugin' }],
    rules: {
      'vite-plus/prefer-vite-plus-imports': 'error',
      // tsconfig の jsx は react-jsx（automatic runtime）なので、
      // JSX を書くのに React を import する必要はない
      'react/react-in-jsx-scope': 'off',
      // 消し忘れの console は残したくないが、異常の報告だけは通す
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'no-debugger': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      // 動画の書き出しはフレームを順に流し込む必要があり、並列化できない
      'no-await-in-loop': 'off',
      // CSS の副作用 import（import "./style.css"）を潰さない
      'import/no-unassigned-import': 'off',
    },
    options: { typeAware: true, typeCheck: true },
  },
}))
