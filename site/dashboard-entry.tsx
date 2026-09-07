import { createRoot } from "react-dom/client"
import { ThemeProvider } from "next-themes"
import { TestDashboard } from "../components/board/test-dashboard"

const root = document.getElementById("agora-dashboard")
if (root) createRoot(root).render(<ThemeProvider attribute="class" defaultTheme="dark" storageKey="agora-theme" enableSystem disableTransitionOnChange>
  <TestDashboard homeHref="../../" />
</ThemeProvider>)
