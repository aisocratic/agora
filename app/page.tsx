import { getPublicWorkflow } from "@/lib/server/configuration"
import Link from "next/link"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { authorizeRequest, type Principal } from "@/lib/server/authorization"
import { LogoutButton } from "@/components/auth/logout-button"
import { Section, SiteHeader, Wordmark } from "@aisocratic/design"
import { Board } from "@/components/board/board"
import { ThemeToggle } from "@aisocratic/design/components/theme-toggle"

export const dynamic = "force-dynamic"

export default async function Page() {
  let principal: Principal | null = null
  if (process.env.DATABASE_URL) {
    try { principal = await authorizeRequest(new Request("http://localhost/", { headers: await headers() })) }
    catch { redirect("/login") }
  }
  return (
    <>
      {/* Stoa's header is out of flow and 104px tall; the first Section takes
          `lead` to clear it. The toggle is the only control the placeholder
          needs, and it doubles as the way to check both themes. */}
      <SiteHeader
        linkComponent={Link}
        brand={
          <Link
            href="/"
            aria-label="Agora home"
            className="flex items-center gap-2 text-foreground"
          >
            <Wordmark height={32} />
            <span className="text-body text-muted-foreground">
              / <b className="font-medium text-foreground">agora</b>
            </span>
          </Link>
        }
        actions={<>{principal?.kind === "session" && <LogoutButton />}<ThemeToggle /></>}
      />

      <main className="min-h-svh">
        <Section lead size="lg">
          <Board mode={process.env.DATABASE_URL ? "shared" : "local"} workflow={process.env.DATABASE_URL ? await getPublicWorkflow() : undefined} />
        </Section>
      </main>
    </>
  )
}
