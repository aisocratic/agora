import { redirect } from "next/navigation"

/* The workspace's sections live at their own URLs; the board is the default. */
export default function Page() {
  redirect("/board")
}
