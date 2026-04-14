import { marked } from "marked";

type TemplateConfig = {
  schemaVersion?: string;
  titleStyle?: string;
  paragraphLength?: string;
  tone?: string;
  backgroundStyle?: string;
  emphasisStyle?: string;
  quoteStyle?: string;
  codeBlockStyle?: string;
  commandBlockStyle?: string;
  dividerStyle?: string;
  recommendationStyle?: string;
  identity?: {
    tone?: string;
    sourceExcerpt?: string;
  };
  layout?: {
    paragraphLength?: string;
    backgroundStyle?: string;
    dividerStyle?: string;
  };
  typography?: {
    titleStyle?: string;
    emphasisStyle?: string;
    quoteStyle?: string;
  };
  blocks?: {
    codeBlockStyle?: string;
    commandBlockStyle?: string;
    recommendationStyle?: string;
  };
  constraints?: {
    bannedWords?: string[];
    bannedPunctuation?: string[];
  };
};

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function getNestedString(template: TemplateConfig | null | undefined, section: "identity" | "layout" | "typography" | "blocks", key: string) {
  const nested = template?.[section];
  return nested && typeof nested === "object" && !Array.isArray(nested) ? readString((nested as Record<string, unknown>)[key]) : undefined;
}

function resolveTemplateStyles(template?: TemplateConfig | null) {
  const tone = getNestedString(template, "identity", "tone") || template?.tone;
  const titleVariant = getNestedString(template, "typography", "titleStyle") || template?.titleStyle;
  const paragraphLength = getNestedString(template, "layout", "paragraphLength") || template?.paragraphLength;
  const accentColor =
    tone === "降噪净化"
      ? "#166534"
      : tone === "留白专栏"
        ? "#8c6239"
        : "#92400e";
  const backgroundStyle = getNestedString(template, "layout", "backgroundStyle") || template?.backgroundStyle || "paper";
  const emphasisStyle = getNestedString(template, "typography", "emphasisStyle") || template?.emphasisStyle || "marker";
  const quoteStyle = getNestedString(template, "typography", "quoteStyle") || template?.quoteStyle || "note";
  const codeBlockStyle = getNestedString(template, "blocks", "codeBlockStyle") || template?.codeBlockStyle || "ink";
  const commandBlockStyle = getNestedString(template, "blocks", "commandBlockStyle") || template?.commandBlockStyle || "command";
  const dividerStyle = getNestedString(template, "layout", "dividerStyle") || template?.dividerStyle || "hairline";
  const recommendationStyle = getNestedString(template, "blocks", "recommendationStyle") || template?.recommendationStyle || "compact";

  const titleStyle =
    titleVariant === "serif"
      ? "font-family:'Noto Serif SC','Songti SC',serif;font-size:30px;font-weight:600;letter-spacing:0.01em;"
      : titleVariant === "sharp"
        ? "font-family:'PingFang SC','Helvetica Neue',sans-serif;font-size:28px;font-weight:700;letter-spacing:0.04em;text-transform:none;"
        : "font-family:'PingFang SC','Helvetica Neue',sans-serif;font-size:28px;font-weight:600;";

  const bodyStyle =
    paragraphLength === "long"
      ? "font-size:18px;line-height:1.72;"
      : paragraphLength === "medium"
        ? "font-size:17px;line-height:1.84;"
        : "font-size:16px;line-height:1.96;";

  const frameStyle =
    backgroundStyle === "scroll"
      ? "background:linear-gradient(180deg,#f8f3ea 0%,#fffaf2 100%);border:1px solid #e4d9c3;box-shadow:inset 0 1px 0 rgba(255,255,255,0.65);padding:32px 28px;"
      : backgroundStyle === "newsprint"
        ? "background:#fffdfa;border:1px solid #d8d2c7;box-shadow:0 10px 28px rgba(41,37,36,0.06);padding:28px 24px;"
        : "background:#fffefa;border:1px solid #e7e0d4;padding:28px 24px;";

  const heading2Style =
    titleVariant === "serif"
      ? `margin:36px 0 16px;font-family:'Noto Serif SC','Songti SC',serif;font-size:25px;line-height:1.5;color:#1b1c1a;border-bottom:1px solid rgba(140,98,57,0.22);padding-bottom:8px;`
      : `margin:32px 0 14px;font-size:24px;line-height:1.5;color:#1b1c1a;border-left:4px solid ${accentColor};padding-left:12px;`;

  const heading3Style =
    titleVariant === "serif"
      ? "margin:26px 0 12px;font-family:'Noto Serif SC','Songti SC',serif;font-size:20px;line-height:1.5;color:#3f3124;"
      : `margin:24px 0 10px;font-size:20px;line-height:1.5;color:#1b1c1a;letter-spacing:0.02em;`;

  const blockquoteStyle =
    quoteStyle === "editorial"
      ? "margin:22px 0;padding:18px 20px;border:1px solid #dccbb2;background:#fffaf2;color:#5f4b32;font-family:'Noto Serif SC','Songti SC',serif;"
      : quoteStyle === "news"
        ? `margin:20px 0;padding:14px 18px;border-left:4px solid ${accentColor};background:#fff7e8;color:#5f4b32;`
        : "margin:20px 0;padding:14px 18px;border-radius:12px;background:#f4f4f0;color:#4b5563;border:1px solid #e5e7eb;";

  const codeBlockSurfaceStyle =
    codeBlockStyle === "terminal"
      ? "margin:20px 0;padding:16px 18px;background:#111827;color:#d1fae5;overflow:auto;font-size:14px;line-height:1.7;border:1px solid #1f2937;border-radius:14px;"
      : codeBlockStyle === "soft"
        ? "margin:20px 0;padding:16px 18px;background:#f7f1e8;color:#3f3124;overflow:auto;font-size:14px;line-height:1.7;border:1px solid #e6d8c3;border-radius:14px;"
        : "margin:20px 0;padding:16px 18px;background:#171718;color:#f7f3eb;overflow:auto;font-size:14px;line-height:1.7;border-radius:14px;";

  const commandBlockSurfaceStyle =
    commandBlockStyle === "terminal"
      ? "margin:0;padding:16px 18px;background:#0b1220;color:#bbf7d0;overflow:auto;font-size:14px;line-height:1.7;border:1px solid #153a2b;border-radius:0 0 14px 14px;"
      : commandBlockStyle === "soft-command"
        ? "margin:0;padding:16px 18px;background:#f5efe4;color:#4a3728;overflow:auto;font-size:14px;line-height:1.7;border:1px solid #e3d3bc;border-top:none;border-radius:0 0 14px 14px;"
        : "margin:0;padding:16px 18px;background:#141414;color:#f5f5f4;overflow:auto;font-size:14px;line-height:1.7;border:1px solid #292524;border-top:none;border-radius:0 0 14px 14px;";

  const commandBlockWrapperStyle =
    commandBlockStyle === "terminal"
      ? "margin:22px 0;border-radius:14px;overflow:hidden;box-shadow:0 10px 20px rgba(3,7,18,0.18);"
      : "margin:22px 0;border-radius:14px;overflow:hidden;";

  const commandBlockLabelStyle =
    commandBlockStyle === "terminal"
      ? "padding:10px 16px;background:#052e1b;color:#86efac;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;"
      : commandBlockStyle === "soft-command"
        ? "padding:10px 16px;background:#ede0cd;color:#7c5a3c;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;"
        : "padding:10px 16px;background:#1c1917;color:#f5f5f4;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;";

  const inlineCodeStyle =
    codeBlockStyle === "soft"
      ? "font-family:'SFMono-Regular','Consolas',monospace;background:#f3e8d6;color:#7c2d12;padding:0.14em 0.38em;border-radius:6px;"
      : codeBlockStyle === "terminal"
        ? "font-family:'SFMono-Regular','Consolas',monospace;background:#ecfdf5;color:#166534;padding:0.14em 0.38em;border-radius:6px;"
        : "font-family:'SFMono-Regular','Consolas',monospace;background:#f5f5f4;color:#1f2937;padding:0.14em 0.38em;border-radius:6px;";

  const dividerMarkup =
    dividerStyle === "seal"
      ? `<div style="margin:32px auto;width:108px;height:1px;background:linear-gradient(90deg,rgba(140,98,57,0),rgba(140,98,57,0.9),rgba(140,98,57,0));"></div>`
      : dividerStyle === "dots"
        ? `<div style="margin:28px 0;text-align:center;color:${accentColor};letter-spacing:0.45em;font-size:12px;">● ● ●</div>`
        : `<hr style="margin:28px 0;border:none;border-top:1px solid rgba(146,64,14,0.18);" />`;

  const strongStyle =
    emphasisStyle === "underline"
      ? `font-weight:700;color:#1b1c1a;border-bottom:2px solid rgba(140,98,57,0.32);padding-bottom:1px;`
      : emphasisStyle === "badge"
        ? `font-weight:700;color:#14532d;background:#ecfdf5;border-radius:6px;padding:0.08em 0.4em;`
        : `font-weight:700;color:#1b1c1a;background:linear-gradient(180deg,rgba(255,255,255,0) 55%,rgba(245,208,117,0.42) 55%);padding:0 0.08em;`;

  const recommendationSectionStyle =
    recommendationStyle === "card"
      ? "margin-top:30px;padding:20px 22px;border:1px solid #dccbb2;background:#fff8ef;border-radius:18px;"
      : recommendationStyle === "checklist"
        ? "margin-top:30px;padding:18px 20px;border:1px dashed #86efac;background:#f0fdf4;border-radius:16px;"
        : "margin-top:28px;padding-top:20px;border-top:1px solid rgba(146,64,14,0.16);";

  return {
    accentColor,
    titleStyle,
    heading2Style,
    heading3Style,
    bodyStyle,
    frameStyle,
    blockquoteStyle,
    codeBlockSurfaceStyle,
    commandBlockSurfaceStyle,
    commandBlockWrapperStyle,
    commandBlockLabelStyle,
    inlineCodeStyle,
    dividerMarkup,
    strongStyle,
    recommendationSectionStyle,
  };
}

function renderCommandBlocks(html: string, styles: ReturnType<typeof resolveTemplateStyles>) {
  return html.replace(
    /<pre><code class="language-(bash|shell|sh|zsh|cmd|powershell)">([\s\S]*?)<\/code><\/pre>/gi,
    (_, language: string, content: string) => {
      return `<section style="${styles.commandBlockWrapperStyle}"><div style="${styles.commandBlockLabelStyle}">Command · ${language}</div><pre data-command-block="true" style="${styles.commandBlockSurfaceStyle}"><code class="language-${language}" style="${styles.inlineCodeStyle}">${content}</code></pre></section>`;
    },
  );
}

function wrapRecommendationSection(html: string, styles: ReturnType<typeof resolveTemplateStyles>) {
  return html.replace(
    /(<h[23][^>]*>[^<]*(?:推荐阅读|相关阅读|延伸阅读|推荐区|继续阅读)[^<]*<\/h[23]>)([\s\S]*)$/i,
    (_, heading: string, rest: string) => `<section style="${styles.recommendationSectionStyle}">${heading}${rest}</section>`,
  );
}

function applyContentTheme(html: string, styles: ReturnType<typeof resolveTemplateStyles>) {
  const commandAwareHtml = renderCommandBlocks(html, styles);
  const themedHtml = commandAwareHtml
    .replace(/<h2>/g, `<h2 style="${styles.heading2Style}">`)
    .replace(/<h3>/g, `<h3 style="${styles.heading3Style}">`)
    .replace(/<h4>/g, `<h4 style="margin:22px 0 10px;font-size:18px;line-height:1.5;color:#1b1c1a;">`)
    .replace(/<p>/g, `<p style="margin:0 0 18px;${styles.bodyStyle}color:#1b1c1a;">`)
    .replace(/<blockquote>/g, `<blockquote style="${styles.blockquoteStyle}">`)
    .replace(/<pre>/g, `<pre style="${styles.codeBlockSurfaceStyle}">`)
    .replace(/<code(\s+class="[^"]+")?>/g, (_match, className = "") => `<code${className} style="${styles.inlineCodeStyle}">`)
    .replace(/<ul>/g, `<ul style="margin:0 0 18px;padding-left:24px;${styles.bodyStyle}color:#1b1c1a;">`)
    .replace(/<ol>/g, `<ol style="margin:0 0 18px;padding-left:24px;${styles.bodyStyle}color:#1b1c1a;">`)
    .replace(/<li>/g, `<li style="margin:0 0 10px;">`)
    .replace(/<hr\s*\/?>/g, styles.dividerMarkup)
    .replace(/<strong>/g, `<strong style="${styles.strongStyle}">`)
    .replace(/<em>/g, `<em style="font-style:italic;color:${styles.accentColor};">`);

  return wrapRecommendationSection(themedHtml, styles);
}

export async function renderMarkdownToHtml(
  markdown: string,
  options?: {
    title?: string | null;
    template?: TemplateConfig | null;
  },
) {
  const html = await marked.parse(markdown);
  const styles = resolveTemplateStyles(options?.template);
  const themedContent = applyContentTheme(html, styles);
  const title = String(options?.title || "").trim();
  return `
    <section style="max-width:760px;margin:0 auto;padding:24px 0;">
      <article style="${styles.frameStyle}font-family:'PingFang SC','Noto Serif SC',serif;color:#1b1c1a;">
        ${title ? `<h1 style="${styles.titleStyle}line-height:1.4;margin:0 0 24px;color:#1b1c1a;">${escapeHtml(title)}</h1>` : ""}
        ${themedContent}
      </article>
    </section>
  `;
}

export async function renderMarkdownToWechatHtml(markdown: string, title: string, template?: TemplateConfig | null) {
  return renderMarkdownToHtml(markdown, {
    title,
    template,
  });
}

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
