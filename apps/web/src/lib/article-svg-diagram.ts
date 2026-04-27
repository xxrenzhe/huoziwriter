import type { ArticleVisualBrief } from "./article-visual-types";

function escapeXml(value: string) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function paletteColors(palette: string | null | undefined) {
  if (palette === "warm") return { bg: "#fff7ed", stroke: "#9a3412", fill: "#fed7aa", text: "#431407" };
  if (palette === "mono") return { bg: "#f8fafc", stroke: "#334155", fill: "#e2e8f0", text: "#0f172a" };
  if (palette === "duotone") return { bg: "#eff6ff", stroke: "#1d4ed8", fill: "#bfdbfe", text: "#172554" };
  return { bg: "#f0f9ff", stroke: "#0369a1", fill: "#bae6fd", text: "#082f49" };
}

export function sanitizeGeneratedSvg(svg: string) {
  return String(svg || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "")
    .replace(/\s(?:href|xlink:href)\s*=\s*"https?:\/\/[^"]*"/gi, "")
    .replace(/\s(?:href|xlink:href)\s*=\s*'https?:\/\/[^']*'/gi, "");
}

export function buildArticleDiagramSvg(brief: ArticleVisualBrief) {
  const colors = paletteColors(brief.paletteCode);
  const labels = (brief.labels.length ? brief.labels : [brief.title, brief.purpose, ...brief.sourceFacts])
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, brief.visualType === "timeline" ? 5 : 4);
  const width = brief.aspectRatio === "16:9" ? 1280 : 900;
  const height = brief.aspectRatio === "16:9" ? 720 : 1200;
  const title = escapeXml(brief.title);
  const subtitle = escapeXml(brief.purpose);
  const cardWidth = brief.visualType === "timeline" ? Math.floor((width - 180) / Math.max(labels.length, 1)) : width - 160;
  const cardHeight = 110;
  const body = labels.map((label, index) => {
    if (brief.visualType === "timeline") {
      const x = 90 + index * cardWidth;
      const y = Math.floor(height * 0.48);
      const cx = x + Math.floor(cardWidth / 2);
      return `
        <circle cx="${cx}" cy="${y}" r="18" fill="${colors.stroke}" />
        <rect x="${x + 8}" y="${y + 42}" width="${cardWidth - 16}" height="${cardHeight}" rx="24" fill="${colors.fill}" stroke="${colors.stroke}" stroke-width="3" />
        <text x="${cx}" y="${y + 102}" text-anchor="middle" font-size="28" fill="${colors.text}">${escapeXml(label.slice(0, 14))}</text>
      `;
    }
    const x = 80;
    const y = 250 + index * 160;
    return `
      <rect x="${x}" y="${y}" width="${cardWidth}" height="${cardHeight}" rx="28" fill="${colors.fill}" stroke="${colors.stroke}" stroke-width="3" />
      <text x="${x + 46}" y="${y + 68}" font-size="34" fill="${colors.text}">${index + 1}. ${escapeXml(label.slice(0, 22))}</text>
      ${index < labels.length - 1 ? `<path d="M ${width / 2} ${y + cardHeight + 12} L ${width / 2} ${y + 144}" stroke="${colors.stroke}" stroke-width="5" stroke-linecap="round" />` : ""}
    `;
  }).join("\n");

  return sanitizeGeneratedSvg(`
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="${colors.bg}" />
  <text x="80" y="105" font-size="48" font-weight="700" fill="${colors.text}">${title.slice(0, 24)}</text>
  <text x="80" y="160" font-size="28" fill="${colors.stroke}">${subtitle.slice(0, 34)}</text>
  ${brief.visualType === "timeline" ? `<path d="M 100 ${Math.floor(height * 0.48)} L ${width - 100} ${Math.floor(height * 0.48)}" stroke="${colors.stroke}" stroke-width="5" stroke-linecap="round" />` : ""}
  ${body}
</svg>`);
}

export function svgToDataUrl(svg: string) {
  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}
