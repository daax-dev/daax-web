/**
 * Game Controls Component
 * Start, pause, and restart buttons
 */

"use client";

import { Button } from "@/components/ui/button";
import { GameAction } from "../types";

interface GameControlsProps {
  isPlaying: boolean;
  isPaused: boolean;
  isGameOver: boolean;
  dispatch: React.Dispatch<GameAction>;
}

export function GameControls({
  isPlaying,
  isPaused,
  isGameOver,
  dispatch,
}: GameControlsProps) {
  return (
    <div className="space-y-4 p-4 rounded-lg border bg-card text-card-foreground shadow-sm">
      <h3 className="text-lg font-semibold text-primary">Controls</h3>

      <div className="space-y-2">
        {!isPlaying ? (
          <Button
            onClick={() => dispatch({ type: "START_GAME" })}
            className="w-full"
            size="lg"
          >
            {isGameOver ? "Restart Quest" : "Start Quest"}
          </Button>
        ) : (
          <>
            <Button
              onClick={() =>
                dispatch({ type: isPaused ? "RESUME_GAME" : "PAUSE_GAME" })
              }
              className="w-full"
              variant="secondary"
            >
              {isPaused ? "Resume" : "Pause"}
            </Button>
            <Button
              onClick={() => dispatch({ type: "RESET_GAME" })}
              className="w-full"
              variant="outline"
            >
              Reset
            </Button>
          </>
        )}
      </div>

      <div className="space-y-2 text-xs text-muted-foreground border-t pt-4">
        <div className="font-semibold text-foreground mb-2">
          Keyboard Controls:
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>← →</div>
          <div>Move</div>
          <div>↓</div>
          <div>Soft Drop</div>
          <div>↑ / X</div>
          <div>Rotate</div>
          <div>Space</div>
          <div>Hard Drop</div>
          <div>C</div>
          <div>Hold Piece</div>
          <div>P / Esc</div>
          <div>Pause</div>
        </div>
      </div>
    </div>
  );
}
