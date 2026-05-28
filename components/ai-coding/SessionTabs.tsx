"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  X,
  Plus,
  Bot,
  Code,
  Sparkles,
  Wand2,
  Terminal,
  Circle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  type AIAgent,
  type AISession,
  type SessionStatus,
  AI_AGENTS,
} from "@/types/ai-session";

interface SessionTabsProps {
  /** Array of sessions to display as tabs */
  sessions: AISession[];
  /** Currently active session ID */
  activeSessionId: string | null;
  /** Callback when a tab is selected */
  onSelectSession: (sessionId: string) => void;
  /** Callback when a tab is closed */
  onCloseSession: (sessionId: string) => void;
  /** Callback when add button is clicked */
  onAddSession: () => void;
  /** Optional callback when a session is renamed */
  onRenameSession?: (sessionId: string, newName: string) => void;
  /** Custom class name */
  className?: string;
}

// Map icon names to components
const iconMap: Record<string, React.ElementType> = {
  Bot,
  Github: Code,
  Code,
  Sparkles,
  Zap: Wand2,
  Wand2,
  Gem: Sparkles,
  Terminal,
};

// Status indicator colors (use text-* for SVG fill-current)
const statusColors: Record<SessionStatus, string> = {
  starting: "text-yellow-500 animate-pulse",
  running: "text-green-500",
  stopped: "text-gray-400",
  error: "text-red-500",
};

// Helper functions defined at module level to avoid hoisting issues
function getAgentIcon(agent: AIAgent): React.ElementType {
  const iconName = AI_AGENTS[agent]?.icon || "Bot";
  return iconMap[iconName] || Bot;
}

function getDefaultSessionName(session: AISession): string {
  const agentInfo = AI_AGENTS[session.agent];
  return agentInfo?.name || session.agent;
}

/**
 * SessionTabs - Tab bar component for managing AI coding sessions
 *
 * Features:
 * - Display tabs for each active session
 * - Show agent icon and session name
 * - Status indicator (running/stopped/error)
 * - Close button on each tab
 * - Add button to create new session
 * - Double-click to rename session
 */
export function SessionTabs({
  sessions,
  activeSessionId,
  onSelectSession,
  onCloseSession,
  onAddSession,
  onRenameSession,
  className,
}: SessionTabsProps) {
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when editing starts
  useEffect(() => {
    if (editingSessionId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingSessionId]);

  const handleStartEditing = useCallback(
    (session: AISession, e: React.MouseEvent) => {
      e.stopPropagation();
      if (!onRenameSession) return;
      setEditingSessionId(session.id);
      setEditingName(session.name || getDefaultSessionName(session));
    },
    [onRenameSession],
  );

  const handleFinishEditing = useCallback(() => {
    if (editingSessionId && editingName.trim() && onRenameSession) {
      onRenameSession(editingSessionId, editingName.trim());
    }
    setEditingSessionId(null);
    setEditingName("");
  }, [editingSessionId, editingName, onRenameSession]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        handleFinishEditing();
      } else if (e.key === "Escape") {
        setEditingSessionId(null);
        setEditingName("");
      }
    },
    [handleFinishEditing],
  );

  const handleClose = useCallback(
    (sessionId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      onCloseSession(sessionId);
    },
    [onCloseSession],
  );

  if (sessions.length === 0) {
    return (
      <div
        className={cn(
          "flex items-center border-b bg-muted/30 px-2 py-1",
          className,
        )}
      >
        <Button
          variant="ghost"
          size="sm"
          onClick={onAddSession}
          className="gap-2 text-muted-foreground"
        >
          <Plus className="h-4 w-4" />
          New Session
        </Button>
      </div>
    );
  }

  return (
    <div className={cn("flex items-center border-b bg-muted/30", className)}>
      {/* Scrollable tab container */}
      <div className="flex-1 flex items-center gap-1 overflow-x-auto px-2 py-1">
        {sessions.map((session) => {
          const IconComponent = getAgentIcon(session.agent);
          const isActive = session.id === activeSessionId;
          const isEditing = editingSessionId === session.id;
          const displayName = session.name || getDefaultSessionName(session);

          return (
            <div
              key={session.id}
              onClick={() => onSelectSession(session.id)}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-t-md cursor-pointer text-sm transition-colors group min-w-[120px] max-w-[200px] border-b-2",
                isActive
                  ? "bg-background border-primary text-foreground"
                  : "bg-transparent border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50",
              )}
            >
              {/* Status indicator */}
              <Circle
                className={cn(
                  "h-2 w-2 shrink-0 fill-current",
                  statusColors[session.status],
                )}
              />

              {/* Agent icon */}
              <IconComponent className="h-4 w-4 shrink-0" />

              {/* Session name (editable) */}
              {isEditing ? (
                <input
                  ref={inputRef}
                  type="text"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onBlur={handleFinishEditing}
                  onKeyDown={handleKeyDown}
                  onClick={(e) => e.stopPropagation()}
                  className="flex-1 min-w-0 bg-transparent border-b border-primary outline-none text-sm"
                />
              ) : (
                <span
                  className="flex-1 min-w-0 truncate"
                  onDoubleClick={(e) => handleStartEditing(session, e)}
                  title={displayName}
                >
                  {displayName}
                </span>
              )}

              {/* Close button */}
              <button
                onClick={(e) => handleClose(session.id, e)}
                className="shrink-0 opacity-0 group-hover:opacity-100 hover:bg-muted rounded p-0.5 transition-opacity"
                title="Close session"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Add session button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={onAddSession}
        className="shrink-0 h-8 w-8 p-0 mr-2"
        title="New session"
      >
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );
}

export default SessionTabs;
