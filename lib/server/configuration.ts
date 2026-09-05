import { readFile } from "node:fs/promises"
import { isAbsolute } from "node:path"
import { z } from "zod"
import defaults from "../../agora.config"
import { workflowSchema } from "../workflow"
import { HttpError } from "./auth-config"

const envName = z.string().regex(/^[A-Z][A-Z0-9_]{0,99}$/)
const timeoutMs = z.number().int().min(100).max(60000).default(15000)
const httpUrl = z.url().refine((url) => ["http:", "https:"].includes(new URL(url).protocol) && !new URL(url).username && !new URL(url).password)
export const dispatcherSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("none") }).strict(),
  z.object({ type: z.literal("webhook"), url: httpUrl, secretEnv: envName, timeoutMs }).strict(),
  z.object({ type: z.literal("command"), executable: z.string().refine(isAbsolute, "Use an absolute executable path"), args: z.array(z.string()).max(100).default([]), cwd: z.string().refine(isAbsolute).optional(), timeoutMs }).strict(),
  z.object({ type: z.literal("github"), owner: z.string().regex(/^[A-Za-z0-9_.-]+$/), repo: z.string().regex(/^[A-Za-z0-9_.-]+$/), workflow: z.string().regex(/^[A-Za-z0-9_.-]+$/), ref: z.string().min(1).max(200), tokenEnv: envName, timeoutMs }).strict(),
])
export const configurationSchema = z.object({ workflow: workflowSchema, dispatcher: dispatcherSchema }).strict()
export type Configuration = z.infer<typeof configurationSchema>
export async function getConfiguration(): Promise<Configuration> {
  try {
    const value = process.env.AGORA_CONFIG_FILE ? JSON.parse(await readFile(process.env.AGORA_CONFIG_FILE, "utf8")) : defaults
    return configurationSchema.parse(value)
  } catch { throw new HttpError(503, "Board configuration is invalid. Ask the operator to check it.") }
}
export async function getPublicWorkflow() { return (await getConfiguration()).workflow }
