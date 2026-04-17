import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const DEFAULT_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const AUTH_COOKIE_NAME = "huoziwriter_session";

export type SessionPayload = {
  userId: number;
  username: string;
  role: "admin" | "user";
};

export function getAuthCookieName() {
  return AUTH_COOKIE_NAME;
}

function jwtSecret() {
  return process.env.JWT_SECRET || "change_me_to_a_random_64_char_secret";
}

function encryptionKey() {
  const raw = process.env.ENCRYPTION_KEY || DEFAULT_ENCRYPTION_KEY;
  return Buffer.from(raw.padEnd(64, "0").slice(0, 64), "hex");
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export function signSession(payload: SessionPayload) {
  return jwt.sign(payload, jwtSecret(), {
    expiresIn: "14d",
  });
}

export function verifySession(token: string) {
  return jwt.verify(token, jwtSecret()) as SessionPayload;
}

export function encryptSecret(value: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptSecret(payload: string | null | undefined) {
  if (!payload) {
    return null;
  }
  const raw = Buffer.from(payload, "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const content = raw.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(content), decipher.final()]).toString("utf8");
}

export function pngThumbBuffer() {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9erjUAAAAASUVORK5CYII=",
    "base64",
  );
}
