import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * AES-256-GCM for source credentials at rest. Key from SOURCE_ENC_KEY (32 bytes
 * base64, server-only). Stored format: base64(iv).base64(ciphertext).base64(tag).
 */
const KEY = Buffer.from(process.env.SOURCE_ENC_KEY ?? "", "base64");
if (KEY.length !== 32) {
  throw new Error("SOURCE_ENC_KEY must be 32 bytes, base64-encoded (see apps/server/.env).");
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", KEY, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), enc.toString("base64"), tag.toString("base64")].join(".");
}

export function decrypt(blob: string): string {
  const [ivB, encB, tagB] = blob.split(".");
  if (!ivB || !encB || !tagB) throw new Error("Malformed ciphertext.");
  const decipher = createDecipheriv("aes-256-gcm", KEY, Buffer.from(ivB, "base64"));
  decipher.setAuthTag(Buffer.from(tagB, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(encB, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
