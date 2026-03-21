/**
 * Main Tetris Game Component
 * Percy Jackson themed Tetris
 */

"use client";

import { useGameState } from "../hooks/useGameState";
import { useGameLoop } from "../hooks/useGameLoop";
import { useControls } from "../hooks/useControls";
import { GameCanvas } from "./GameCanvas";
import { ScoreBoard } from "./ScoreBoard";
import { PiecePreview } from "./PiecePreview";
import { GameControls } from "./GameControls";

export function TetrisGame() {
  const [state, dispatch] = useGameState();
  useGameLoop(state.isPlaying, state.isPaused, dispatch);
  useControls(state.isPlaying, state.isPaused, dispatch);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold mb-2 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 bg-clip-text text-transparent">
            Camp Half-Blood Tetris
          </h1>
          <p className="text-muted-foreground text-lg">
            Help the demigods stack the blocks of destiny! ⚡
          </p>
        </div>

        {/* Game Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr_300px] gap-6 items-start">
          {/* Left Panel - Hold & Controls */}
          <div className="space-y-6">
            <PiecePreview tetromino={state.holdPiece} label="Hold (C)" />
            <GameControls
              isPlaying={state.isPlaying}
              isPaused={state.isPaused}
              isGameOver={state.isGameOver}
              dispatch={dispatch}
            />
          </div>

          {/* Center - Game Canvas */}
          <div className="flex flex-col items-center justify-center">
            <div className="relative">
              <GameCanvas grid={state.grid} currentPiece={state.currentPiece} />

              {/* Overlays */}
              {state.isPaused && (
                <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center rounded-lg">
                  <div className="text-center">
                    <div className="text-4xl font-bold mb-2">⏸️ PAUSED</div>
                    <div className="text-muted-foreground">
                      Press P or ESC to resume
                    </div>
                  </div>
                </div>
              )}

              {state.isGameOver && (
                <div className="absolute inset-0 bg-background/90 backdrop-blur-sm flex items-center justify-center rounded-lg">
                  <div className="text-center">
                    <div className="text-5xl mb-4">💀</div>
                    <div className="text-4xl font-bold mb-2 text-destructive">
                      Game Over!
                    </div>
                    <div className="text-lg text-muted-foreground mb-4">
                      Final Score: {state.score.toLocaleString()}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Click &quot;Restart Quest&quot; to try again
                    </div>
                  </div>
                </div>
              )}

              {!state.isPlaying && !state.isGameOver && (
                <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center rounded-lg">
                  <div className="text-center">
                    <div className="text-5xl mb-4">🏛️</div>
                    <div className="text-3xl font-bold mb-2">
                      Welcome, Demigod!
                    </div>
                    <div className="text-muted-foreground">
                      Click &quot;Start Quest&quot; to begin
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Panel - Next Piece & Stats */}
          <div className="space-y-6">
            <PiecePreview tetromino={state.nextPiece} label="Next Piece" />
            <ScoreBoard
              score={state.score}
              level={state.level}
              lines={state.lines}
            />

            {/* God Symbols Legend */}
            <div className="p-4 rounded-lg border bg-card text-card-foreground shadow-sm">
              <h4 className="text-sm font-semibold text-muted-foreground mb-2">
                Greek Gods
              </h4>
              <div className="space-y-1 text-xs">
                <div>🔱 Poseidon</div>
                <div>🛡️ Athena</div>
                <div>⚡ Zeus</div>
                <div>🪽 Hermes</div>
                <div>⚔️ Ares</div>
                <div>🏹 Artemis</div>
                <div>🎵 Apollo</div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-sm text-muted-foreground">
          <p>May the gods guide your blocks! ⚡️ Built for Daax</p>
        </div>
      </div>
    </div>
  );
}
