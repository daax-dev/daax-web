// Voice helpers for the ask bar: control intents handled without an LLM run,
// and markdown → plain text for speech synthesis.

export type VoiceIntent =
  | { kind: "run" }
  | { kind: "pause" }
  | { kind: "resume" }
  | { kind: "status" }
  | { kind: "stop" }
  | { kind: "ask"; text: string };

const CONTROL: [RegExp, VoiceIntent["kind"]][] = [
  [/^(run( it)?( now)?|check in( now)?|start( a)? run)$/, "run"],
  [/^(pause|pause (the )?worker|stop scheduling)$/, "pause"],
  [/^(resume|resume (the )?worker|unpause|start scheduling)$/, "resume"],
  [/^(status|what'?s the status|read (me )?the (brief|status))$/, "status"],
  [/^(stop|stop talking|be quiet|cancel)$/, "stop"],
];

export function parseVoiceIntent(raw: string): VoiceIntent {
  const text = raw.trim();
  const normalized = text
    .toLowerCase()
    .replace(/[.!?,]+$/g, "")
    .replace(/\s+/g, " ");
  for (const [re, kind] of CONTROL) {
    if (re.test(normalized)) return { kind } as VoiceIntent;
  }
  return { kind: "ask", text };
}

/** Strip markdown to something a speech synthesizer reads naturally. */
export function speakable(markdown: string, maxChars = 1_500): string {
  const text = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^\s*\|?\s*:?-{3,}.*$/gm, "")
    .replace(/\|/g, ", ")
    .replace(/^#{1,6}\s+(.*)$/gm, "$1.")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`>#]/g, "")
    .replace(/^\s*[-+]\s+/gm, "")
    .replace(/\s*,\s*,/g, ",")
    .replace(/\n{2,}/g, ". ")
    .replace(/\n/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/\.\s*\./g, ".")
    .trim();
  return text.length > maxChars ? `${text.slice(0, maxChars)}…` : text;
}

/** First section of a report (for "status"). */
export function firstSection(markdown: string): string {
  const parts = markdown.split(/\n(?=##\s)/);
  return (parts[0].startsWith("##") ? parts[0] : (parts[1] ?? parts[0])).trim();
}
