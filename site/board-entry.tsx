import { createRoot } from "react-dom/client"
import { Board } from "../components/board/board"

const root = document.getElementById("agora-board")
if (root) createRoot(root).render(<Board />)
