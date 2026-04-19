import type { Meta, StoryObj } from "@storybook/react";
import { Card } from "../src";

const meta = {
  title: "Primitives/Card",
  component: Card,
  tags: ["autodocs"],
} satisfies Meta<typeof Card>;

export default meta;

type Story = StoryObj<typeof meta>;

function CardPreview({
  title,
  detail,
  tone,
  interactive = false,
}: {
  title: string;
  detail: string;
  tone: "default" | "subtle" | "warm" | "highlight" | "warning" | "success";
  interactive?: boolean;
}) {
  return (
    <Card tone={tone} padding="md" interactive={interactive} style={{ minHeight: 176 }}>
      <div style={{ display: "grid", gap: 12 }}>
        <div style={{ fontSize: 12, letterSpacing: "0.16em", textTransform: "uppercase", color: "#645E54" }}>
          {interactive ? "Interactive Card" : "Surface Card"}
        </div>
        <div style={{ fontFamily: "var(--font-serif-cn), serif", fontSize: 24, color: "#1B1C1A" }}>{title}</div>
        <div style={{ fontSize: 14, lineHeight: 1.7, color: "#4F4A43" }}>{detail}</div>
      </div>
    </Card>
  );
}

export const Tones: Story = {
  render: () => (
    <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
      <CardPreview title="Default" detail="适合作为正文主容器和基础信息面板。" tone="default" />
      <CardPreview title="Subtle" detail="用于轻量级嵌套信息和辅助说明。" tone="subtle" />
      <CardPreview title="Warm" detail="适合稿纸、引导和内容策展场景。" tone="warm" />
      <CardPreview title="Highlight" detail="强调重要提醒，但不进入错误语义。" tone="highlight" />
      <CardPreview title="Warning" detail="适合风险提示、缺口提醒与限制说明。" tone="warning" />
      <CardPreview title="Success" detail="适合成功回执、已完成状态与通过反馈。" tone="success" />
    </div>
  ),
};

export const Interactive: Story = {
  render: () => (
    <div style={{ maxWidth: 320 }}>
      <CardPreview
        title="可点击卡片"
        detail="鼠标悬停时应该维持当前 vNext 的边框与底色反馈，适合导航入口卡。"
        tone="default"
        interactive
      />
    </div>
  ),
};
