const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36";

const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

export type ExternalTextResponse = {
  url: string;
  finalUrl: string;
  status: number;
  contentType: string | null;
  text: string;
  attempts: number;
};

export type ExternalBinaryResponse = {
  url: string;
  finalUrl: string;
  status: number;
  contentType: string | null;
  buffer: Buffer;
  attempts: number;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetryStatus(status: number) {
  return RETRYABLE_STATUS_CODES.has(status);
}

function normalizeFetchErrorMessage(error: unknown) {
  if (error instanceof Error) {
    if (error.name === "TimeoutError") {
      return "外部请求超时";
    }
    return error.message;
  }
  return "外部请求失败";
}

async function fetchExternalResponse(input: {
  url: string;
  timeoutMs?: number;
  maxAttempts?: number;
  cache?: RequestCache;
  accept?: string;
  headers?: HeadersInit;
}) {
  const timeoutMs = input.timeoutMs ?? 20_000;
  const maxAttempts = Math.max(1, input.maxAttempts ?? 2);
  const cache = input.cache ?? "no-store";
  const accept = input.accept ?? "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5";
  let lastError: string | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(input.url, {
        headers: {
          "User-Agent": DEFAULT_USER_AGENT,
          Accept: accept,
          ...input.headers,
        },
        signal: AbortSignal.timeout(timeoutMs),
        cache,
        redirect: "follow",
      });
      if (!response.ok) {
        const errorMessage = `外部请求失败，HTTP ${response.status}`;
        if (attempt < maxAttempts && shouldRetryStatus(response.status)) {
          lastError = errorMessage;
          await sleep(350 * attempt);
          continue;
        }
        throw new Error(errorMessage);
      }

      return {
        response,
        attempts: attempt,
      };
    } catch (error) {
      const errorMessage = normalizeFetchErrorMessage(error);
      const shouldRetry = attempt < maxAttempts;
      if (!shouldRetry) {
        throw new Error(lastError ? `${errorMessage}（重试后仍失败）` : errorMessage);
      }
      lastError = errorMessage;
      await sleep(350 * attempt);
    }
  }

  throw new Error(lastError || "外部请求失败");
}

export async function fetchExternalText(input: {
  url: string;
  timeoutMs?: number;
  maxAttempts?: number;
  cache?: RequestCache;
  accept?: string;
  headers?: HeadersInit;
}) {
  const response = await fetchExternalResponse(input);

  return {
        url: input.url,
        finalUrl: response.response.url || input.url,
        status: response.response.status,
        contentType: response.response.headers.get("content-type"),
        text: await response.response.text(),
        attempts: response.attempts,
      } satisfies ExternalTextResponse;
}

export async function fetchExternalBinary(input: {
  url: string;
  timeoutMs?: number;
  maxAttempts?: number;
  cache?: RequestCache;
  accept?: string;
  headers?: HeadersInit;
}) {
  const response = await fetchExternalResponse({
    ...input,
    accept: input.accept ?? "image/*;q=1.0,*/*;q=0.5",
  });

  return {
    url: input.url,
    finalUrl: response.response.url || input.url,
    status: response.response.status,
    contentType: response.response.headers.get("content-type"),
    buffer: Buffer.from(await response.response.arrayBuffer()),
    attempts: response.attempts,
  } satisfies ExternalBinaryResponse;
}
