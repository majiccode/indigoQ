export function speechChunks(text: string, limit = 350): string[] {
  if (!Number.isInteger(limit) || limit < 1) throw new Error("Chunk limit must be a positive integer");
  const chunks: string[] = [];
  let rest = text.trim();
  while (rest.length > limit) {
    const window = rest.slice(0, limit);
    const sentences = [...window.matchAll(/[.!?](?:\s|$)|\n/g)];
    let end = sentences.length ? sentences[sentences.length - 1].index! + 1 : window.lastIndexOf(" ");
    if (end < limit / 3) end = limit;
    chunks.push(rest.slice(0, end).trim());
    rest = rest.slice(end).trim();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

export function appendedText(previous: string, current: string): string {
  // Replacement and source edits establish a new baseline, rather than replaying a document.
  return current.startsWith(previous) ? current.slice(previous.length) : "";
}

interface Utterance {
  text: string;
  onend: ((event: SpeechSynthesisEvent) => void) | null;
  onerror: ((event: SpeechSynthesisErrorEvent) => void) | null;
}
interface Synth<U extends Utterance> {
  speak(utterance: U): void;
  cancel(): void;
  pause(): void;
  resume(): void;
}

export class SpeechQueue<U extends Utterance> {
  private queue: string[] = [];
  private current: U | null = null;
  private generation = 0;
  private paused = false;
  constructor(private synth: Synth<U>, private create: (text: string) => U, private state: (busy: boolean) => void, private error: (message: string) => void) {}
  enqueue(text: string) {
    this.queue.push(...speechChunks(text));
    if (!this.current && !this.paused) this.next();
  }
  private next() {
    const text = this.queue.shift();
    if (!text) { this.current = null; this.state(false); return; }
    const generation = this.generation;
    try {
      const utterance = this.create(text);
      this.current = utterance;
      this.state(true);
      utterance.onend = () => {
        if (generation !== this.generation) return;
        this.current = null;
        if (!this.paused) this.next();
      };
      utterance.onerror = (event) => {
        if (generation !== this.generation) return;
        this.stop();
        if (event.error !== "canceled" && event.error !== "interrupted") this.error(`Speech failed (${event.error}). Try a different voice or press Speak it all again.`);
      };
      this.synth.speak(utterance);
    } catch (reason) { this.stop(); this.error(reason instanceof Error ? reason.message : "Speech playback failed"); }
  }
  stop() {
    this.generation++; this.queue = []; this.current = null; this.paused = false;
    this.synth.cancel(); this.state(false);
  }
  pause() { this.paused = true; this.synth.pause(); }
  resume() { this.paused = false; this.synth.resume(); if (!this.current) this.next(); }
  dispose() { this.generation++; this.queue = []; this.current = null; this.synth.cancel(); }
}
