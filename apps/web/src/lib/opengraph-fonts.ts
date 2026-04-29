import { readFile } from "node:fs/promises";

const CJK_FONT_CANDIDATES = [
  "/Library/Fonts/AdobeHeitiStd-Regular.otf",
  "/System/Library/Fonts/Hiragino Sans GB.ttc",
  "/System/Library/Fonts/STHeiti Medium.ttc",
] as const;

let cachedChineseFontData: ArrayBuffer | null | undefined;

async function loadFirstAvailableFont(paths: readonly string[]) {
  for (const fontPath of paths) {
    try {
      const file = await readFile(fontPath);
      return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
    } catch {
      continue;
    }
  }

  return null;
}

export async function getOpenGraphChineseFonts() {
  if (cachedChineseFontData === undefined) {
    cachedChineseFontData = await loadFirstAvailableFont(CJK_FONT_CANDIDATES);
  }

  if (!cachedChineseFontData) {
    return [];
  }

  return [
    {
      name: "HuoziWriterChinese",
      data: cachedChineseFontData,
      style: "normal" as const,
      weight: 400 as const,
    },
  ];
}
