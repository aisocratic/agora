"use client"

import { useRef, useState } from "react"
import { FolderKanban, ImageUp, Trash2 } from "lucide-react"
import { coverFromFile } from "../../lib/cover-image"
import { isImageSource } from "../../lib/task-fields"

const DARK = "#dark"
const isUpload = (value: string) => value.startsWith("data:")

const isPhoto = (src: string) => /^data:image\/jpeg|\.jpe?g($|[?#])/i.test(src)

/* A logo or cover image on a small white tile, so dark marks read in both
   themes; a source ending in #dark asks for a black tile for white marks.
   A photo (a JPEG) fills the tile edge to edge instead of sitting inside it.
   Projects without an image get a folder mark instead. */
export function LogoTile({ src, fallback = false }: { src?: string | null; fallback?: boolean }) {
  if (!src) return fallback ? <span className="agora-logo-tile" data-empty aria-hidden="true"><FolderKanban size={15} /></span> : null
  // A plain <img>: the board also ships as a static bundle without Next's image loader.
  // eslint-disable-next-line @next/next/no-img-element
  return <span className="agora-logo-tile" data-dark={src.endsWith(DARK) || undefined} data-photo={isPhoto(src) || undefined}><img src={src} alt="" loading="lazy" /></span>
}

/* Upload, replace, link or remove a cover. Uploads are downscaled in the
   browser and stored inline with the card, so they work on local and shared
   boards alike without a separate file store. */
export function CoverField({ id, value, onChange }: { id: string; value?: string | null; onChange: (value: string | null) => void }) {
  const file = useRef<HTMLInputElement>(null)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [link, setLink] = useState(value && !isUpload(value) ? value.replace(DARK, "") : "")
  const dark = !!value?.endsWith(DARK)
  const withTone = (source: string, isDark: boolean) => `${source.replace(DARK, "")}${isDark ? DARK : ""}`
  const upload = async (picked?: File) => {
    if (!picked) return
    setBusy(true)
    setError("")
    try {
      onChange(withTone(await coverFromFile(picked), dark))
      setLink("")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That image could not be used.")
    } finally {
      setBusy(false)
      if (file.current) file.current.value = ""
    }
  }
  const commitLink = () => {
    const next = link.trim()
    if (!next) { if (value && !isUpload(value)) onChange(null); return }
    if (!isImageSource(next)) { setError("Use an http:// or https:// image address."); return }
    setError("")
    onChange(withTone(next, dark))
  }
  return <div className="agora-cover-field">
    <div className="agora-cover-preview">
      {value ? <LogoTile src={value} /> : <span className="agora-logo-tile" data-empty aria-hidden="true"><ImageUp size={15} /></span>}
      <div className="agora-cover-actions">
        <button type="button" className="agora-btn" disabled={busy} onClick={() => file.current?.click()}><ImageUp size={13} />{busy ? "Uploading…" : value ? "Replace image" : "Upload image"}</button>
        {value && <button type="button" className="agora-btn" onClick={() => { onChange(null); setLink(""); setError("") }}><Trash2 size={13} />Remove</button>}
      </div>
      <input ref={file} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" hidden aria-label="Cover image file" onChange={event => void upload(event.target.files?.[0])} />
    </div>
    <input id={id} type="url" value={link} placeholder={value && isUpload(value) ? "Uploaded image · or paste an image URL" : "or paste an image URL"} onChange={event => setLink(event.target.value)} onBlur={commitLink} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); commitLink() } }} />
    {value && <label className="agora-check"><input type="checkbox" checked={dark} onChange={event => onChange(withTone(value, event.target.checked))} />Dark tile, for a white logo</label>}
    {error && <p className="agora-cover-error" role="alert">{error}</p>}
  </div>
}
