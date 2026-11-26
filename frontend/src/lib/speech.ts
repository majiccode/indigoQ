export interface SpeechResult { isFinal: boolean; length: number; [index: number]: { transcript: string } }
export interface SpeechEvent { resultIndex: number; results: { length: number; [index: number]: SpeechResult } }
export interface SpeechRecognizer {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
export function speechConstructor(): (new () => SpeechRecognizer) | undefined {
  const browser = window as unknown as { SpeechRecognition?: new () => SpeechRecognizer; webkitSpeechRecognition?: new () => SpeechRecognizer };
  return browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
}
export function speechResults(event: SpeechEvent): { final: string; interim: string } {
  const final: string[] = [], interim: string[] = [];
  for (let index = event.resultIndex; index < event.results.length; index++) {
    const result = event.results[index], text = result[0]?.transcript.trim();
    if (text) (result.isFinal ? final : interim).push(text);
  }
  return { final: final.join(" "), interim: interim.join(" ") };
}
export function appendSpeech(existing: string, phrase: string): string {
  if (!phrase.trim()) return existing;
  return existing + (existing && !/\s$/.test(existing) ? " " : "") + phrase.trim();
}
