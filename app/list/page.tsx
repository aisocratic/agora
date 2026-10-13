import { renderWorkspace } from "@/lib/server/workspace-page"

export const dynamic = "force-dynamic"

export default async function Page() {
  return renderWorkspace("list")
}
