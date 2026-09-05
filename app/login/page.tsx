import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { Section, Wordmark } from "@aisocratic/design"
import { LoginForm } from "@/components/auth/login-form"
import { authConfig } from "@/lib/server/auth-config"
import { authorizeRequest } from "@/lib/server/authorization"

export const dynamic = "force-dynamic"
export default async function LoginPage() {
  if (!process.env.DATABASE_URL) redirect("/")
  let mode = "unconfigured"
  let authenticated = false
  try {
    mode = authConfig().mode
    await authorizeRequest(new Request("http://localhost/", { headers: await headers() }))
    authenticated = true
  } catch { /* No private data is rendered before authentication. */ }
  if (authenticated) redirect("/")
  return <main className="min-h-svh"><Section size="lg" lead>
    <div className="mx-auto flex max-w-lg flex-col items-center gap-8 text-center">
      <Wordmark height={40} />
      <h1 className="font-display text-4xl">{mode === "password" ? "Sign in to Agora" : "Shared board access"}</h1>
      {mode === "password" ? <LoginForm /> : <p role="alert" className="text-body">{mode === "proxy" ? "Sign in through your organization’s trusted gateway to open this board." : "Shared access is not configured. Ask the board operator to finish setup."}</p>}
    </div>
  </Section></main>
}
