import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "../src";

const meta = {
  title: "Primitives/Button",
  component: Button,
  tags: ["autodocs"],
  args: {
    children: "生成摘要",
  },
} satisfies Meta<typeof Button>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Variants: Story = {
  render: (args) => (
    <div style={{ display: "grid", gap: 16, maxWidth: 720 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        <Button {...args} variant="primary">主操作</Button>
        <Button {...args} variant="secondary">次操作</Button>
        <Button {...args} variant="ghost">幽灵按钮</Button>
        <Button {...args} variant="danger">危险操作</Button>
        <Button {...args} variant="link">文本链接</Button>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
        <Button {...args} size="sm">小尺寸</Button>
        <Button {...args} size="md">中尺寸</Button>
        <Button {...args} size="lg">大尺寸</Button>
        <Button {...args} loading>加载中</Button>
        <Button {...args} disabled>不可用</Button>
      </div>
      <div style={{ maxWidth: 320 }}>
        <Button {...args} variant="primary" fullWidth>整行主操作</Button>
      </div>
    </div>
  ),
};
