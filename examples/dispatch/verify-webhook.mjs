import { createHmac, timingSafeEqual } from "node:crypto"

// Verify raw bytes BEFORE JSON.parse. Persist dispatch IDs in the receiver's
// durable job queue and accept an existing ID without starting another job.
export function verifyWebhook(rawBody, timestamp, suppliedSignature, secret, now = Date.now()) {
  if (!/^\d+$/.test(timestamp ?? "") || Math.abs(now / 1000 - Number(timestamp)) > 300 || typeof secret !== "string" || secret.length < 32) return false
  if (!/^v1=[a-f0-9]{64}$/.test(suppliedSignature ?? "")) return false
  const expected = `v1=${createHmac("sha256", secret).update(`${timestamp}.`).update(rawBody).digest("hex")}`
  return timingSafeEqual(Buffer.from(expected), Buffer.from(suppliedSignature))
}
