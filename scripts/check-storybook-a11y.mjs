import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const storybookDir = path.join(repoRoot, "packages/ui/storybook-static");
const storyIndexPath = path.join(storybookDir, "index.json");
const browserChannel = process.env.STORYBOOK_A11Y_BROWSER_CHANNEL || process.env.PLAYWRIGHT_CHANNEL || "chrome";

const mimeTypeMap = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function getContentType(filePath) {
  return mimeTypeMap[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

async function resolveStaticFile(requestPath) {
  const normalizedPath = requestPath === "/" ? "/index.html" : requestPath;
  const candidatePath = path.normalize(path.join(storybookDir, normalizedPath));

  if (!candidatePath.startsWith(storybookDir)) {
    return null;
  }

  try {
    const fileStats = await stat(candidatePath);
    if (fileStats.isDirectory()) {
      return path.join(candidatePath, "index.html");
    }
    return candidatePath;
  } catch {
    return null;
  }
}

async function startStaticServer() {
  const server = createServer(async (request, response) => {
    const requestUrl = new URL(request.url || "/", "http://127.0.0.1");
    const filePath = await resolveStaticFile(requestUrl.pathname);

    if (!filePath) {
      response.statusCode = 404;
      response.end("Not found");
      return;
    }

    try {
      const file = await readFile(filePath);
      response.setHeader("Content-Type", getContentType(filePath));
      response.end(file);
    } catch {
      response.statusCode = 500;
      response.end("Failed to read file");
    }
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to bind Storybook static server.");
  }

  return {
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
    origin: `http://127.0.0.1:${address.port}`,
  };
}

async function launchBrowser() {
  if (browserChannel) {
    try {
      return await chromium.launch({ channel: browserChannel, headless: true });
    } catch (error) {
      console.warn(`Failed to launch Chrome channel "${browserChannel}", falling back to bundled Chromium.`);
      console.warn(error instanceof Error ? error.message : String(error));
    }
  }

  return chromium.launch({ headless: true });
}

function formatViolation(violation) {
  return {
    id: violation.id,
    impact: violation.impact || "unknown",
    help: violation.help,
    nodes: violation.nodes.map((node) => node.target.join(" ")).filter(Boolean),
  };
}

async function main() {
  const storyIndexRaw = await readFile(storyIndexPath, "utf8");
  const storyIndex = JSON.parse(storyIndexRaw);
  const storyEntries = Object.values(storyIndex.entries || {}).filter((entry) => entry.type === "story");

  if (storyEntries.length === 0) {
    throw new Error("No Storybook stories were found in packages/ui/storybook-static/index.json.");
  }

  const server = await startStaticServer();
  const browser = await launchBrowser();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
  });
  const page = await context.newPage();
  const failures = [];

  try {
    for (const entry of storyEntries) {
      const storyUrl = `${server.origin}/iframe.html?id=${entry.id}&viewMode=story`;

      await page.goto(storyUrl, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => {
        const root = document.querySelector("#storybook-root");
        return Boolean(root && root.childElementCount > 0);
      }, undefined, { timeout: 15_000 });
      await page.waitForLoadState("networkidle");
      await page.evaluate(async () => {
        if ("fonts" in document) {
          await document.fonts.ready;
        }
      });

      const results = await new AxeBuilder({ page })
        .include("#storybook-root")
        .disableRules(["landmark-one-main", "page-has-heading-one"])
        .analyze();

      if (results.violations.length > 0) {
        failures.push({
          id: entry.id,
          name: `${entry.title} / ${entry.name}`,
          violations: results.violations.map(formatViolation),
        });
      }
    }
  } finally {
    await page.close();
    await context.close();
    await browser.close();
    await server.close();
  }

  if (failures.length > 0) {
    console.error(`Storybook accessibility failed for ${failures.length} stories.`);
    for (const failure of failures) {
      console.error(`\n- ${failure.name} (${failure.id})`);
      for (const violation of failure.violations) {
        console.error(`  • [${violation.impact}] ${violation.id}: ${violation.help}`);
        if (violation.nodes.length > 0) {
          console.error(`    Targets: ${violation.nodes.join(", ")}`);
        }
      }
    }
    process.exit(1);
  }

  console.log(`Storybook accessibility passed for ${storyEntries.length} stories.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
