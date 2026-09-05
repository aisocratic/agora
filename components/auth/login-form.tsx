"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"

export function LoginForm() {
  const router = useRouter()
  const [password, setPassword] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  return <form onSubmit={async (event) => {
    event.preventDefault()
    if (pending) return
    setPending(true)
    setError("")
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) })
      if (!response.ok) throw new Error((await response.json()).error ?? "Could not sign in.")
      setPassword("")
      router.replace("/")
      router.refresh()
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not sign in."); setPending(false) }
  }} className="mx-auto flex w-full max-w-sm flex-col gap-4">
    <label htmlFor="password" className="text-body">Shared password</label>
    <input id="password" type="password" autoComplete="current-password" required maxLength={1024}
      value={password} onChange={(event) => setPassword(event.target.value)}
      className="rounded border border-border bg-background px-3 py-2 text-foreground" />
    {error && <p role="alert" className="text-body">{error}</p>}
    <button disabled={pending} className="rounded bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50" type="submit">{pending ? "Signing in…" : "Sign in"}</button>
  </form>
}
