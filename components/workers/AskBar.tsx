"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { VoiceInput } from "@/components/ui/voice-input";
import { TERMINAL_RUN_STATUSES, type WorkerRun } from "@/types/workers";
import { workersApi } from "./api";
import { useRunFollower } from "./RunTimeline";
import { Markdown } from "./Markdown";
import { RunStatusBadge } from "./format";
import { firstSection, parseVoiceIntent, speakable } from "./voice";

const SPEAK_KEY = "daax.workers.speak";

function speak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(new SpeechSynthesisUtterance(speakable(text)));
}

function stopSpeaking() {
  if (typeof window !== "undefined" && "speechSynthesis" in window)
    window.speechSynthesis.cancel();
}

interface AskBarProps {
  workerId: string;
  workerName: string;
  enabled: boolean;
  brief: WorkerRun | null;
  onChanged: () => void;
}

/**
 * Ask a worker a question by typing or by voice. Control phrases ("run now",
 * "pause", "resume", "status", "stop") act directly; anything else becomes
 * an ad hoc run whose answer streams in and can be read aloud.
 */
export function AskBar({
  workerId,
  workerName,
  enabled,
  brief,
  onChanged,
}: AskBarProps) {
  const [text, setText] = useState("");
  const [runId, setRunId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [speakOn, setSpeakOn] = useState(false);
  const { run, events } = useRunFollower(runId);
  const spokenFor = useRef<string | null>(null);

  useEffect(() => {
    setSpeakOn(localStorage.getItem(SPEAK_KEY) === "1");
  }, []);

  useEffect(() => {
    if (
      !run ||
      !TERMINAL_RUN_STATUSES.includes(run.status) ||
      spokenFor.current === run.id
    )
      return;
    spokenFor.current = run.id;
    onChanged();
    if (!speakOn) return;
    if (run.summary) speak(run.summary);
    else if (run.error) speak(`The run ${run.status}. ${run.error}`);
  }, [run, speakOn, onChanged]);

  const toggleSpeak = () => {
    const next = !speakOn;
    setSpeakOn(next);
    localStorage.setItem(SPEAK_KEY, next ? "1" : "0");
    if (!next) stopSpeaking();
  };

  const say = (message: string) => {
    setNotice(message);
    if (speakOn) speak(message);
  };

  const submit = async (raw: string, via: "adhoc" | "voice") => {
    const intent = parseVoiceIntent(raw);
    setError(null);
    setNotice(null);
    try {
      switch (intent.kind) {
        case "stop":
          stopSpeaking();
          if (run && !TERMINAL_RUN_STATUSES.includes(run.status)) {
            await workersApi.cancelRun(run.id);
            say("Cancelled the run.");
          }
          return;
        case "pause":
          await workersApi.update(workerId, { enabled: false });
          onChanged();
          return say(`${workerName} is paused.`);
        case "resume":
          await workersApi.update(workerId, { enabled: true });
          onChanged();
          return say(`${workerName} is running on its schedule again.`);
        case "status":
          return say(
            brief?.summary
              ? speakable(firstSection(brief.summary))
              : "There is no report yet.",
          );
        case "run":
        case "ask": {
          const input = intent.kind === "ask" ? intent.text : "";
          const res = await workersApi.startRun(workerId, input, via);
          setRunId(res.run.id);
          setText("");
          onChanged();
          return;
        }
      }
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const active = run && !TERMINAL_RUN_STATUSES.includes(run.status);
  const lastMessage = [...events]
    .reverse()
    .find((e) => e.type === "message")?.text;

  return (
    <div className="space-y-3 rounded-lg border p-4" data-testid="ask-bar">
      <div className="flex items-start gap-2">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && text.trim()) {
              e.preventDefault();
              void submit(text, "adhoc");
            }
          }}
          placeholder={`Ask ${workerName} — e.g. "what's blocking the Postgres work?" — or say "run now", "pause", "status"`}
          className="min-h-[44px] flex-1 resize-none"
          rows={1}
          aria-label="Ask the worker"
          disabled={Boolean(active)}
        />
        <VoiceInput
          onTranscript={(t) => void submit(t, "voice")}
          disabled={Boolean(active)}
        />
        <Button
          onClick={() => void submit(text, "adhoc")}
          disabled={!text.trim() || Boolean(active)}
          aria-label="Send"
        >
          <Send className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          onClick={toggleSpeak}
          aria-label={
            speakOn ? "Stop reading answers aloud" : "Read answers aloud"
          }
          aria-pressed={speakOn}
          title={speakOn ? "Answers are read aloud" : "Answers are silent"}
        >
          {speakOn ? (
            <Volume2 className="h-4 w-4" />
          ) : (
            <VolumeX className="h-4 w-4" />
          )}
        </Button>
      </div>
      {!enabled && (
        <p className="text-xs text-muted-foreground">
          Automatic runs are paused; questions and &ldquo;run now&rdquo; still
          work.
        </p>
      )}
      {notice && <p className="text-sm">{notice}</p>}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {run && (
        <div className="space-y-2" data-testid="ask-answer">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <RunStatusBadge status={run.status} />
            {active && <span>{events.length} steps so far…</span>}
          </div>
          {active && lastMessage && (
            <p className="text-sm text-muted-foreground">{lastMessage}</p>
          )}
          {run.summary && <Markdown text={run.summary} />}
          {run.error && <p className="text-sm text-destructive">{run.error}</p>}
        </div>
      )}
    </div>
  );
}
