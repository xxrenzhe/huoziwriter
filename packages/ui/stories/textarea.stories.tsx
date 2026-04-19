import { useId } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { Textarea, textareaStyles, type TextareaProps } from "../src";
import { PreviewGrid, PreviewTile, StoryPage, StorySection } from "./storybook-helpers";

function TextareaField({
  label,
  hint,
  invalid = false,
  ...props
}: TextareaProps & {
  label: string;
  hint?: string;
}) {
  const fieldId = useId();
  return (
    <div className="ui-story-field">
      <label className="ui-story-field-label" htmlFor={fieldId}>
        {label}
      </label>
      <div data-ui-preview="field" data-invalid={invalid ? "true" : "false"}>
        <Textarea {...props} id={fieldId} invalid={invalid} />
      </div>
      {hint ? <p className="ui-story-field-hint">{hint}</p> : null}
    </div>
  );
}

const meta = {
  title: "Primitives/Textarea",
  component: Textarea,
  tags: ["autodocs"],
  args: {
    placeholder: "Capture the working brief here",
    defaultValue: "",
    invalid: false,
    disabled: false,
    rows: 5,
  } satisfies Partial<TextareaProps>,
} satisfies Meta<typeof Textarea>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => (
    <StoryPage
      title="Textarea primitive"
      description="Multiline input coverage for prompts, briefs, feedback, and source notes."
    >
      <StorySection title="Playground" description="Use controls to inspect the shared multiline field treatment and validation state.">
        <PreviewTile
          label="Textarea field"
          description="The base recipe keeps generous line-height for longer Chinese and mixed-language content."
          code={textareaStyles({ invalid: args.invalid })}
        >
          <TextareaField {...args} label="Brief" hint="Reserve this for prompts, instructions, or source notes." />
        </PreviewTile>
      </StorySection>
    </StoryPage>
  ),
};

export const States: Story = {
  render: () => (
    <StoryPage
      title="Textarea states"
      description="Empty, populated, invalid, and disabled examples cover the most common real usage patterns."
    >
      <StorySection title="State matrix" description="The preview keeps labels and helper text visible so multiline entry states remain reviewable in isolation.">
        <PreviewGrid minWidth={280}>
          <PreviewTile label="Empty" code={textareaStyles()}>
            <TextareaField label="Angle" placeholder="Describe the audience, tension, and desired outcome." hint="Use this state to assess blank-form spacing." />
          </PreviewTile>
          <PreviewTile label="Filled" code={textareaStyles()}>
            <TextareaField
              label="Source summary"
              defaultValue={"Three recent comments repeat the same complaint:\n- no onboarding path\n- weak proof in the headline\n- unclear next step after signup"}
              hint="The filled state should stay readable at a glance."
            />
          </PreviewTile>
          <PreviewTile label="Invalid" code={textareaStyles({ invalid: true })}>
            <TextareaField
              label="Compliance note"
              defaultValue="Need final reviewer sign-off before publishing."
              invalid
              hint="Validation feedback should remain local to the field."
            />
          </PreviewTile>
          <PreviewTile label="Disabled" code={textareaStyles()}>
            <TextareaField
              label="Locked rationale"
              defaultValue="This note is generated from the approved review record."
              disabled
              hint="Disabled multiline fields still need readable copy."
            />
          </PreviewTile>
        </PreviewGrid>
      </StorySection>
    </StoryPage>
  ),
};
