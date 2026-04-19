import { useId } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { Select, selectStyles, type SelectProps } from "../src";
import { PreviewGrid, PreviewTile, StoryPage, StorySection } from "./storybook-helpers";

function SelectField({
  label,
  hint,
  invalid = false,
  children,
  ...props
}: SelectProps & {
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
        <Select {...props} id={fieldId} invalid={invalid}>
          {children}
        </Select>
      </div>
      {hint ? <p className="ui-story-field-hint">{hint}</p> : null}
    </div>
  );
}

const meta = {
  title: "Primitives/Select",
  component: Select,
  tags: ["autodocs"],
  args: {
    defaultValue: "outline",
    invalid: false,
    disabled: false,
  } satisfies Partial<SelectProps>,
} satisfies Meta<typeof Select>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => (
    <StoryPage
      title="Select primitive"
      description="Single-select dropdown coverage for filters, settings, and workflow-step selection."
    >
      <StorySection title="Playground" description="Use controls to inspect the base select shell and invalid treatment with a realistic option list.">
        <PreviewTile
          label="Select field"
          description="The sample mirrors a common writer workflow choice without depending on application data."
          code={selectStyles({ invalid: args.invalid })}
        >
          <SelectField {...args} label="Primary workflow" hint="Keep option labels explicit and consistent across writer/admin flows.">
            <option value="outline">Outline</option>
            <option value="draft">Draft</option>
            <option value="review">Review</option>
          </SelectField>
        </PreviewTile>
      </StorySection>
    </StoryPage>
  ),
};

export const States: Story = {
  render: () => (
    <StoryPage
      title="Select states"
      description="Filled, invalid, and disabled examples cover the main dropdown conditions exposed by the primitive."
    >
      <StorySection title="State matrix" description="These examples keep the option list stable so visual review stays focused on field state.">
        <PreviewGrid minWidth={260}>
          <PreviewTile label="Resting" code={selectStyles()}>
            <SelectField label="Stage" defaultValue="intake" hint="A neutral select should read as a normal form control.">
              <option value="intake">Intake</option>
              <option value="research">Research</option>
              <option value="publish">Publish</option>
            </SelectField>
          </PreviewTile>
          <PreviewTile label="Invalid" code={selectStyles({ invalid: true })}>
            <SelectField label="Risk level" defaultValue="" invalid hint="Pick one explicit escalation path.">
              <option value="">Choose a level</option>
              <option value="monitor">Monitor</option>
              <option value="block">Block</option>
            </SelectField>
          </PreviewTile>
          <PreviewTile label="Disabled" code={selectStyles()}>
            <SelectField label="Schedule" defaultValue="queued" disabled hint="Disabled selects still need visible context and a readable selected value.">
              <option value="queued">Queued</option>
              <option value="running">Running</option>
              <option value="done">Done</option>
            </SelectField>
          </PreviewTile>
        </PreviewGrid>
      </StorySection>
    </StoryPage>
  ),
};
