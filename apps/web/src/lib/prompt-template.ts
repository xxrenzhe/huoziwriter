function normalizeTemplateValue(value: unknown) {
  if (value == null) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  return JSON.stringify(value);
}

export function formatPromptTemplate(template: string, values: Record<string, unknown>) {
  const missingKeys = new Set<string>();
  const rendered = template.replace(/\{\{([a-zA-Z0-9_.-]+)\}\}/g, (_, rawKey: string) => {
    if (!Object.prototype.hasOwnProperty.call(values, rawKey)) {
      missingKeys.add(rawKey);
      return "";
    }
    return normalizeTemplateValue(values[rawKey]);
  });
  if (missingKeys.size > 0) {
    throw new Error(`Prompt template 缺少变量：${Array.from(missingKeys).join(", ")}`);
  }
  return rendered;
}
