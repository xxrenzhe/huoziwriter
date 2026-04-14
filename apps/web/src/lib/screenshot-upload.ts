import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

function detectUploadDir() {
  const cwd = process.cwd();
  if (existsSync(path.join(cwd, "public"))) {
    return path.join(cwd, "public", "uploads");
  }
  return path.join(cwd, "apps", "web", "public", "uploads");
}

export async function persistScreenshot(imageDataUrl: string) {
  const match = imageDataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) {
    throw new Error("截图数据格式不合法");
  }
  const [, mimeType, encoded] = match;
  const extension = mimeType.split("/")[1]?.replace("jpeg", "jpg") || "png";
  const uploadDir = detectUploadDir();
  await mkdir(uploadDir, { recursive: true });
  const filename = `capture-${Date.now()}-${randomUUID()}.${extension}`;
  await writeFile(path.join(uploadDir, filename), Buffer.from(encoded, "base64"));
  return `/uploads/${filename}`;
}
