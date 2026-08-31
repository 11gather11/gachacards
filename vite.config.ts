import stylex from '@stylexjs/unplugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite-plus'

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
  ],
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
