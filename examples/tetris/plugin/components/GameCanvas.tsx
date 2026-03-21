/**
 * Game Canvas Component
 * Renders the Tetris grid using HTML Canvas
 */

"use client";

import { useEffect, useRef } from "react";
import { GRID_HEIGHT, GRID_WIDTH } from "../lib/collision";
import { getShapeAtRotation } from "../lib/tetrominoes";
import { Cell, GamePiece } from "../types";

const CELL_SIZE = 30;
const BORDER_WIDTH = 2;
const CANVAS_WIDTH = GRID_WIDTH * CELL_SIZE;
const CANVAS_HEIGHT = GRID_HEIGHT * CELL_SIZE;

interface GameCanvasProps {
  grid: Cell[][];
  currentPiece: GamePiece | null;
}

export function GameCanvas({ grid, currentPiece }: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear canvas
    ctx.fillStyle = "hsl(var(--background))";
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Draw grid background with ocean theme
    ctx.strokeStyle = "hsl(var(--border))";
    ctx.lineWidth = 0.5;
    for (let y = 0; y < GRID_HEIGHT; y++) {
      for (let x = 0; x < GRID_WIDTH; x++) {
        const xPos = x * CELL_SIZE;
        const yPos = y * CELL_SIZE;
        ctx.strokeRect(xPos, yPos, CELL_SIZE, CELL_SIZE);
      }
    }

    // Draw locked pieces
    for (let y = 0; y < GRID_HEIGHT; y++) {
      for (let x = 0; x < GRID_WIDTH; x++) {
        if (grid[y][x]) {
          drawCell(ctx, x, y, grid[y][x] as string);
        }
      }
    }

    // Draw current piece
    if (currentPiece) {
      const shape = getShapeAtRotation(
        currentPiece.tetromino,
        currentPiece.rotation,
      );
      const { x: pieceX, y: pieceY } = currentPiece.position;

      for (let y = 0; y < shape.length; y++) {
        for (let x = 0; x < shape[y].length; x++) {
          if (shape[y][x]) {
            const gridY = pieceY + y;
            if (gridY >= 0) {
              // Only draw if on screen
              drawCell(
                ctx,
                pieceX + x,
                gridY,
                currentPiece.tetromino.color,
                true,
              );
            }
          }
        }
      }
    }
  }, [grid, currentPiece]);

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        className="border-2 rounded-lg shadow-lg"
        style={{
          borderColor: "hsl(var(--primary))",
          backgroundColor: "hsl(var(--background))",
          imageRendering: "pixelated",
        }}
      />
    </div>
  );
}

function drawCell(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  isCurrentPiece = false,
): void {
  const xPos = x * CELL_SIZE;
  const yPos = y * CELL_SIZE;

  // Fill cell
  ctx.fillStyle = color;
  ctx.fillRect(
    xPos + BORDER_WIDTH,
    yPos + BORDER_WIDTH,
    CELL_SIZE - BORDER_WIDTH * 2,
    CELL_SIZE - BORDER_WIDTH * 2,
  );

  // Add 3D effect with gradients
  const gradient = ctx.createLinearGradient(
    xPos,
    yPos,
    xPos + CELL_SIZE,
    yPos + CELL_SIZE,
  );
  gradient.addColorStop(0, "rgba(255, 255, 255, 0.3)");
  gradient.addColorStop(1, "rgba(0, 0, 0, 0.3)");
  ctx.fillStyle = gradient;
  ctx.fillRect(
    xPos + BORDER_WIDTH,
    yPos + BORDER_WIDTH,
    CELL_SIZE - BORDER_WIDTH * 2,
    CELL_SIZE - BORDER_WIDTH * 2,
  );

  // Add border
  ctx.strokeStyle = isCurrentPiece
    ? "rgba(255, 255, 255, 0.8)"
    : "rgba(0, 0, 0, 0.4)";
  ctx.lineWidth = BORDER_WIDTH;
  ctx.strokeRect(
    xPos + BORDER_WIDTH / 2,
    yPos + BORDER_WIDTH / 2,
    CELL_SIZE - BORDER_WIDTH,
    CELL_SIZE - BORDER_WIDTH,
  );
}
