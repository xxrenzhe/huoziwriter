import type { Meta, StoryObj } from "@storybook/react";
import { boxShadowTokens, designTokens, fontFamilyTokens, uiPrimitives } from "../src";

const lightTextTokenLabels = new Set([
  "ink",
  "inkSoft",
  "inkMuted",
  "cinnabar",
  "cinnabarDeep",
  "success",
  "danger",
  "info",
  "adminBg",
  "adminSurface",
  "adminSurfaceAlt",
  "adminSurfaceMuted",
  "adminAccent",
  "adminInkMuted",
]);

function TokenSwatch({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  const textColor = lightTextTokenLabels.has(label) ? "#FAF9F5" : "#1B1C1A";
  const textPlateColor = textColor === "#FAF9F5" ? "rgba(14, 14, 16, 0.56)" : "rgba(255, 255, 255, 0.82)";
  return (
    <div
      style={{
        background: value,
        color: textColor,
        border: "1px solid rgba(88, 65, 64, 0.12)",
        padding: 16,
        minHeight: 110,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
      }}
    >
      <div
        style={{
          alignSelf: "flex-start",
          background: textPlateColor,
          color: textColor,
          fontSize: 12,
          letterSpacing: "0.18em",
          padding: "4px 6px",
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div
        style={{
          alignSelf: "flex-start",
          background: textPlateColor,
          color: textColor,
          fontFamily: "ui-monospace, SFMono-Regular, monospace",
          fontSize: 14,
          padding: "4px 6px",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function PrimitivePreview({
  label,
  className,
}: {
  label: string;
  className: string;
}) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase", color: "#645E54" }}>{label}</div>
      <code
        style={{
          background: "#FFFFFF",
          border: "1px solid rgba(88, 65, 64, 0.12)",
          padding: 12,
          fontSize: 13,
          lineHeight: 1.5,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {className}
      </code>
    </div>
  );
}

const meta = {
  title: "Tokens/Current Foundation",
  tags: ["autodocs"],
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  render: () => (
    <div
      style={{
        minHeight: "100vh",
        background: designTokens.paper,
        color: designTokens.ink,
        padding: 32,
        fontFamily: "Inter, Noto Sans SC, system-ui, sans-serif",
      }}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto", display: "grid", gap: 32 }}>
        <section style={{ display: "grid", gap: 12 }}>
          <div style={{ fontSize: 12, letterSpacing: "0.28em", textTransform: "uppercase", color: designTokens.cinnabar }}>
            Current UI Package
          </div>
          <h1 style={{ margin: 0, fontSize: 42, lineHeight: 1.1, fontFamily: "Noto Serif SC, serif", fontWeight: 700 }}>
            现有 token 与 primitive 基线
          </h1>
          <p style={{ margin: 0, maxWidth: 760, fontSize: 16, lineHeight: 1.7, color: "#645E54" }}>
            这组 story 先把当前 `@huoziwriter/ui` 的输出可视化，给后续 vNext 组件迁移提供一个可运行的 Storybook 基线。
          </p>
        </section>

        <section style={{ display: "grid", gap: 16 }}>
          <h2 style={{ margin: 0, fontSize: 24, fontFamily: "Noto Serif SC, serif" }}>Color Tokens</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
            {Object.entries(designTokens).map(([label, value]) => (
              <TokenSwatch
                key={label}
                label={label}
                value={value}
              />
            ))}
          </div>
        </section>

        <section style={{ display: "grid", gap: 16 }}>
          <h2 style={{ margin: 0, fontSize: 24, fontFamily: "Noto Serif SC, serif" }}>Typography & Shadow</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
            <div style={{ background: "#FFF", border: "1px solid rgba(88, 65, 64, 0.12)", padding: 20, boxShadow: boxShadowTokens.ink }}>
              <div style={{ fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase", color: "#645E54" }}>serifCn</div>
              <div style={{ marginTop: 12, fontSize: 32, fontFamily: fontFamilyTokens.serifCn.join(", "), lineHeight: 1.3 }}>
                把中文写作重新装回稿纸。
              </div>
            </div>
            <div style={{ background: "#FFF", border: "1px solid rgba(88, 65, 64, 0.12)", padding: 20 }}>
              <div style={{ fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase", color: "#645E54" }}>sansCn</div>
              <div style={{ marginTop: 12, fontSize: 16, fontFamily: fontFamilyTokens.sansCn.join(", "), lineHeight: 1.8 }}>
                当前 UI 正文、表单与说明文案统一依赖 sans 轨道；后续 vNext 组件会在这个 Storybook 基线上继续扩展。
              </div>
            </div>
          </div>
        </section>

        <section style={{ display: "grid", gap: 16 }}>
          <h2 style={{ margin: 0, fontSize: 24, fontFamily: "Noto Serif SC, serif" }}>Primitive Class Exports</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
            {Object.entries(uiPrimitives).map(([label, className]) => (
              <PrimitivePreview key={label} label={label} className={className} />
            ))}
          </div>
        </section>
      </div>
    </div>
  ),
};
