import { notFound } from "next/navigation"
import type { WorkspacePage } from "@/components/board/board"
import { TestDashboard } from "../../../dashboard"

export const metadata = { title: "Test dashboard · Agora" }
const PAGES: WorkspacePage[] = ["board", "projects", "calendar", "list"]

/* A demo project's timeline or calendar, e.g. /admin/todo/project/agora-launch/projects. */
export default async function DemoProjectSectionPage({ params }: { params: Promise<{ slug: string; page: string }> }) {
  const { slug, page } = await params
  if (!PAGES.includes(page as WorkspacePage)) notFound()
  return <TestDashboard projects="/admin/todo" page={page as WorkspacePage} scopeSlug={slug} />
}
