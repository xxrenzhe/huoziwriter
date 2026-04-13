type SemanticVector = Record<string, number>;

function normalizeText(text: string) {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^\p{Script=Han}\p{Letter}\p{Number}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeLatin(text: string) {
  return text
    .split(/\s+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2 && /[\p{Letter}\p{Number}]/u.test(item));
}

function tokenizeHanBigrams(text: string) {
  const compact = text.replace(/\s+/g, "");
  const chars = Array.from(compact).filter((item) => /\p{Script=Han}/u.test(item));
  const bigrams: string[] = [];
  for (let index = 0; index < chars.length; index += 1) {
    bigrams.push(chars[index]);
    if (index < chars.length - 1) {
      bigrams.push(`${chars[index]}${chars[index + 1]}`);
    }
  }
  return bigrams;
}

export function buildSemanticEmbedding(text: string): SemanticVector {
  const normalized = normalizeText(text);
  if (!normalized) {
    return {};
  }

  const tokens = [...tokenizeLatin(normalized), ...tokenizeHanBigrams(normalized)];
  const counts = new Map<string, number>();
  for (const token of tokens) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }

  const vector: SemanticVector = {};
  for (const [token, count] of counts.entries()) {
    vector[token] = 1 + Math.log1p(count);
  }
  return vector;
}

export function parseSemanticEmbedding(value: unknown) {
  if (!value) {
    return {};
  }

  try {
    const raw = typeof value === "string" ? JSON.parse(value) : value;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return {};
    }

    const vector: SemanticVector = {};
    for (const [token, weight] of Object.entries(raw)) {
      if (typeof weight === "number" && Number.isFinite(weight) && weight > 0) {
        vector[token] = weight;
      }
    }
    return vector;
  } catch {
    return {};
  }
}

export function cosineSimilarity(left: SemanticVector, right: SemanticVector) {
  const rightEntries = Object.entries(right);
  if (Object.keys(left).length === 0 || rightEntries.length === 0) {
    return 0;
  }

  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;

  for (const weight of Object.values(left)) {
    leftNorm += weight * weight;
  }
  for (const [token, weight] of rightEntries) {
    rightNorm += weight * weight;
    dot += (left[token] ?? 0) * weight;
  }

  if (!leftNorm || !rightNorm) {
    return 0;
  }

  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

export function scoreSemanticMatch(query: string, content: string, embedding?: unknown) {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    return 0;
  }

  const queryVector = buildSemanticEmbedding(trimmedQuery);
  const parsedEmbedding = parseSemanticEmbedding(embedding);
  const contentVector = Object.keys(parsedEmbedding).length ? parsedEmbedding : buildSemanticEmbedding(content);

  const normalizedQuery = normalizeText(trimmedQuery);
  const normalizedContent = normalizeText(content);
  const directHit = normalizedQuery && normalizedContent.includes(normalizedQuery) ? 0.35 : 0;

  let overlapBonus = 0;
  for (const token of Object.keys(queryVector)) {
    if (token.length >= 2 && normalizedContent.includes(token)) {
      overlapBonus += 0.04;
    }
  }

  return cosineSimilarity(queryVector, contentVector) + directHit + Math.min(overlapBonus, 0.24);
}
