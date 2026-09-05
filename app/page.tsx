import Link from "next/link"
import { Section, SiteHeader, Wordmark } from "@aisocratic/design"
import { Board } from "@/components/board/board"
import { ThemeToggle } from "@aisocratic/design/components/theme-toggle"

export default function Page() {
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
        actions={<ThemeToggle />}
      />

      <main className="min-h-svh">
        <Section lead size="lg">
          <Board />
        </Section>
      </main>
    </>
  )
}
