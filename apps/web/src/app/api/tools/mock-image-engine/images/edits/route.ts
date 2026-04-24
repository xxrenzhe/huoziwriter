import { createHash } from "node:crypto";
import { ok } from "@/lib/http";

function buildMockSvg(prompt: string, model: string, colorSeed: string) {
  const fill = `#${colorSeed.slice(0, 6)}`;
  const accent = `#${colorSeed.slice(6, 12)}`;
  const safePrompt = prompt
    .replace(/[<>&"]/g, "")
    .slice(0, 72);
  const safeModel = model.replace(/[<>&"]/g, "").slice(0, 32);

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="1024" viewBox="0 0 1536 1024">`,
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">`,
    `<stop offset="0%" stop-color="${fill}"/><stop offset="100%" stop-color="${accent}"/>`,
    `</linearGradient></defs>`,
    `<rect width="1536" height="1024" fill="url(#g)"/>`,
    `<circle cx="1250" cy="240" r="190" fill="rgba(255,255,255,0.22)"/>`,
    `<rect x="120" y="150" width="780" height="560" rx="42" fill="rgba(255,255,255,0.84)"/>`,
    `<text x="180" y="280" font-size="46" font-family="Arial, PingFang SC, sans-serif" fill="#1f2937">HuoziWriter Mock Edit</text>`,
    `<text x="180" y="360" font-size="32" font-family="Arial, PingFang SC, sans-serif" fill="#334155">${safeModel}</text>`,
    `<foreignObject x="180" y="420" width="640" height="220">`,
    `<div xmlns="http://www.w3.org/1999/xhtml" style="font-size:36px;line-height:1.5;color:#111827;font-family:Arial,'PingFang SC',sans-serif;">${safePrompt}</div>`,
    `</foreignObject>`,
    `<text x="180" y="770" font-size="24" font-family="Arial, PingFang SC, sans-serif" fill="#475569">Local mock image edit endpoint for gpt-image cover workflow</text>`,
    `</svg>`,
  ].join("");
}

export async function POST(request: Request) {
  const formData = await request.formData().catch(() => new FormData());
  const prompt = String(formData.get("prompt") || "Huozi Writer").trim() || "Huozi Writer";
  const model = String(formData.get("model") || "mock-image-engine").trim() || "mock-image-engine";
  const digest = createHash("sha1").update(`${model}:${prompt}:edit`).digest("hex");
  const svg = buildMockSvg(prompt, model, digest);
  const b64 = Buffer.from(svg, "utf8").toString("base64");

  return ok({
    created: Math.floor(Date.now() / 1000),
    data: [
      {
        b64_json: b64,
      },
    ],
  });
}
