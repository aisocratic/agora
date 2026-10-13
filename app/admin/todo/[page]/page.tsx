import { notFound } from "next/navigation"
import type { WorkspacePage } from "@/components/board/board"
import { TestDashboard } from "../dashboard"

export const metadata = { title: "Test dashboard · Agora" }
const PAGES: WorkspacePage[] = ["board", "projects", "calendar", "list"]

/* The demo's sections, e.g. /admin/todo/projects. */
export default async function DemoSectionPage({ params }: { params: Promise<{ page: string }> }) {
  const { page } = await params
  if (!PAGES.includes(page as WorkspacePage)) notFound()
  return <TestDashboard projects="/admin/todo" page={page as WorkspacePage} />
}
