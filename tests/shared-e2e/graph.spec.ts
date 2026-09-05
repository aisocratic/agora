import { test, expect } from "@playwright/test"
import { graphWorkflow } from "../helpers/graph-workflow"

for (const width of [1280, 390]) test(`shared graph workflow at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 })
  await page.goto("/")
  await page.getByLabel("Shared password").fill("browser-test-password-2026")
  await page.getByRole("button", { name: "Sign in", exact: true }).click()
  await expect(page.getByRole("button", { name: "New card", exact: true })).toBeEnabled()
  await graphWorkflow(page, `Shared ${width}`)
})
