import type { RarityId } from "../card/rarity.ts";
import { RARITY_PRESETS } from "../card/rarity.ts";

interface RarityPickerProps {
  value: RarityId;
  onChange: (value: RarityId) => void;
}

/**
 * レアリティ（保留カラー）の選択ボタン列。
 * 並び順がそのまま信頼度の低い順になっている。
 */
export function RarityPicker({ value, onChange }: RarityPickerProps) {
  return (
    <div className="rarity">
      {RARITY_PRESETS.map((preset) => {
        const isActive = preset.id === value;
        // 虹は単色で表せないので、見本だけグラデーションに切り替える
        const swatch = preset.rainbowFrame
          ? `linear-gradient(135deg, ${preset.frameColors.join(", ")})`
          : (preset.frameColors[1] ?? preset.frameColors[0] ?? "#ffffff");
        return (
          <button
            key={preset.id}
            type="button"
            className={`rarity__item${isActive ? " rarity__item--active" : ""}`}
            onClick={() => onChange(preset.id)}
            style={
              {
                "--rarity-color": swatch,
                "--rarity-glow": preset.glowColor,
              } as React.CSSProperties
            }
            aria-pressed={isActive}
          >
            <span className="rarity__swatch" />
            <span className="rarity__label">{preset.label}</span>
            <span className="rarity__badge">{preset.badge}</span>
          </button>
        );
      })}
    </div>
  );
}
