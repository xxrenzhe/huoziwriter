import fs from "node:fs";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, PDFPage, degrees, rgb } from "pdf-lib";

const FONT_CANDIDATES = [
  "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
  "/System/Library/Fonts/Supplemental/Songti.ttc",
  "/System/Library/Fonts/Hiragino Sans GB.ttc",
  "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
  "/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc",
  "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
];

function resolvePdfFontPath() {
  return FONT_CANDIDATES.find((candidate) => fs.existsSync(candidate)) ?? null;
}

function wrapText(text: string, maxWidth: number, measure: (value: string) => number) {
  const rawLines = text.split("\n");
  const wrapped: string[] = [];

  for (const rawLine of rawLines) {
    if (!rawLine.trim()) {
      wrapped.push("");
      continue;
    }

    let current = "";
    for (const char of rawLine) {
      const next = current + char;
      if (measure(next) <= maxWidth) {
        current = next;
        continue;
      }
      if (current) {
        wrapped.push(current);
      }
      current = char;
    }
    wrapped.push(current);
  }

  return wrapped;
}

export async function renderDocumentPdf(input: {
  title: string;
  markdownContent: string;
  updatedAt: string;
  authorName?: string | null;
  watermarkText?: string | null;
}) {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  const fontPath = resolvePdfFontPath();
  if (!fontPath) {
    throw new Error("当前环境缺少可用的中文字库，无法导出 PDF");
  }

  const fontBytes = fs.readFileSync(fontPath);
  const font = await pdfDoc.embedFont(fontBytes, { subset: true });

  const pages: PDFPage[] = [];
  let page = pdfDoc.addPage([595.28, 841.89]);
  pages.push(page);
  const marginX = 52;
  const topY = 738;
  const bottomY = 56;
  const lineHeight = 22;
  const contentWidth = page.getWidth() - marginX * 2;
  const titleSize = 22;
  const bodySize = 12.5;
  let cursorY = topY;

  const addPage = () => {
    page = pdfDoc.addPage([595.28, 841.89]);
    pages.push(page);
    cursorY = topY;
  };

  const drawBodyLine = (line: string) => {
    if (cursorY <= bottomY) {
      addPage();
    }
    const trimmed = line.trim();
    if (!trimmed) {
      cursorY -= lineHeight * 0.72;
      return;
    }

    if (/^#{1,3}\s+/.test(trimmed)) {
      const headingText = trimmed.replace(/^#{1,3}\s+/, "");
      const headingLevel = trimmed.match(/^#+/)?.[0].length ?? 1;
      const headingSize = headingLevel === 1 ? 18 : headingLevel === 2 ? 15 : 13;
      page.drawText(headingText, {
        x: marginX,
        y: cursorY,
        size: headingSize,
        font,
        color: rgb(0.11, 0.11, 0.1),
      });
      cursorY -= headingLevel === 1 ? 28 : 24;
      return;
    }

    page.drawText(line, {
      x: marginX,
      y: cursorY,
      size: bodySize,
      font,
      color: rgb(0.11, 0.11, 0.1),
    });
    cursorY -= lineHeight;
  };

  page.drawText(input.title, {
    x: marginX,
    y: cursorY,
    size: titleSize,
    font,
    color: rgb(0.1, 0.1, 0.1),
  });
  cursorY -= 34;

  page.drawText(`导出时间：${new Date(input.updatedAt).toLocaleString("zh-CN")}`, {
    x: marginX,
    y: cursorY,
    size: 10,
    font,
    color: rgb(0.45, 0.45, 0.42),
  });
  cursorY -= 30;

  const wrappedLines = wrapText(input.markdownContent, contentWidth, (value) => font.widthOfTextAtSize(value, bodySize));
  for (const line of wrappedLines) {
    drawBodyLine(line);
  }

  for (const [index, currentPage] of pages.entries()) {
    const pageWidth = currentPage.getWidth();
    currentPage.drawText("HUOZI WRITER", {
      x: marginX,
      y: 804,
      size: 9,
      font,
      color: rgb(0.58, 0.2, 0.2),
    });
    currentPage.drawText(input.authorName ? `作者：${input.authorName}` : "作者：未署名", {
      x: pageWidth - marginX - 150,
      y: 804,
      size: 9,
      font,
      color: rgb(0.42, 0.4, 0.38),
    });
    currentPage.drawLine({
      start: { x: marginX, y: 796 },
      end: { x: pageWidth - marginX, y: 796 },
      color: rgb(0.82, 0.73, 0.69),
      thickness: 0.8,
    });
    currentPage.drawText(input.watermarkText || "Huozi Writer", {
      x: 112,
      y: 420,
      size: 38,
      font,
      color: rgb(0.74, 0.68, 0.65),
      opacity: 0.12,
      rotate: degrees(28),
    });
    currentPage.drawLine({
      start: { x: marginX, y: 42 },
      end: { x: pageWidth - marginX, y: 42 },
      color: rgb(0.86, 0.82, 0.78),
      thickness: 0.8,
    });
    currentPage.drawText("由 Huozi Writer 导出", {
      x: marginX,
      y: 28,
      size: 9,
      font,
      color: rgb(0.45, 0.45, 0.42),
    });
    currentPage.drawText(`${index + 1} / ${pages.length}`, {
      x: pageWidth - marginX - 36,
      y: 28,
      size: 9,
      font,
      color: rgb(0.45, 0.45, 0.42),
    });
  }

  return pdfDoc.save();
}

export function buildExportFilename(title: string, ext: string) {
  const safeTitle = title
    .trim()
    .replace(/[^\x20-\x7E]/g, "-")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return `${safeTitle || "huozi-document"}.${ext}`;
}
