import { test } from "@playwright/test"
import { workspaceGraphWorkflow } from "../helpers/graph-workflow"
import { signIn } from "../helpers/workspace"

for (const width of [1280, 390]) test(`shared graph workflow at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 })
  await signIn(page)
  await workspaceGraphWorkflow(page, `Shared ${width}`)
})
