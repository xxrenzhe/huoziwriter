import { buttonStyles, cardStyles, inputStyles, selectStyles, surfaceCardStyles, textareaStyles } from "./primitives";
import { boxShadowTokens, designTokens, fontFamilyTokens, tailwindThemeExtension } from "./theme";

export * from "./primitives";
export { boxShadowTokens, designTokens, fontFamilyTokens, tailwindThemeExtension } from "./theme";

export const uiPrimitives = {
  card: cardStyles(),
  panel: surfaceCardStyles(),
  adminPanel: "border border-adminLineStrong bg-adminSurface text-adminInk shadow-none",
  input: inputStyles(),
  adminInput: "border border-adminLineStrong bg-adminSurfaceMuted px-4 py-3 text-sm text-adminInk transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-adminAccent focus-visible:ring-offset-1 focus-visible:ring-offset-adminBg",
  adminSelect: "border border-adminLineStrong bg-adminSurfaceMuted px-4 py-3 text-sm text-adminInk transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-adminAccent focus-visible:ring-offset-1 focus-visible:ring-offset-adminBg",
  adminCompactSelect: "border border-adminLineStrong bg-adminSurfaceMuted px-3 py-2 text-sm text-adminInk transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-adminAccent focus-visible:ring-offset-1 focus-visible:ring-offset-adminBg",
  primaryButton: buttonStyles({ variant: "primary" }),
  primaryButtonFull: buttonStyles({ variant: "primary", fullWidth: true }),
  secondaryButton: buttonStyles({ variant: "secondary" }),
  adminSecondaryButton: "border border-adminLineStrong bg-adminSurfaceMuted px-4 py-2 text-sm text-adminInk transition-colors hover:bg-adminSurfaceAlt active:bg-adminSurface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-adminAccent focus-visible:ring-offset-1 focus-visible:ring-offset-adminBg",
  select: selectStyles(),
  textarea: textareaStyles(),
} as const;
