import { Badge, Button, cn } from "@aisocratic/stoa"

/**
 * Phase 0 placeholder. It exists to prove the substrate end to end — Tailwind v4
 * CSS-first tokens, the type scale, the `cn()` font-size class group, the three
 * font roles, and light/dark — before any board code lands. Phase 1 replaces it
 * with the real board.
 */
export default function Page() {
  return (
    <main className="mx-auto flex min-h-svh max-w-3xl flex-col justify-center gap-8 px-6 py-16">
      <div className="space-y-3">
        <p className="text-micro font-code uppercase tracking-widest text-muted-foreground">
          Phase 0 · substrate
        </p>
        <h1 className="text-page font-display">Agora</h1>
        <p className="text-body text-muted-foreground">
          A kanban board built for humans and coding agents.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
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
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button>Primary</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="ghost">Ghost</Button>
        <Badge>backlog</Badge>
        <Badge variant="secondary">doing</Badge>
        {/* The regression this guards: a bare tailwind-merge sorts `text-body`
            into the text-COLOUR group and drops `text-primary-foreground`,
            rendering white on white. See TYPE_SCALE in @aisocratic/stoa. */}
        <span className={cn("rounded bg-primary px-2 py-1 text-primary-foreground", "text-body")}>
          merged colour survives
        </span>
      </div>
    </main>
  )
}
