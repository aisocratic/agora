import { test, expect } from "@playwright/test"
import { graphWorkflow } from "../helpers/graph-workflow"

test("graph empty state, direction, navigation, editing and cycle rejection", async ({ page }) => {
  await page.goto("/")
  await page.getByRole("button", { name: "Graph", exact: true }).click()
  await expect(page.getByRole("heading", { name: "No cards to connect yet" })).toBeVisible()
  await graphWorkflow(page, "Graph")
})
