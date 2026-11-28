import type { ContentEntry } from "./types";

export function textFile(id: string, name: string, text: string, mimeType = "application/json"): ContentEntry {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return { id, name, mimeType, size: bytes.length, dataUrl: `data:${mimeType};base64,${btoa(binary)}` };
}
