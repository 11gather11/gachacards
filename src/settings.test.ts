/**
 * 設定の保存と復元のテスト。
 *
 * ここが壊れると「別の日に同じカードを作り直す」ができなくなる。
 * seed を含めて残しているのがその目的なので、往復できることを押さえておく。
 */

import { afterEach, describe, expect, it } from 'vite-plus/test'

import { DEFAULT_SETTINGS, drawSeed, loadSettings, saveSettings } from './settings.ts'

const STORAGE_KEY = 'card-alert-maker:settings'

afterEach(() => {
  localStorage.removeItem(STORAGE_KEY)
})

describe('loadSettings', () => {
  it('何も無ければ既定値を返す', () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS)
  })

  it('返す既定値は使い回しではない', () => {
    // 浅いコピーだと via の配列が DEFAULT_SETTINGS と同じ実体になり、
    // 呼び出し側が書き換えた瞬間に既定値そのものが変わる。
    // 比較先も一緒に変わってしまうので、期待値は直接書く
    const first = loadSettings()
    first.via.push('white')
    expect(loadSettings().via).toEqual(['blue', 'green', 'red', 'gold'])
  })

  it('壊れた保存値でも落ちずに既定値へ落とす', () => {
    for (const broken of ['{', 'null', '"文字列"', '42']) {
      localStorage.setItem(STORAGE_KEY, broken)
      expect(loadSettings()).toEqual(DEFAULT_SETTINGS)
    }
  })

  it('キーが足りない保存値は既定値で埋める', () => {
    // 設定を増やしたあとに古い保存値を読んでも壊れないこと
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ seed: 777 }))
    const loaded = loadSettings()
    expect(loaded.seed).toBe(777)
    expect(loaded.duration).toBe(DEFAULT_SETTINGS.duration)
  })

  it('無くなった入り演出の種類は、出すか出さないかだけ引き継ぐ', () => {
    // 以前は "none" / "promote" / "fake" を保存していた
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ introMode: 'fake' }))
    expect(loadSettings().introMode).toBe('on')
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ introMode: 'off' }))
    expect(loadSettings().introMode).toBe('off')
  })
})

describe('saveSettings', () => {
  it('保存したものがそのまま戻る', () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      rarityId: 'rainbow' as const,
      badge: '確定',
      title: 'テスト',
      duration: 20,
      seed: 98765,
      via: ['blue' as const],
    }
    saveSettings(settings)
    expect(loadSettings()).toEqual(settings)
  })
})

describe('drawSeed', () => {
  it('0 以上 100000 未満の整数を返す', () => {
    for (let i = 0; i < 200; i++) {
      const seed = drawSeed()
      expect(Number.isInteger(seed)).toBe(true)
      expect(seed).toBeGreaterThanOrEqual(0)
      expect(seed).toBeLessThan(100_000)
    }
  })
})
