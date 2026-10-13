import { TestDashboard } from "../../dashboard"

export const metadata = { title: "Test dashboard · Agora" }

/* The demo's project pages, e.g. /admin/todo/project/agora-launch. */
export default async function DemoProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return <TestDashboard projects="/admin/todo" page="board" scopeSlug={slug} />
}
