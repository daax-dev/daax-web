"use client";

import { useState, useCallback } from "react";
import { VoiceInput } from "@/components/ui/voice-input";

export default function VoiceTestPage() {
  const [receivedTexts, setReceivedTexts] = useState<string[]>([]);

  const handleTranscript = useCallback((text: string) => {
    console.log("=== RECEIVED TRANSCRIPT ===", text);
    setReceivedTexts((prev) => [...prev, text]);
  }, []);

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Voice Input Test</h1>

      <div className="mb-8 p-4 border rounded-lg bg-muted/30">
        <p className="text-sm text-muted-foreground mb-4">
          Click the mic, speak, then click Send. Text should appear below.
        </p>
        <VoiceInput onTranscript={handleTranscript} />
      </div>

      <div className="space-y-2">
        <h2 className="font-semibold">Received texts:</h2>
        {receivedTexts.length === 0 ? (
          <p className="text-muted-foreground italic">No texts received yet</p>
        ) : (
          <ul className="space-y-2">
            {receivedTexts.map((text, i) => (
              <li key={i} className="p-3 bg-primary/10 rounded border">
                {text}
              </li>
            ))}
          </ul>
        )}
      </div>

      <button
        className="mt-4 text-sm text-muted-foreground underline"
        onClick={() => setReceivedTexts([])}
      >
        Clear
      </button>
    </div>
  );
}
