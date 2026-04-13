export type DiffLine = {
  type: "added" | "removed" | "unchanged";
  content: string;
};

export function buildLineDiff(previousText: string, currentText: string) {
  const previousLines = previousText.split("\n");
  const currentLines = currentText.split("\n");
  const matrix = Array.from({ length: previousLines.length + 1 }, () =>
    Array.from<number>({ length: currentLines.length + 1 }).fill(0),
  );

  for (let i = previousLines.length - 1; i >= 0; i -= 1) {
    for (let j = currentLines.length - 1; j >= 0; j -= 1) {
      matrix[i][j] =
        previousLines[i] === currentLines[j]
          ? matrix[i + 1][j + 1] + 1
          : Math.max(matrix[i + 1][j], matrix[i][j + 1]);
    }
  }

  const lines: DiffLine[] = [];
  let i = 0;
  let j = 0;

  while (i < previousLines.length && j < currentLines.length) {
    if (previousLines[i] === currentLines[j]) {
      lines.push({ type: "unchanged", content: previousLines[i] });
      i += 1;
      j += 1;
      continue;
    }

    if (matrix[i + 1][j] >= matrix[i][j + 1]) {
      lines.push({ type: "removed", content: previousLines[i] });
      i += 1;
    } else {
      lines.push({ type: "added", content: currentLines[j] });
      j += 1;
    }
  }

  while (i < previousLines.length) {
    lines.push({ type: "removed", content: previousLines[i] });
    i += 1;
  }

  while (j < currentLines.length) {
    lines.push({ type: "added", content: currentLines[j] });
    j += 1;
  }

  return {
    lines,
    summary: {
      added: lines.filter((line) => line.type === "added").length,
      removed: lines.filter((line) => line.type === "removed").length,
      unchanged: lines.filter((line) => line.type === "unchanged").length,
    },
  };
}
