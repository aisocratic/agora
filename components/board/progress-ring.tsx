import type { SubtaskProgress } from "../../lib/subtasks"

/* The share of a card's subtasks that are done, as a ring the size of an
   info-bar icon. */
export function ProgressRing({ percent }: { percent: number }) {
  return <svg viewBox="0 0 16 16" className="agora-progress-ring" aria-hidden="true">
    <circle cx="8" cy="8" r="6" />
    <circle cx="8" cy="8" r="6" pathLength={100} strokeDasharray={`${percent} 100`} strokeLinecap={percent > 0 && percent < 100 ? "round" : "butt"} />
  </svg>
}

/* A parent card's info-bar entry: how many leaves sit under it, the ring and
   the percent done. */
export function SubtreeProgress({ progress }: { progress: SubtaskProgress }) {
  const label = `${progress.done} of ${progress.total} ${progress.total === 1 ? "subtask" : "subtasks"} done (${progress.percent}%)`
  return <span className="agora-card-progress" data-card-progress={progress.percent} title={label} aria-label={label} role="img">
    <ProgressRing percent={progress.percent} />{progress.percent}%
  </span>
}
