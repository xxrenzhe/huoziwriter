import type { ArticleVisualBrief } from "./article-visual-types";

function escapeXml(value: string) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function paletteColors(palette: string | null | undefined) {
  if (palette === "warm") return { bg: "#fff7ed", stroke: "#9a3412", fill: "#fed7aa", soft: "#ffedd5", text: "#431407", muted: "#7c2d12" };
  if (palette === "mono") return { bg: "#f8fafc", stroke: "#334155", fill: "#e2e8f0", soft: "#f1f5f9", text: "#0f172a", muted: "#475569" };
  if (palette === "duotone") return { bg: "#eff6ff", stroke: "#1d4ed8", fill: "#bfdbfe", soft: "#dbeafe", text: "#172554", muted: "#1e40af" };
  return { bg: "#f0f9ff", stroke: "#0369a1", fill: "#bae6fd", soft: "#e0f2fe", text: "#082f49", muted: "#075985" };
}

export function sanitizeGeneratedSvg(svg: string) {
  return String(svg || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "")
    .replace(/\s(?:href|xlink:href)\s*=\s*"https?:\/\/[^"]*"/gi, "")
    .replace(/\s(?:href|xlink:href)\s*=\s*'https?:\/\/[^']*'/gi, "");
}

function stripMarkdown(value: string) {
  return String(value || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*]\([^)]+\)/g, " ")
    .replace(/\[[^\]]+]\([^)]+\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/[*_>~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function removeAsciiParentheticals(value: string) {
  return value
    .replace(/[（(]\s*[A-Za-z0-9][A-Za-z0-9\s._/-]{0,48}\s*[）)]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function hasBrokenParentheses(value: string) {
  const open = (value.match(/[（(]/g) || []).length;
  const close = (value.match(/[）)]/g) || []).length;
  return open !== close;
}

function normalizeConcept(value: string) {
  const normalized = removeAsciiParentheticals(stripMarkdown(value))
    .replace(/[“”"']/g, "")
    .replace(/\s*[,，。；;：:！!？?]\s*$/g, "")
    .replace(/^(而?不只是|不是|它不是|该分数由|该指标由|该工具由|由|于|是|把|将|让|用|当|如果|因为|所以|但是|同时|以及|其中|一个|一些|这个|那个)/, "")
    .replace(/^(Google|Ads|Quality|Score)\b/i, "")
    .replace(/\s+/g, " ")
    .trim();
  return normalized;
}

function isUsableConcept(value: string) {
  const normalized = normalizeConcept(value);
  if (!normalized || hasBrokenParentheses(value)) return false;
  if (normalized.length < 2 || normalized.length > 16) return false;
  if (/^[A-Za-z0-9\s._/-]+$/.test(normalized)) return false;
  if (/^(Google|Ads|Quality|Score|组成部分|高于平均水平|平均水平|低于平均水平|它不是|而不只是|该分数)$/i.test(normalized)) return false;
  if (/分值范围|搜索广告系列|^级|^\d+$|^它不$|不作为|也不作为/.test(normalized)) return false;
  if (/来源|链接|页面说明|登录|注册|抓取失败/i.test(normalized)) return false;
  return /[\p{Script=Han}]/u.test(normalized);
}

function conceptScore(value: string) {
  let score = 0;
  if (/搜索意图|质量得分|质量分|预期点击率|广告相关性|落地页体验/.test(value)) score += 8;
  if (/关键词|出价|文案|竞争强度|匹配|诊断工具|绩效指标|竞价/.test(value)) score += 4;
  if (/核心|变量|阶段|路径|流程|模型|策略|风险|转化|出单/.test(value)) score += 3;
  if (/不只是|不是|不作为|而不|它不/.test(value)) score -= 5;
  if (value.length <= 8) score += 1;
  return score;
}

function conceptCandidates(text: string) {
  const normalized = removeAsciiParentheticals(stripMarkdown(text));
  const conceptSuffixes = [
    "意图",
    "关键词",
    "搜索词",
    "质量分",
    "质量得分",
    "点击率",
    "相关性",
    "落地页体验",
    "体验",
    "指标",
    "工具",
    "匹配",
    "查询",
    "竞价",
    "预算",
    "成本",
    "收益",
    "流量",
    "价值",
    "变量",
    "文案",
    "强度",
    "阶段",
    "路径",
    "模型",
    "流程",
    "风险",
    "策略",
    "案例",
    "冲突",
    "转化",
    "出单",
  ];
  const suffixPattern = new RegExp(`[\\p{Script=Han}A-Za-z0-9]{2,12}(?:${conceptSuffixes.join("|")})`, "gu");
  const phrases = [
    ...(normalized.match(suffixPattern) || []),
    ...normalized.split(/[，。；;：:！!？?、]|和|或|与|及|以及|并|也|则|是/g),
  ];
  return phrases.map(normalizeConcept).filter(isUsableConcept);
}

function uniqueConcepts(values: string[]) {
  const seen = new Set<string>();
  const concepts: string[] = [];
  for (const value of values) {
    const normalized = normalizeConcept(value);
    if (!isUsableConcept(normalized)) continue;
    const key = normalized.replace(/\s+/g, "").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    concepts.push(normalized);
  }
  return concepts;
}

function pickDisplayLabels(brief: ArticleVisualBrief) {
  const directLabels = uniqueConcepts(brief.labels);
  const extracted = uniqueConcepts([
    ...brief.sourceFacts.flatMap(conceptCandidates),
    ...conceptCandidates(brief.title),
    ...conceptCandidates(brief.purpose),
  ]);
  const labels = uniqueConcepts([...directLabels, ...extracted])
    .filter((label) => !/^搜索广告投放中$/.test(label))
    .map((label, index) => ({ label, index, score: conceptScore(label) }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map((item) => item.label)
    .slice(0, brief.visualType === "timeline" ? 5 : 4);
  if (labels.length > 0) return labels;
  return uniqueConcepts([brief.title, brief.purpose, ...brief.sourceFacts]).slice(0, brief.visualType === "timeline" ? 5 : 4);
}

function textUnits(value: string) {
  let total = 0;
  for (const char of Array.from(value)) {
    total += /[\x00-\x7F]/.test(char) ? 0.55 : 1;
  }
  return total;
}

function wrapText(value: string, maxUnits: number, maxLines: number) {
  const text = normalizeConcept(value);
  const lines: string[] = [];
  let current = "";
  for (const char of Array.from(text)) {
    if (current && textUnits(current + char) > maxUnits) {
      lines.push(current.trim());
      current = char;
      if (lines.length === maxLines) break;
    } else {
      current += char;
    }
  }
  if (lines.length < maxLines && current.trim()) {
    lines.push(current.trim());
  }
  const consumed = lines.join("");
  if (text.replace(/\s+/g, "").length > consumed.replace(/\s+/g, "").length && lines.length > 0) {
    const last = lines[lines.length - 1];
    lines[lines.length - 1] = `${last.slice(0, Math.max(1, last.length - 1))}...`;
  }
  return lines.length ? lines : [""];
}

function textBlock(input: {
  x: number;
  y: number;
  lines: string[];
  fontSize: number;
  fill: string;
  weight?: number;
  anchor?: "start" | "middle";
  lineHeight?: number;
}) {
  const lineHeight = input.lineHeight ?? Math.round(input.fontSize * 1.28);
  const tspans = input.lines
    .map((line, index) => `<tspan x="${input.x}" dy="${index === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`)
    .join("");
  return `<text x="${input.x}" y="${input.y}" text-anchor="${input.anchor || "start"}" font-size="${input.fontSize}"${input.weight ? ` font-weight="${input.weight}"` : ""} fill="${input.fill}">${tspans}</text>`;
}

function pickFocusLabel(brief: ArticleVisualBrief, labels: string[]) {
  const combined = [brief.title, brief.purpose, ...brief.sourceFacts, ...labels].join(" ");
  const concepts = conceptCandidates(combined);
  return concepts.find((item) => /意图|质量得分|质量分|核心|变量|路径|流程|模型|策略|指标/.test(item)) || labels[0] || brief.title;
}

function buildTimelineBody(input: {
  labels: string[];
  width: number;
  height: number;
  colors: ReturnType<typeof paletteColors>;
}) {
  const { labels, width, height, colors } = input;
  const cardWidth = Math.floor((width - 180) / Math.max(labels.length, 1));
  const y = Math.floor(height * 0.48);
  return `
    <path d="M 100 ${y} L ${width - 100} ${y}" stroke="${colors.stroke}" stroke-width="5" stroke-linecap="round" opacity="0.85" />
    ${labels.map((label, index) => {
      const x = 90 + index * cardWidth;
      const cx = x + Math.floor(cardWidth / 2);
      const lines = wrapText(label, width > 1000 ? 9 : 7, 2);
      return `
        <circle cx="${cx}" cy="${y}" r="22" fill="${colors.stroke}" />
        <text x="${cx}" y="${y + 9}" text-anchor="middle" font-size="24" font-weight="700" fill="#ffffff">${index + 1}</text>
        <rect x="${x + 8}" y="${y + 48}" width="${cardWidth - 16}" height="128" rx="22" fill="${colors.fill}" stroke="${colors.stroke}" stroke-width="3" />
        ${textBlock({ x: cx, y: y + 103, lines, fontSize: 24, fill: colors.text, weight: 700, anchor: "middle" })}
      `;
    }).join("\n")}
  `;
}

function buildFrameworkBody(input: {
  brief: ArticleVisualBrief;
  labels: string[];
  width: number;
  colors: ReturnType<typeof paletteColors>;
}) {
  const { brief, labels, width, colors } = input;
  const focus = wrapText(pickFocusLabel(brief, labels), width > 1000 ? 12 : 9, 2);
  const cardWidth = width > 1000 ? 480 : 350;
  const cardHeight = width > 1000 ? 150 : 180;
  const leftX = width > 1000 ? 110 : 70;
  const rightX = width - leftX - cardWidth;
  const topY = width > 1000 ? 360 : 470;
  const rowGap = width > 1000 ? 185 : 230;
  const centerX = Math.floor(width / 2);
  const centerY = width > 1000 ? 292 : 335;
  const positions = [
    { x: leftX, y: topY },
    { x: rightX, y: topY },
    { x: leftX, y: topY + rowGap },
    { x: rightX, y: topY + rowGap },
  ];
  return `
    <circle cx="${centerX}" cy="${centerY}" r="${width > 1000 ? 86 : 92}" fill="${colors.stroke}" opacity="0.96" />
    <circle cx="${centerX}" cy="${centerY}" r="${width > 1000 ? 112 : 120}" fill="none" stroke="${colors.stroke}" stroke-width="3" opacity="0.24" />
    ${textBlock({ x: centerX, y: centerY - (focus.length > 1 ? 10 : 0), lines: focus, fontSize: width > 1000 ? 28 : 30, fill: "#ffffff", weight: 800, anchor: "middle", lineHeight: 36 })}
    ${positions.map((position, index) => {
      const label = labels[index] || labels[0] || brief.title;
      const lines = wrapText(label, width > 1000 ? 13 : 10, 2);
      const badgeX = position.x + 34;
      const badgeY = position.y + 44;
      const cardCenterX = position.x + cardWidth / 2;
      const cardCenterY = position.y + cardHeight / 2;
      return `
        <path d="M ${centerX} ${centerY + 114} C ${centerX} ${cardCenterY - 60}, ${cardCenterX} ${cardCenterY - 60}, ${cardCenterX} ${position.y}" fill="none" stroke="${colors.stroke}" stroke-width="3" opacity="0.24" />
        <rect x="${position.x}" y="${position.y}" width="${cardWidth}" height="${cardHeight}" rx="24" fill="#ffffff" stroke="${colors.stroke}" stroke-width="3" />
        <circle cx="${badgeX}" cy="${badgeY}" r="25" fill="${colors.fill}" stroke="${colors.stroke}" stroke-width="3" />
        <text x="${badgeX}" y="${badgeY + 9}" text-anchor="middle" font-size="24" font-weight="800" fill="${colors.text}">${index + 1}</text>
        <rect x="${position.x + cardWidth - 92}" y="${position.y + 24}" width="52" height="8" rx="4" fill="${colors.fill}" />
        <rect x="${position.x + cardWidth - 72}" y="${position.y + 42}" width="32" height="8" rx="4" fill="${colors.stroke}" opacity="0.5" />
        ${textBlock({ x: position.x + 76, y: position.y + 64, lines, fontSize: width > 1000 ? 28 : 30, fill: colors.text, weight: 800, lineHeight: width > 1000 ? 34 : 38 })}
        <text x="${position.x + 76}" y="${position.y + cardHeight - 38}" font-size="${width > 1000 ? 20 : 22}" fill="${colors.muted}">${escapeXml(index === 0 ? "先判断" : index === 1 ? "再校验" : index === 2 ? "看证据" : "做取舍")}</text>
      `;
    }).join("\n")}
  `;
}

export function buildArticleDiagramSvg(brief: ArticleVisualBrief) {
  const colors = paletteColors(brief.paletteCode);
  const labels = pickDisplayLabels(brief);
  const width = brief.aspectRatio === "16:9" ? 1280 : 900;
  const height = brief.aspectRatio === "16:9" ? 720 : 1200;
  const titleLines = wrapText(brief.title, width > 1000 ? 30 : 18, 2);
  const subtitleLines = wrapText(brief.purpose, width > 1000 ? 42 : 23, 2);
  const body = brief.visualType === "timeline"
    ? buildTimelineBody({ labels, width, height, colors })
    : buildFrameworkBody({ brief, labels, width, colors });

  return sanitizeGeneratedSvg(`
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="${colors.bg}" />
  <rect x="${width > 1000 ? 72 : 56}" y="${width > 1000 ? 56 : 58}" width="${width > 1000 ? width - 144 : width - 112}" height="${width > 1000 ? 196 : 220}" rx="32" fill="${colors.soft}" stroke="${colors.stroke}" stroke-width="3" opacity="0.95" />
  <rect x="${width > 1000 ? 96 : 82}" y="${width > 1000 ? 86 : 92}" width="12" height="${width > 1000 ? 112 : 128}" rx="6" fill="${colors.stroke}" />
  ${textBlock({ x: width > 1000 ? 128 : 112, y: width > 1000 ? 122 : 130, lines: titleLines, fontSize: width > 1000 ? 42 : 40, fill: colors.text, weight: 800, lineHeight: width > 1000 ? 50 : 48 })}
  ${textBlock({ x: width > 1000 ? 128 : 112, y: width > 1000 ? 212 : 236, lines: subtitleLines, fontSize: width > 1000 ? 23 : 24, fill: colors.muted, weight: 600, lineHeight: 30 })}
  ${body}
</svg>`);
}

export function svgToDataUrl(svg: string) {
  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}
