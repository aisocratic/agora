import Link from "next/link"
import { Badge, Button, Card, Section, SiteHeader, Wordmark, cn } from "@aisocratic/stoa"
import { ThemeToggle } from "@aisocratic/stoa/components/theme-toggle"

/**
 * Phase 0 placeholder. It exists to prove the substrate end to end — Tailwind v4
 * CSS-first tokens, the type scale, the `cn()` font-size class group, the three
 * font roles, the site chrome and light/dark — before any board code lands.
 * Phase 1 replaces it with the real board.
 */
export default function Page() {
  return (
    <>
      {/* Stoa's header is out of flow and 104px tall; the first Section takes
          `lead` to clear it. The toggle is the only control the placeholder
          needs, and it doubles as the way to check both themes. */}
      <SiteHeader
        linkComponent={Link}
        brand={
          <Link href="/" aria-label="Agora home" className="flex items-center gap-2 text-foreground">
            <Wordmark height={36} />
            <span className="text-micro font-code text-muted-foreground">/ agora</span>
          </Link>
        }
        actions={<ThemeToggle />}
      />

      <main className="min-h-svh">
        <Section lead size="lg" innerClassName="flex max-w-3xl flex-col gap-8">
          <div className="space-y-3">
            <p className="text-eyebrow font-code text-muted-foreground">Phase 0 · substrate</p>
            <h1 className="text-page font-display">Agora</h1>
            <p className="text-body text-muted-foreground">
              A kanban board built for humans and coding agents.
            </p>
          </div>

          <Card className="p-5">
            <h2 className="text-title font-display mb-4">Type scale</h2>
            {/* Written out rather than mapped: Tailwind extracts class names by
                scanning source text, so a template literal like `text-${step}`
                produces no CSS at all. */}
            <ul className="space-y-1">
              <li className="text-micro">
                <span className="font-code text-micro text-muted-foreground">text-micro</span>{" "}
                The quick brown fox
              </li>
              <li className="text-body">
                <span className="font-code text-micro text-muted-foreground">text-body</span>{" "}
                The quick brown fox
              </li>
              <li className="text-lead">
                <span className="font-code text-micro text-muted-foreground">text-lead</span>{" "}
                The quick brown fox
              </li>
              <li className="text-title font-display">
                <span className="font-code text-micro text-muted-foreground">text-title</span>{" "}
                The quick brown fox
              </li>
              <li className="text-section font-display">
                <span className="font-code text-micro text-muted-foreground">text-section</span>{" "}
                The quick brown fox
              </li>
            </ul>
          </Card>

          <div className="flex flex-wrap items-center gap-3">
            <Button>Primary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Badge>backlog</Badge>
            <Badge variant="secondary">doing</Badge>
            <Badge tone="success">merged</Badge>
            <Badge tone="warning">needs review</Badge>
            {/* The regression this guards: a bare tailwind-merge sorts `text-body`
                into the text-COLOUR group and drops `text-primary-foreground`,
                rendering white on white. See TYPE_SCALE in @aisocratic/stoa. */}
            <span className={cn("rounded-md bg-primary px-2 py-1 text-primary-foreground", "text-body")}>
              merged colour survives
            </span>
          </div>
        </Section>
      </main>
    </>
  )
}
