import { marked } from "marked";

export async function renderMarkdownToHtml(markdown: string) {
  const html = await marked.parse(markdown);
  return `<article style="font-family:'PingFang SC','Noto Serif SC',serif;line-height:1.8;color:#1b1c1a;font-size:16px;">${html}</article>`;
}

type WechatTemplateConfig = {
  titleStyle?: string;
  paragraphLength?: string;
};

function resolveWechatTemplateStyles(template?: WechatTemplateConfig | null) {
  const titleStyle =
    template?.titleStyle === "serif"
      ? "font-family:'Noto Serif SC','Songti SC',serif;font-size:30px;font-weight:600;"
      : template?.titleStyle === "sharp"
        ? "font-family:'PingFang SC','Helvetica Neue',sans-serif;font-size:28px;font-weight:700;letter-spacing:0.04em;text-transform:none;"
        : "font-family:'PingFang SC','Helvetica Neue',sans-serif;font-size:28px;font-weight:600;";

  const bodyStyle =
    template?.paragraphLength === "long"
      ? "font-size:18px;line-height:1.72;"
      : template?.paragraphLength === "medium"
        ? "font-size:17px;line-height:1.84;"
        : "font-size:16px;line-height:1.96;";

  return {
    titleStyle,
    bodyStyle,
  };
}

export async function renderMarkdownToWechatHtml(markdown: string, title: string, template?: WechatTemplateConfig | null) {
  const content = await renderMarkdownToHtml(markdown);
  const styles = resolveWechatTemplateStyles(template);
  const themedContent = content.replace(
    "font-family:'PingFang SC','Noto Serif SC',serif;line-height:1.8;color:#1b1c1a;font-size:16px;",
    `font-family:'PingFang SC','Noto Serif SC',serif;color:#1b1c1a;${styles.bodyStyle}`,
  );
  return `
    <section style="max-width:720px;margin:0 auto;padding:24px 0;">
      <h1 style="${styles.titleStyle}line-height:1.4;margin:0 0 24px;color:#1b1c1a;">${escapeHtml(title)}</h1>
      ${themedContent}
    </section>
  `;
}

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
