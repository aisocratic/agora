import { redirect } from "next/navigation"

/* The board used to live at /cards; keep old links working. */
export default function Page() {
  redirect("/board")
}
