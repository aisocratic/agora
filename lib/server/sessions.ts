import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto"
import { promisify } from "node:util"
import { getPool } from "./database"
import { HttpError, type AuthConfig } from "./auth-config"

const hash = (value: string) => createHash("sha256").update(value).digest("hex")
const derive = promisify(scrypt)
export const SESSION_COOKIE = "agora_session"
export const SESSION_SECONDS = 12 * 60 * 60
const signature = (payload: string, config: AuthConfig) => createHmac("sha256", `${config.sessionSecret}:${hash(config.password!)}`).update(payload).digest("base64url")
export function sessionCookie(value: string, maxAge = SESSION_SECONDS) {
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`
}
function tokenFrom(request: Request) {
  const values = (request.headers.get("cookie") ?? "").split(";").map((part) => part.trim()).filter((part) => part.startsWith(`${SESSION_COOKIE}=`))
  return values.length === 1 ? values[0].slice(SESSION_COOKIE.length + 1) : ""
}
export function decodeSession(token: string, config: AuthConfig, now = Date.now()) {
  const [payload, supplied, extra] = token.split(".")
  if (!payload || !supplied || !/^[A-Za-z0-9_-]{43}$/.test(supplied) || extra || token.length > 1024) return null
  const expected = signature(payload, config)
  if (supplied.length !== expected.length || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return null
  try {
    const value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))
    if (typeof value.sid !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(value.sid) || !Number.isSafeInteger(value.exp) || value.exp <= now / 1000 || value.exp > now / 1000 + SESSION_SECONDS + 1) return null
    return { idHash: hash(value.sid), expires: value.exp }
  } catch { return null }
}
export async function verifySession(request: Request, config: AuthConfig): Promise<string | null> {
  const session = decodeSession(tokenFrom(request), config)
  if (!session) return null
  const { rows } = await getPool().query("SELECT name FROM auth_sessions WHERE id_hash=$1 AND expires_at > now()", [session.idHash])
  return rows[0]?.name ?? null
}
export async function issueSession(config: AuthConfig) {
  const sid = randomBytes(32).toString("base64url")
  const exp = Math.floor(Date.now() / 1000) + SESSION_SECONDS
  await getPool().query("DELETE FROM auth_sessions WHERE expires_at <= now()")
  await getPool().query("INSERT INTO auth_sessions (id_hash,name,expires_at) VALUES ($1,$2,to_timestamp($3))", [hash(sid), config.userName, exp])
  const payload = Buffer.from(JSON.stringify({ sid, exp })).toString("base64url")
  return `${payload}.${signature(payload, config)}`
}
export async function revokeSession(request: Request, config: AuthConfig) {
  const session = decodeSession(tokenFrom(request), config)
  if (session) await getPool().query("DELETE FROM auth_sessions WHERE id_hash=$1", [session.idHash])
}
export async function checkPassword(password: string, config: AuthConfig) {
  const [provided, expected] = await Promise.all([derive(password, config.sessionSecret!, 32), derive(config.password!, config.sessionSecret!, 32)])
  return timingSafeEqual(provided as Buffer, expected as Buffer)
}
export async function reserveLoginAttempt() {
  // A database-backed budget covers all processes without trusting forwarding headers.
  const { rows } = await getPool().query(`INSERT INTO auth_login_attempts (key,started_at,attempts) VALUES ('password',now(),1)
    ON CONFLICT (key) DO UPDATE SET
      attempts=CASE WHEN auth_login_attempts.started_at < now()-interval '15 minutes' THEN 1 ELSE auth_login_attempts.attempts+1 END,
      started_at=CASE WHEN auth_login_attempts.started_at < now()-interval '15 minutes' THEN now() ELSE auth_login_attempts.started_at END
    RETURNING attempts`)
  if (rows[0].attempts > 10) throw new HttpError(429, "Too many sign-in attempts. Try again in 15 minutes.")
}
