import { Star } from "lucide-react"

export function PriorityStar({ priority = 1, size = 12 }: { priority?: number; size?: number }) {
  return <span className="agora-priority-glyph" aria-hidden="true" style={{ width: size, height: size }}>
    <Star size={size} />
    {priority > 1 && <span style={{ width: priority === 2 ? "50%" : "100%", height: size }}><Star size={size} fill="currentColor" /></span>}
  </span>
}
