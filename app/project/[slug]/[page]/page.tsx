import { notFound } from "next/navigation"
import { WORKSPACE_PAGES, renderWorkspace } from "@/lib/server/workspace-page"
import type { WorkspacePage } from "@/components/board/board"

export const dynamic = "force-dynamic"

/* One project's timeline, calendar or list, e.g. /project/ai-socratic/calendar. */
export default async function ProjectSectionPage({ params }: { params: Promise<{ slug: string; page: string }> }) {
  const { slug, page } = await params
  if (!WORKSPACE_PAGES.includes(page as WorkspacePage)) notFound()
  return renderWorkspace(page as WorkspacePage, slug)
}
