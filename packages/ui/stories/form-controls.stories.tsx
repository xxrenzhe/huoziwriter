import type { Meta, StoryObj } from "@storybook/react";
import {
  Input,
  Select,
  Textarea,
  fieldEyebrowClassName,
  fieldHintClassName,
  fieldLabelClassName,
} from "../src";

const meta = {
  title: "Primitives/Form Controls",
  component: Input,
  tags: ["autodocs"],
} satisfies Meta<typeof Input>;

export default meta;

type Story = StoryObj<typeof meta>;

function FieldBlock({
  eyebrow,
  label,
  hint,
  children,
}: {
  eyebrow: string;
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div className={fieldEyebrowClassName}>{eyebrow}</div>
      <label className={fieldLabelClassName}>
        <div style={{ marginBottom: 8 }}>{label}</div>
        {children}
      </label>
      <div className={fieldHintClassName}>{hint}</div>
    </div>
  );
}

export const Overview: Story = {
  render: () => (
    <div style={{ display: "grid", gap: 20, maxWidth: 680 }}>
      <FieldBlock eyebrow="Input" label="稿件标题" hint="常规输入态，适合标题、系列名、搜索框。">
        <Input defaultValue="为什么 AI 写作产品需要反机器味界面" />
      </FieldBlock>

      <FieldBlock eyebrow="Input / Invalid" label="封面提示词" hint="错误态应该只改变语义边框，不破坏整体布局。">
        <Input defaultValue="请补足配图生成 prompt" invalid aria-invalid="true" />
      </FieldBlock>

      <FieldBlock eyebrow="Select" label="发布渠道" hint="Select 保持与输入框相同的尺寸和焦点反馈。">
        <Select defaultValue="wechat">
          <option value="wechat">微信公众号</option>
          <option value="xiaohongshu">小红书</option>
          <option value="zhihu">知乎</option>
        </Select>
      </FieldBlock>

      <FieldBlock eyebrow="Textarea" label="摘要说明" hint="Textarea 适合较长说明文案和策略备注。">
        <Textarea defaultValue="把素材结构、标题承诺和风险提醒合并成一个作者可执行的摘要。" />
      </FieldBlock>
    </div>
  ),
};
