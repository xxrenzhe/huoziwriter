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
    `<circle cx="1240" cy="220" r="180" fill="rgba(255,255,255,0.18)"/>`,
    `<rect x="120" y="150" width="760" height="560" rx="42" fill="rgba(255,255,255,0.82)"/>`,
    `<text x="180" y="280" font-size="46" font-family="Arial, PingFang SC, sans-serif" fill="#1f2937">HuoziWriter Mock Cover</text>`,
    `<text x="180" y="360" font-size="32" font-family="Arial, PingFang SC, sans-serif" fill="#334155">${safeModel}</text>`,
    `<foreignObject x="180" y="420" width="620" height="220">`,
    `<div xmlns="http://www.w3.org/1999/xhtml" style="font-size:36px;line-height:1.5;color:#111827;font-family:Arial,'PingFang SC',sans-serif;">${safePrompt}</div>`,
    `</foreignObject>`,
    `<text x="180" y="770" font-size="24" font-family="Arial, PingFang SC, sans-serif" fill="#475569">Local mock image engine for cover-image workflow</text>`,
    `</svg>`,
  ].join("");
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const prompt = String(body?.prompt || "Huozi Writer").trim() || "Huozi Writer";
  const model = String(body?.model || "mock-image-engine").trim() || "mock-image-engine";
  const digest = createHash("sha1").update(`${model}:${prompt}`).digest("hex");
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
