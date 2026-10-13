import { MAX_IMAGE_LENGTH } from "./task-fields"

/* Turn an uploaded file into a small inline cover: drawn onto a canvas no
   larger than 480×240 (never upscaled), then encoded as JPEG for photos and
   WebP otherwise, or PNG where the browser cannot encode WebP. Large or busy images step down in size
   until they fit the stored limit. */
export async function coverFromFile(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file.")
  if (file.size > 15_000_000) throw new Error("Choose an image under 15 MB.")
  const url = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () => reject(new Error("That image could not be read."))
      element.src = url
    })
    const width = image.naturalWidth || 480
    const height = image.naturalHeight || 240
    for (const box of [[480, 240], [360, 180], [240, 120]] as const) {
      const scale = Math.min(1, box[0] / width, box[1] / height)
      const canvas = document.createElement("canvas")
      canvas.width = Math.max(1, Math.round(width * scale))
      canvas.height = Math.max(1, Math.round(height * scale))
      const context = canvas.getContext("2d")
      if (!context) throw new Error("This browser cannot resize images.")
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      // Photos stay JPEG, so the tile knows to fill itself with them; logos
      // and anything with transparency go to WebP.
      const data = canvas.toDataURL(file.type === "image/jpeg" ? "image/jpeg" : "image/webp", 0.85)
      if (data.length <= MAX_IMAGE_LENGTH) return data
    }
    throw new Error("That image is too detailed to store; try a simpler logo.")
  } finally {
    URL.revokeObjectURL(url)
  }
}
