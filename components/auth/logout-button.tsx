"use client"
import { useState } from "react"
export function LogoutButton() {
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)
  return <div><button type="button" disabled={pending} className="text-sm text-foreground" onClick={async () => {
    setPending(true)
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" })
      if (!response.ok) throw new Error("Could not sign out. Try again.")
      window.location.replace("/login")
    } catch { setError("Could not sign out. Try again."); setPending(false) }
  }}>{pending ? "Signing out…" : "Sign out"}</button>{error && <p role="alert">{error}</p>}</div>
}
