/**
 * Game Controls Hook
 * Handles keyboard input for game controls
 */

import { useEffect, useRef } from "react";
import { GameAction } from "../types";

export function useControls(
  isPlaying: boolean,
  isPaused: boolean,
  dispatch: React.Dispatch<GameAction>,
): void {
  const keyPressedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!isPlaying) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (keyPressedRef.current.has(e.key)) return; // Prevent key repeat
      keyPressedRef.current.add(e.key);

      switch (e.key) {
        case "ArrowLeft":
          e.preventDefault();
          dispatch({ type: "MOVE_LEFT" });
          break;
        case "ArrowRight":
          e.preventDefault();
          dispatch({ type: "MOVE_RIGHT" });
          break;
        case "ArrowDown":
          e.preventDefault();
          dispatch({ type: "MOVE_DOWN" });
          break;
        case "ArrowUp":
        case "x":
        case "X":
          e.preventDefault();
          dispatch({ type: "ROTATE" });
          break;
        case " ":
          e.preventDefault();
          dispatch({ type: "HARD_DROP" });
          break;
        case "c":
        case "C":
          e.preventDefault();
          dispatch({ type: "HOLD_PIECE" });
          break;
        case "p":
        case "P":
        case "Escape":
          e.preventDefault();
          dispatch({ type: isPaused ? "RESUME_GAME" : "PAUSE_GAME" });
          break;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keyPressedRef.current.delete(e.key);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [isPlaying, isPaused, dispatch]);
}
