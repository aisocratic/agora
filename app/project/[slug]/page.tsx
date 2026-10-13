import { renderWorkspace } from "@/lib/server/workspace-page"

export const dynamic = "force-dynamic"

/* One project's cards on the usual kanban, e.g. /project/ai-socratic. */
export default async function ProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return renderWorkspace("board", slug)
}
