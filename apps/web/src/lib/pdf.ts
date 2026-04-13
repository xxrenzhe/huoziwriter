import fs from "node:fs";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb } from "pdf-lib";

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
}) {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  const fontPath = resolvePdfFontPath();
  if (!fontPath) {
    throw new Error("当前环境缺少可用的中文字库，无法导出 PDF");
  }

  const fontBytes = fs.readFileSync(fontPath);
  const font = await pdfDoc.embedFont(fontBytes, { subset: true });

  let page = pdfDoc.addPage([595.28, 841.89]);
  const marginX = 52;
  const topY = 790;
  const bottomY = 56;
  const lineHeight = 22;
  const contentWidth = page.getWidth() - marginX * 2;
  const titleSize = 22;
  const bodySize = 12.5;
  let cursorY = topY;

  const drawBodyLine = (line: string) => {
    if (cursorY <= bottomY) {
      page = pdfDoc.addPage([595.28, 841.89]);
      cursorY = topY;
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
