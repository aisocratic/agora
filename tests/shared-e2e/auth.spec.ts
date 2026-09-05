import { test, expect } from "@playwright/test"

test("unauthenticated pages/APIs are blocked; login and logout revoke shared access", async ({ page, request }) => {
  expect((await request.get("/api/board")).status()).toBe(401)
  await page.goto("/")
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole("button", { name: "New card", exact: true })).toHaveCount(0)
  await page.getByLabel("Shared password").fill("incorrect password")
  await page.getByRole("button", { name: "Sign in", exact: true }).click()
  await expect(page.getByRole("alert").filter({ hasText: "Incorrect password" })).toContainText("Incorrect password")
  await page.getByLabel("Shared password").fill("browser-test-password-2026")
  await page.getByRole("button", { name: "Sign in", exact: true }).click()
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeVisible()
  const cookies = await page.context().cookies()
  const session = cookies.find((cookie) => cookie.name === "agora_session")!
  expect(session).toMatchObject({ httpOnly: true, secure: true, sameSite: "Strict" })
  await page.getByRole("button", { name: "Sign out", exact: true }).click()
  await expect(page).toHaveURL(/\/login$/)
  expect((await request.get("/api/board", { headers: { Cookie: `agora_session=${session.value}` } })).status()).toBe(401)
  await page.goto("/")
  await expect(page).toHaveURL(/\/login$/)
})
