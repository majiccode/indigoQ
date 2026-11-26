const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");

async function check(response: Response) {
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(typeof error?.detail === "string" ? error.detail : `Ollama request failed (${response.status})`);
  }
}

export async function fetchModels(signal?: AbortSignal): Promise<string[]> {
  const response = await fetch(`${API_BASE}/api/ollama/models`, { signal, cache: "no-store" });
  await check(response);
  const payload = await response.json();
  return payload.models.map((model: { name: string }) => model.name);
}

export async function generateText(
  body: { model: string; prompt: string; system: string; temperature: number; jsonOutput: boolean },
  signal: AbortSignal,
  onChunk: (text: string) => void,
) {
  const response = await fetch(`${API_BASE}/api/ollama/generate`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal,
  });
  await check(response);
  if (!response.body) throw new Error("Streaming is unavailable");
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let buffer = "", output = "", done = false;
  const consume = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line);
    if (event.error) throw new Error(event.error);
    if (event.response) { output += event.response; onChunk(output); }
    if (event.done) done = true;
  };
  try {
    while (true) {
      const { value, done: ended } = await reader.read();
      buffer += decoder.decode(value, { stream: !ended });
      const lines = buffer.split("\n"); buffer = lines.pop() ?? "";
      lines.forEach(consume);
      if (ended) { consume(buffer); break; }
    }
    if (!done) throw new Error("Ollama stream ended before generation completed");
    return output;
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
