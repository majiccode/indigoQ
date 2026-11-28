import type { ContentEntry } from "./types";

export function isVideo(file: ContentEntry): boolean {
  const mime = file.mimeType.toLowerCase().split(";")[0].trim();
  if (mime.startsWith("video/")) return true;
  // Explicit non-video types take precedence (e.g. Audio Lab's audio/webm).
  return (!mime || mime === "application/octet-stream") && /\.(mp4|m4v|webm|ogv|ogg|mov|avi|mkv|mpeg|mpg|3gp|3g2)$/i.test(file.name);
}
