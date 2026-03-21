"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Mic, MicOff, Send, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getSettings } from "@/lib/settings";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// Web Speech API types
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition: new () => SpeechRecognitionInstance;
  }
}

// Detect iOS (iPhone, iPad, iPod)
function isIOS(): boolean {
  if (typeof window === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

// Check if running in secure context (HTTPS or localhost)
function isSecureContext(): boolean {
  if (typeof window === "undefined") return true;
  return (
    window.isSecureContext ||
    window.location.protocol === "https:" ||
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
  );
}

// Error messages for different speech recognition errors
const ERROR_MESSAGES: Record<string, string> = {
  "not-allowed":
    "Microphone access denied. Please allow microphone permission in your browser settings.",
  "no-speech": "No speech detected. Please try again.",
  "audio-capture": "No microphone found. Please connect a microphone.",
  network: "Network error. Please check your connection.",
  aborted: "Speech recognition was aborted.",
  "service-not-allowed":
    "Speech recognition service not allowed. Try using HTTPS.",
};

export interface VoiceInputProps {
  onTranscript: (text: string) => void;
  className?: string;
  disabled?: boolean;
}

export function VoiceInputClient({
  onTranscript,
  className,
  disabled = false,
}: VoiceInputProps) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [permissionState, setPermissionState] = useState<
    PermissionState | "unknown"
  >("unknown");

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTranscriptRef = useRef("");
  const onTranscriptRef = useRef(onTranscript);
  const hasSentRef = useRef(false); // Guard against double-send

  // Keep callback ref updated
  onTranscriptRef.current = onTranscript;

  // Get settings
  const settings = getSettings();
  const sendWord = settings.voiceSendWord?.toLowerCase() || "";
  const silenceTimeout = (settings.voiceSilenceTimeout || 2) * 1000;

  // Check browser support - iOS Safari doesn't support Web Speech API
  const hasSpeechAPI =
    typeof window !== "undefined" &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  const oniOS = typeof window !== "undefined" && isIOS();
  const isSecure = typeof window !== "undefined" && isSecureContext();

  // iOS Safari doesn't support SpeechRecognition even with webkit prefix
  // Chrome on iOS also uses WebKit and has the same limitation
  const isSupported = hasSpeechAPI && !oniOS && isSecure;

  // Check microphone permission on mount
  useEffect(() => {
    if (!hasSpeechAPI || oniOS || !isSecure) return;

    // Check permission status if API is available
    if (navigator.permissions) {
      navigator.permissions
        .query({ name: "microphone" as PermissionName })
        .then((result) => {
          setPermissionState(result.state);
          result.onchange = () => setPermissionState(result.state);
        })
        .catch(() => {
          // Permission API not supported for microphone in this browser
          setPermissionState("unknown");
        });
    }
  }, [hasSpeechAPI, oniOS, isSecure]);

  // Process and send transcript
  const processAndSend = useCallback(
    (text: string) => {
      // Guard against double-send
      if (hasSentRef.current) {
        console.log("Already sent, ignoring");
        return;
      }
      hasSentRef.current = true;

      let finalText = text.trim();

      // If send word is configured, check for it and remove it
      if (sendWord && finalText.toLowerCase().endsWith(sendWord)) {
        finalText = finalText.slice(0, -sendWord.length).trim();
      }

      if (finalText) {
        console.log("Sending transcript:", finalText);
        onTranscriptRef.current(finalText);
      }

      // Clean up
      setTranscript("");
      lastTranscriptRef.current = "";
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
      setIsListening(false);
    },
    [sendWord],
  );

  // Request microphone permission explicitly
  const requestMicrophonePermission =
    useCallback(async (): Promise<boolean> => {
      try {
        // Request microphone access - this triggers the permission prompt
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        // Stop the stream immediately - we just needed permission
        stream.getTracks().forEach((track) => track.stop());
        setPermissionState("granted");
        setError(null);
        return true;
      } catch (err) {
        const error = err as Error;
        if (
          error.name === "NotAllowedError" ||
          error.name === "PermissionDeniedError"
        ) {
          setError(ERROR_MESSAGES["not-allowed"]);
          setPermissionState("denied");
        } else if (error.name === "NotFoundError") {
          setError(ERROR_MESSAGES["audio-capture"]);
        } else {
          setError(`Microphone error: ${error.message}`);
        }
        return false;
      }
    }, []);

  const startListening = useCallback(async () => {
    const SpeechRecognitionClass =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionClass) return;

    // Clear any previous error
    setError(null);

    // Request microphone permission first (especially important on mobile)
    const hasPermission = await requestMicrophonePermission();
    if (!hasPermission) {
      return;
    }

    const recognition = new SpeechRecognitionClass();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let text = "";
      for (let i = 0; i < event.results.length; i++) {
        text += event.results[i][0].transcript;
      }

      // Only update/reset timer if text changed
      if (text !== lastTranscriptRef.current) {
        console.log("Speech:", text);
        setTranscript(text);
        lastTranscriptRef.current = text;

        // Check if send word was spoken (at the end)
        if (sendWord && text.toLowerCase().trim().endsWith(sendWord)) {
          // Clear any pending timer
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = null;
          }
          // Send immediately
          processAndSend(text);
          return;
        }

        // Clear existing timer
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
        }

        // If no send word configured, auto-send after silence timeout
        if (!sendWord) {
          silenceTimerRef.current = setTimeout(() => {
            console.log(
              "Auto-sending after silence:",
              lastTranscriptRef.current,
            );
            processAndSend(lastTranscriptRef.current);
          }, silenceTimeout);
        }
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error("Speech error:", event.error);
      const errorMessage =
        ERROR_MESSAGES[event.error] ||
        `Speech recognition error: ${event.error}`;
      setError(errorMessage);
      setIsListening(false);

      // Update permission state if it was a permission error
      if (event.error === "not-allowed") {
        setPermissionState("denied");
      }
    };

    recognition.onend = () => {
      // Recognition ended - only update if we're not already in an error state
      if (isListening) {
        setIsListening(false);
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setIsListening(true);
      setTranscript("");
      lastTranscriptRef.current = "";
      hasSentRef.current = false; // Reset guard
    } catch (err) {
      const error = err as Error;
      console.error("Failed to start recognition:", error);
      setError(`Failed to start: ${error.message}`);
    }
  }, [
    sendWord,
    silenceTimeout,
    processAndSend,
    requestMicrophonePermission,
    isListening,
  ]);

  const stopListening = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setTranscript("");
    lastTranscriptRef.current = "";
    setIsListening(false);
  }, []);

  const sendTranscript = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    processAndSend(transcript);
  }, [transcript, processAndSend]);

  const handleMicClick = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  // Show informative message for iOS users
  if (oniOS) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            disabled
            className="opacity-50 cursor-not-allowed"
          >
            <Mic className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[250px]">
          <p className="text-sm">
            Voice input is not available on iOS devices. Safari and Chrome on
            iOS do not support the Web Speech API.
          </p>
        </TooltipContent>
      </Tooltip>
    );
  }

  // Show message for non-HTTPS contexts
  if (!isSecure) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            disabled
            className="opacity-50 cursor-not-allowed"
          >
            <Mic className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[250px]">
          <p className="text-sm">
            Voice input requires HTTPS. Please access this site over HTTPS or
            localhost.
          </p>
        </TooltipContent>
      </Tooltip>
    );
  }

  // Browser doesn't support Speech Recognition
  if (!hasSpeechAPI) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            disabled
            className="opacity-50 cursor-not-allowed"
          >
            <Mic className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[250px]">
          <p className="text-sm">
            Voice input is not supported in this browser. Try Chrome or Edge.
          </p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={
              isListening ? "destructive" : error ? "outline" : "outline"
            }
            size="icon"
            onClick={handleMicClick}
            disabled={disabled && !isListening}
            className={cn(
              error &&
                !isListening &&
                "border-destructive text-destructive hover:text-destructive",
              permissionState === "denied" &&
                "border-destructive text-destructive",
            )}
          >
            {isListening ? (
              <MicOff className="h-4 w-4" />
            ) : error || permissionState === "denied" ? (
              <AlertCircle className="h-4 w-4" />
            ) : (
              <Mic className="h-4 w-4" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[300px]">
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : disabled ? (
            <p className="text-sm">Connecting to terminal...</p>
          ) : permissionState === "denied" ? (
            <p className="text-sm text-destructive">
              Microphone access denied. Click to try again or check browser
              settings.
            </p>
          ) : isListening ? (
            <p className="text-sm">Click to stop listening</p>
          ) : (
            <p className="text-sm">
              Start voice input
              {sendWord ? ` (say "${sendWord}" to submit)` : ""}
            </p>
          )}
        </TooltipContent>
      </Tooltip>

      {transcript && (
        <>
          <span className="text-sm text-muted-foreground italic truncate max-w-[300px]">
            {transcript}
          </span>
          <Button
            variant="default"
            size="icon"
            onClick={sendTranscript}
            title="Send now"
          >
            <Send className="h-4 w-4" />
          </Button>
        </>
      )}

      {isListening && sendWord && (
        <span className="text-xs text-muted-foreground">
          Say &quot;{sendWord}&quot; to submit
        </span>
      )}

      {error && !isListening && (
        <span className="text-xs text-destructive truncate max-w-[200px]">
          {error}
        </span>
      )}
    </div>
  );
}
