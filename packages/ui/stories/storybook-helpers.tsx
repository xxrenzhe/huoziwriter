import type { CSSProperties, ReactNode } from "react";

const previewFoundationCss = String.raw`
.ui-story-page {
  min-height: 100vh;
  background: #faf9f5;
  color: #1b1c1a;
  padding: 32px;
  font-family: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif;
}

.ui-story-shell {
  max-width: 1200px;
  margin: 0 auto;
  display: grid;
  gap: 32px;
}

.ui-story-section {
  display: grid;
  gap: 16px;
}

.ui-story-kicker {
  font-size: 12px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #a73032;
}

.ui-story-title {
  margin: 0;
  font-size: clamp(2rem, 4vw, 2.75rem);
  line-height: 1.1;
  font-family: "Noto Serif SC", "Songti SC", serif;
}

.ui-story-body {
  margin: 0;
  max-width: 760px;
  font-size: 16px;
  line-height: 1.7;
  color: #645e54;
}

.ui-story-section-title {
  margin: 0;
  font-size: 24px;
  line-height: 1.2;
  font-family: "Noto Serif SC", "Songti SC", serif;
}

.ui-story-section-body {
  margin: 0;
  max-width: 760px;
  font-size: 15px;
  line-height: 1.7;
  color: #645e54;
}

.ui-story-grid {
  display: grid;
  gap: 12px;
}

.ui-story-preview {
  min-width: 0;
  display: grid;
  gap: 16px;
  padding: 20px;
  background: rgba(255, 255, 255, 0.82);
  border: 1px solid rgba(88, 65, 64, 0.16);
  box-shadow: 0 4px 20px rgba(27, 28, 26, 0.06);
}

.ui-story-preview-top {
  display: grid;
  gap: 6px;
}

.ui-story-preview-label {
  font-size: 12px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #645e54;
}

.ui-story-preview-description {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: #645e54;
}

.ui-story-preview-body {
  display: grid;
  gap: 12px;
}

.ui-story-stack {
  display: grid;
  gap: 12px;
}

.ui-story-inline {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}

.ui-story-code {
  display: block;
  padding: 12px;
  background: #ffffff;
  border: 1px solid rgba(88, 65, 64, 0.12);
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: ui-monospace, "SFMono-Regular", "SF Mono", Consolas, "Liberation Mono", Menlo, monospace;
}

.ui-story-field {
  display: grid;
  gap: 8px;
  max-width: 440px;
}

.ui-story-field-label {
  font-size: 14px;
  line-height: 1.5;
  color: #1b1c1a;
}

.ui-story-field-hint {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: #645e54;
}

.ui-story-icon {
  display: inline-block;
  width: 1em;
  height: 1em;
  flex: none;
}

[data-ui-preview="button"] > button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px solid transparent;
  white-space: nowrap;
  font: inherit;
  font-weight: 500;
  line-height: 1;
  border-radius: 0;
  transition:
    background-color 200ms ease,
    border-color 200ms ease,
    color 200ms ease,
    opacity 200ms ease;
  cursor: pointer;
}

[data-ui-preview="button"] > button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

[data-ui-preview="button"] > button[aria-busy="true"] svg {
  animation: ui-story-spin 1s linear infinite;
}

[data-ui-preview="button"][data-size="sm"] > button {
  min-height: 40px;
  padding: 8px 12px;
  font-size: 14px;
}

[data-ui-preview="button"][data-size="md"] > button {
  min-height: 44px;
  padding: 12px 16px;
  font-size: 14px;
}

[data-ui-preview="button"][data-size="lg"] > button {
  min-height: 48px;
  padding: 14px 20px;
  font-size: 14px;
}

[data-ui-preview="button"][data-variant="primary"] > button {
  background: #a73032;
  border-color: #a73032;
  color: #ffffff;
}

[data-ui-preview="button"][data-variant="secondary"] > button {
  background: #ffffff;
  border-color: #d6d3d1;
  color: #57534e;
}

[data-ui-preview="button"][data-variant="ghost"] > button {
  background: transparent;
  border-color: transparent;
  color: #57534e;
}

[data-ui-preview="button"][data-variant="danger"] > button {
  background: #8f3136;
  border-color: #8f3136;
  color: #ffffff;
}

[data-ui-preview="button"][data-variant="link"] > button {
  min-height: auto;
  padding: 0;
  background: transparent;
  border-color: transparent;
  color: #a73032;
}

[data-ui-preview="button"][data-full-width="true"] > button {
  width: 100%;
}

[data-ui-preview="button"] > button svg {
  width: 16px;
  height: 16px;
}

[data-ui-preview="card"] > div {
  min-width: 0;
  border: 1px solid rgba(88, 65, 64, 0.16);
  box-shadow: 0 4px 20px rgba(27, 28, 26, 0.06);
}

[data-ui-preview="card"][data-tone="default"] > div {
  background: #ffffff;
}

[data-ui-preview="card"][data-tone="subtle"] > div {
  background: rgba(255, 255, 255, 0.72);
}

[data-ui-preview="card"][data-tone="warm"] > div {
  background: #faf7f0;
}

[data-ui-preview="card"][data-tone="highlight"] > div {
  background: #fffdfa;
  border-color: #dfd2b0;
}

[data-ui-preview="card"][data-tone="warning"] > div {
  background: #fff8e8;
  border-color: #dfd2b0;
}

[data-ui-preview="card"][data-tone="success"] > div {
  background: #ecfdf5;
  border-color: #a7f3d0;
}

[data-ui-preview="card"][data-padding="sm"] > div {
  padding: 16px;
}

[data-ui-preview="card"][data-padding="md"] > div {
  padding: 20px;
}

[data-ui-preview="card"][data-padding="lg"] > div {
  padding: 24px;
}

[data-ui-preview="card"][data-interactive="true"] > div {
  cursor: pointer;
  transition:
    background-color 200ms ease,
    border-color 200ms ease;
}

[data-ui-preview="field"] > input,
[data-ui-preview="field"] > textarea,
[data-ui-preview="field"] > select {
  width: 100%;
  border: 1px solid #d6d3d1;
  background: #ffffff;
  color: #1b1c1a;
  padding: 12px 16px;
  font: inherit;
  font-size: 14px;
  line-height: 1.5;
  border-radius: 0;
  box-sizing: border-box;
}

[data-ui-preview="field"] > input,
[data-ui-preview="field"] > select {
  min-height: 44px;
}

[data-ui-preview="field"] > textarea {
  min-height: 96px;
  line-height: 1.75;
  resize: vertical;
}

[data-ui-preview="field"][data-invalid="true"] > input,
[data-ui-preview="field"][data-invalid="true"] > textarea,
[data-ui-preview="field"][data-invalid="true"] > select {
  border-color: #a73032;
}

[data-ui-preview="field"] > select {
  appearance: none;
  background-image:
    linear-gradient(45deg, transparent 50%, #645e54 50%),
    linear-gradient(135deg, #645e54 50%, transparent 50%);
  background-position:
    calc(100% - 18px) calc(50% - 2px),
    calc(100% - 12px) calc(50% - 2px);
  background-size: 6px 6px;
  background-repeat: no-repeat;
  padding-right: 40px;
}

[data-ui-preview="field"] > input:disabled,
[data-ui-preview="field"] > textarea:disabled,
[data-ui-preview="field"] > select:disabled {
  cursor: not-allowed;
  opacity: 0.6;
  background: #f5f3f0;
}

@keyframes ui-story-spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}
`;

type StoryPageProps = {
  title: string;
  description: string;
  eyebrow?: string;
  children: ReactNode;
};

export function StoryPage({
  title,
  description,
  eyebrow = "Core primitives",
  children,
}: StoryPageProps) {
  return (
    <div className="ui-story-page">
      <style>{previewFoundationCss}</style>
      <div className="ui-story-shell">
        <section className="ui-story-section">
          <div className="ui-story-kicker">{eyebrow}</div>
          <h1 className="ui-story-title">{title}</h1>
          <p className="ui-story-body">{description}</p>
        </section>
        {children}
      </div>
    </div>
  );
}

type StorySectionProps = {
  title: string;
  description?: string;
  children: ReactNode;
};

export function StorySection({ title, description, children }: StorySectionProps) {
  return (
    <section className="ui-story-section">
      <h2 className="ui-story-section-title">{title}</h2>
      {description ? <p className="ui-story-section-body">{description}</p> : null}
      {children}
    </section>
  );
}

type PreviewGridProps = {
  children: ReactNode;
  minWidth?: number;
};

export function PreviewGrid({ children, minWidth = 240 }: PreviewGridProps) {
  return (
    <div
      className="ui-story-grid"
      style={
        {
          gridTemplateColumns: `repeat(auto-fit, minmax(${minWidth}px, 1fr))`,
        } satisfies CSSProperties
      }
    >
      {children}
    </div>
  );
}

type PreviewTileProps = {
  label: string;
  description?: string;
  code?: string;
  children: ReactNode;
};

export function PreviewTile({ label, description, code, children }: PreviewTileProps) {
  return (
    <article className="ui-story-preview">
      <div className="ui-story-preview-top">
        <div className="ui-story-preview-label">{label}</div>
        {description ? <p className="ui-story-preview-description">{description}</p> : null}
      </div>
      <div className="ui-story-preview-body">
        {children}
        {code ? <code className="ui-story-code">{code}</code> : null}
      </div>
    </article>
  );
}
