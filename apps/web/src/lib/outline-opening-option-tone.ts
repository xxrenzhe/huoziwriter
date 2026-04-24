export function getOutlineOpeningOptionCardClassName(input: {
  isSelected: boolean;
  forbiddenHits: string[];
}) {
  if (input.forbiddenHits.length > 0) {
    return "border-danger/30 bg-red-50 hover:border-danger/40 hover:bg-red-50";
  }
  if (input.isSelected) {
    return "border-cinnabar bg-surfaceWarning hover:border-cinnabar hover:bg-surfaceWarning";
  }
  return "border-lineStrong bg-surface";
}
