import { useEffect, useMemo, useRef, useState } from "react";

import { ImageDropZone } from "./components/ImageDropZone.tsx";
import { PreviewCanvas } from "./components/PreviewCanvas.tsx";
import { RarityPicker } from "./components/RarityPicker.tsx";
import { createParticles } from "./card/particles.ts";
import type { RarityId } from "./card/rarity.ts";
import { getRarity } from "./card/rarity.ts";
import type { CardScene } from "./card/render.ts";
import { computeCardSize, computeTimeline } from "./card/render.ts";
import { canExportTransparentWebm, exportWebm } from "./export/webm.ts";
import type { Artwork } from "./types.ts";
import { QUALITY_PRESETS, SIZE_PRESETS } from "./types.ts";

/** プレビューの下に敷く背景。透過の確認用に切り替える。 */
type PreviewBackground = "checker" | "dark" | "light" | "stream";

/** 書き出し済みのファイル。保存を押すまではメモリ上に置いておく。 */
interface ExportedFile {
  blob: Blob;
  /** プレビュー再生用のオブジェクト URL。 */
  url: string;
  fileName: string;
  /** サイズやフレーム数をまとめた表示用の文字列。 */
  summary: string;
}

const FPS_OPTIONS = [24, 30, 60] as const;

/** Blob をファイルとして保存させる。 */
function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  // クリック直後に revoke すると保存が始まらない環境があるため、一拍置いてから解放する
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function App() {
  const [artwork, setArtwork] = useState<Artwork | null>(null);
  const [rarityId, setRarityId] = useState<RarityId>("gold");
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [duration, setDuration] = useState(4);
  const [fps, setFps] = useState<number>(30);
  const [sizeId, setSizeId] = useState(SIZE_PRESETS[1]!.id);
  const [qualityId, setQualityId] = useState(QUALITY_PRESETS[1]!.id);
  const [loop, setLoop] = useState(false);
  const [seed, setSeed] = useState(1);
  const [background, setBackground] = useState<PreviewBackground>("checker");

  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ExportedFile | null>(null);
  const [isSupported, setIsSupported] = useState<boolean | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    void canExportTransparentWebm().then(setIsSupported);
  }, []);

  // 書き出し結果の URL は差し替えのたびに解放する
  useEffect(() => {
    const url = result?.url;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [result]);

  const size = SIZE_PRESETS.find((preset) => preset.id === sizeId) ?? SIZE_PRESETS[1]!;
  const quality = QUALITY_PRESETS.find((preset) => preset.id === qualityId) ?? QUALITY_PRESETS[1]!;
  const rarity = getRarity(rarityId);

  const scene = useMemo<CardScene>(() => {
    const card = computeCardSize(size.height);
    const timeline = computeTimeline(duration, loop);
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
    );

    return {
      width: size.width,
      height: size.height,
      image: artwork?.bitmap ?? null,
      imageWidth: artwork?.width ?? 0,
      imageHeight: artwork?.height ?? 0,
      rarity,
      title,
      subtitle,
      duration,
      particles,
      loop,
    };
  }, [size, rarity, artwork, title, subtitle, duration, loop, seed]);

  const handleExport = async () => {
    setError(null);
    setProgress(0);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const exported = await exportWebm({
        scene,
        fps,
        bitrate: quality.bitrate,
        signal: controller.signal,
        onProgress: setProgress,
      });

      // 自動で保存はしない。何本も試して気に入ったものだけ残せるようにする
      setResult({
        blob: exported.blob,
        url: URL.createObjectURL(exported.blob),
        fileName: `${artwork?.fileName ?? "card"}-${rarityId}.webm`,
        summary: `${(exported.blob.size / 1024 / 1024).toFixed(2)} MB / ${exported.frameCount} フレーム / ${(exported.elapsedMs / 1000).toFixed(1)} 秒`,
      });
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setProgress(null);
      abortRef.current = null;
    }
  };

  const isExporting = progress !== null;

  return (
    <div className="app">
      <aside className="panel">
        <header className="panel__header">
          <h1>Card Alert Maker</h1>
          <p>画像から、透過 WebM のカード演出を作る</p>
        </header>

        <section className="field">
          <span className="field__label">アートワーク</span>
          <ImageDropZone artwork={artwork} onSelect={setArtwork} onError={setError} />
        </section>

        <section className="field">
          <span className="field__label">レアリティ（保留カラー）</span>
          <RarityPicker value={rarityId} onChange={setRarityId} />
        </section>

        <section className="field">
          <label className="field__label" htmlFor="title">
            カード名（空なら帯を出さない）
          </label>
          <input
            id="title"
            type="text"
            className="input"
            value={title}
            placeholder="例: ゲリラ豪雨"
            onChange={(event) => setTitle(event.target.value)}
          />
          <input
            type="text"
            className="input"
            value={subtitle}
            placeholder="サブテキスト（任意）"
            onChange={(event) => setSubtitle(event.target.value)}
          />
        </section>

        <section className="field">
          <label className="field__label" htmlFor="duration">
            尺: {duration.toFixed(1)} 秒
          </label>
          <input
            id="duration"
            type="range"
            min={1.5}
            max={8}
            step={0.5}
            value={duration}
            onChange={(event) => setDuration(Number(event.target.value))}
          />
        </section>

        <section className="field field--row">
          <label className="field__sub">
            <span className="field__label">サイズ</span>
            <select
              className="input"
              value={sizeId}
              onChange={(event) => setSizeId(event.target.value)}
            >
              {SIZE_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field__sub">
            <span className="field__label">fps</span>
            <select
              className="input"
              value={fps}
              onChange={(event) => setFps(Number(event.target.value))}
            >
              {FPS_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        </section>

        <section className="field field--row">
          <label className="field__sub">
            <span className="field__label">画質</span>
            <select
              className="input"
              value={qualityId}
              onChange={(event) => setQualityId(event.target.value)}
            >
              {QUALITY_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field__sub">
            <span className="field__label">演出の種</span>
            <button type="button" className="button" onClick={() => setSeed((value) => value + 1)}>
              🎲 パーティクル再抽選
            </button>
          </label>
        </section>

        <section className="field">
          <label className="checkbox">
            <input
              type="checkbox"
              checked={loop}
              onChange={(event) => setLoop(event.target.checked)}
            />
            ループ用（最後のフェードアウトを省く）
          </label>
        </section>

        <section className="field">
          <button
            type="button"
            className="button button--primary"
            onClick={() => void handleExport()}
            disabled={isExporting || isSupported === false}
          >
            {isExporting
              ? `書き出し中 ${Math.round((progress ?? 0) * 100)}%`
              : "透過 WebM を書き出す"}
          </button>
          {isExporting && (
            <button type="button" className="button" onClick={() => abortRef.current?.abort()}>
              中断
            </button>
          )}
          {isSupported === false && (
            <p className="notice notice--error">
              このブラウザは VP9 エンコードに対応していません。Chrome か Edge で開いてください。
            </p>
          )}
          {error && <p className="notice notice--error">{error}</p>}
        </section>
      </aside>

      <main className="stage">
        <div className="stage__toolbar">
          <span className="field__label">プレビュー背景</span>
          {(["checker", "dark", "light", "stream"] as const).map((value) => (
            <button
              key={value}
              type="button"
              className={`chip${background === value ? " chip--active" : ""}`}
              onClick={() => setBackground(value)}
            >
              {value === "checker" && "市松"}
              {value === "dark" && "暗い"}
              {value === "light" && "明るい"}
              {value === "stream" && "配信風"}
            </button>
          ))}
        </div>

        <div className={`stage__view stage__view--${background}`}>
          <PreviewCanvas scene={scene} />
        </div>

        {result && (
          <div className="result">
            <div className="result__head">
              <span className="field__label">
                書き出した WebM（透過のまま再生中） — {result.summary}
              </span>
              <button
                type="button"
                className="button button--primary"
                onClick={() => downloadBlob(result.blob, result.fileName)}
              >
                ⬇ {result.fileName} を保存
              </button>
            </div>
            <video src={result.url} autoPlay loop muted playsInline className="result__video" />
          </div>
        )}
      </main>
    </div>
  );
}
