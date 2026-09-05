import { expect, it } from "vitest"
import { webhookSignature } from "../lib/server/dispatch-adapters"
// The shipped receiver example is intentionally standalone JavaScript.
import { verifyWebhook } from "../examples/dispatch/verify-webhook.mjs"

it("the receiver example verifies exact bytes and rejects tampering and stale delivery", () => {
  const body = '{"task":"hello"}'
  const timestamp = "1788584702"
  const secret = "example-verification-secret-at-least-32-characters"
  const signature = webhookSignature(body, timestamp, secret)
  const now = Number(timestamp) * 1000
  expect(verifyWebhook(Buffer.from(body), timestamp, signature, secret, now)).toBe(true)
  expect(verifyWebhook(Buffer.from(body + " "), timestamp, signature, secret, now)).toBe(false)
  expect(verifyWebhook(Buffer.from(body), timestamp, signature, secret, now + 301000)).toBe(false)
  expect(verifyWebhook(Buffer.from(body), timestamp, "v1=bad", secret, now)).toBe(false)
})
