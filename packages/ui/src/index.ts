export const designTokens = {
  paper: "#FAF9F5",
  ink: "#1B1C1A",
  cinnabar: "#A73032",
  stonebase: "#F5F3F0",
  panel: "#EFEEEB",
};

export const fontFamilyTokens = {
  serifCn: ["'Noto Serif SC'", "serif"],
  sansCn: ["'Inter'", "'Noto Sans SC'", "sans-serif"],
};

export const boxShadowTokens = {
  ink: "0px 4px 20px rgba(27, 28, 26, 0.06)",
};

export const tailwindThemeExtension = {
  colors: designTokens,
  fontFamily: fontFamilyTokens,
  boxShadow: boxShadowTokens,
};

export const uiPrimitives = {
  panel: "border border-stone-300/40 bg-white shadow-ink",
  opsPanel: "border border-stone-800 bg-[#171718]",
  input: "w-full border border-stone-300 bg-white px-4 py-3 text-sm",
  opsInput: "border border-stone-800 bg-stone-950 px-4 py-3 text-sm text-stone-100",
  opsSelect: "border border-stone-800 bg-stone-950 px-4 py-3 text-sm text-stone-100",
  opsCompactSelect: "border border-stone-800 bg-stone-950 px-3 py-2 text-sm text-stone-100",
  primaryButton: "bg-cinnabar px-5 py-3 text-sm text-white disabled:opacity-60",
  primaryButtonFull: "w-full bg-cinnabar px-5 py-3 text-sm text-white disabled:opacity-60",
  secondaryButton: "border border-stone-300 bg-white px-4 py-2 text-sm text-stone-700",
  opsSecondaryButton: "border border-stone-800 bg-stone-950 px-4 py-2 text-sm text-stone-100",
} as const;
