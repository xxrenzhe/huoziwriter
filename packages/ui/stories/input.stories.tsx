import { useId } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { Input, inputStyles, type InputProps } from "../src";
import { PreviewGrid, PreviewTile, StoryPage, StorySection } from "./storybook-helpers";

function InputField({
  label,
  hint,
  invalid = false,
  ...props
}: InputProps & {
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
        <Input {...props} id={fieldId} invalid={invalid} />
      </div>
      {hint ? <p className="ui-story-field-hint">{hint}</p> : null}
    </div>
  );
}

const meta = {
  title: "Primitives/Input",
  component: Input,
  tags: ["autodocs"],
  args: {
    placeholder: "Enter a title",
    defaultValue: "",
    invalid: false,
    disabled: false,
    type: "text",
  } satisfies Partial<InputProps>,
} satisfies Meta<typeof Input>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => (
    <StoryPage
      title="Input primitive"
      description="Single-line field coverage for common content and settings forms, including invalid and disabled states."
    >
      <StorySection title="Playground" description="Use controls to review the base field chrome and the invalid border treatment.">
        <PreviewTile
          label="Input field"
          description="Defaults match the shared text-entry rhythm used by support, settings, and article filters."
          code={inputStyles({ invalid: args.invalid })}
        >
          <InputField {...args} label="Article title" hint="Keep it explicit and scannable." />
        </PreviewTile>
      </StorySection>
    </StoryPage>
  ),
};

export const States: Story = {
  render: () => (
    <StoryPage
      title="Input states"
      description="The main validation and filled-state combinations are available without relying on application-specific wrappers."
    >
      <StorySection title="State matrix" description="Each state keeps a visible label and helper copy so the field remains understandable outside app context.">
        <PreviewGrid minWidth={260}>
          <PreviewTile label="Empty" code={inputStyles()}>
            <InputField label="Hook" placeholder="e.g. Why most drafts fail before paragraph two" hint="Short copy helps scan the empty state." />
          </PreviewTile>
          <PreviewTile label="Filled" code={inputStyles()}>
            <InputField label="Slug" defaultValue="spring-launch-retrospective" hint="Default values show the resting state after hydration." />
          </PreviewTile>
          <PreviewTile label="Invalid" code={inputStyles({ invalid: true })}>
            <InputField label="Email" type="email" defaultValue="author@" invalid hint="Enter a complete email address." />
          </PreviewTile>
          <PreviewTile label="Disabled" code={inputStyles()}>
            <InputField label="Workspace" defaultValue="Founding team" disabled hint="Disabled fields still need context." />
          </PreviewTile>
        </PreviewGrid>
      </StorySection>
    </StoryPage>
  ),
};
