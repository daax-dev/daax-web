/**
 * Game Loop Hook
 * Handles automatic piece dropping using requestAnimationFrame
 */

import { useEffect, useRef } from "react";
import { GameAction } from "../types";

export function useGameLoop(
  isPlaying: boolean,
  isPaused: boolean,
  dispatch: React.Dispatch<GameAction>,
): void {
  const requestRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!isPlaying || isPaused) {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
      return;
    }

    const animate = (time: number) => {
      dispatch({ type: "UPDATE_DROP", payload: time });
      requestRef.current = requestAnimationFrame(animate);
    };

    requestRef.current = requestAnimationFrame(animate);

    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, [isPlaying, isPaused, dispatch]);
}
