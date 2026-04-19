export const designTokens = {
  paper: "#FAF9F5",
  paperStrong: "#F2EDE2",
  surface: "#FFFFFF",
  surfaceAlt: "#F6F5F2",
  surfaceMuted: "#EDECE8",
  surfaceWarm: "#FAF7F0",
  surfaceHighlight: "#FFFDFA",
  surfaceWarning: "#FFF8E8",
  surfaceSuccess: "#F0F8F2",
  ink: "#1B1C1A",
  inkSoft: "#3F4039",
  inkMuted: "#645E54",
  inkFaint: "#8C8579",
  cinnabar: "#A73032",
  cinnabarDeep: "#86171D",
  cinnabarSoft: "rgba(167, 48, 50, 0.08)",
  cinnabarRing: "rgba(167, 48, 50, 0.32)",
  gold: "#C48A3A",
  line: "rgba(88, 65, 64, 0.10)",
  lineStrong: "rgba(88, 65, 64, 0.18)",
  lineSubtle: "rgba(88, 65, 64, 0.04)",
  success: "#3F7C4D",
  warning: "#C48A3A",
  danger: "#A73032",
  info: "#3A6F8C",
  adminBg: "#0E0E10",
  adminSurface: "#15151A",
  adminSurfaceAlt: "#1B1C22",
  adminSurfaceMuted: "#23252C",
  adminInk: "#E6E7EB",
  adminInkSoft: "#A8AAB3",
  adminInkMuted: "#71747D",
  adminLine: "rgba(255, 255, 255, 0.06)",
  adminLineStrong: "rgba(255, 255, 255, 0.12)",
  adminAccent: "#C84548",
};

export const fontFamilyTokens = {
  serifCn: ["var(--font-serif-cn)", "'Songti SC'", "'STSong'", "'Source Han Serif SC'", "'Noto Serif CJK SC'", "serif"],
  sansCn: ["var(--font-ui)", "'PingFang SC'", "'Hiragino Sans GB'", "'Microsoft YaHei'", "'Noto Sans CJK SC'", "sans-serif"],
};

export const boxShadowTokens = {
  ink: "0px 4px 20px rgba(27, 28, 26, 0.06)",
};

export const tailwindThemeExtension = {
  colors: designTokens,
  fontFamily: fontFamilyTokens,
  boxShadow: boxShadowTokens,
};
