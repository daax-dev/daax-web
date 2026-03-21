/**
 * Piece Preview Component
 * Shows next piece or hold piece with mini canvas
 */

"use client";

import { useEffect, useRef } from "react";
import { Tetromino } from "../types";

const CELL_SIZE = 20;
const PREVIEW_SIZE = 4;
const CANVAS_SIZE = PREVIEW_SIZE * CELL_SIZE;

interface PiecePreviewProps {
  tetromino: Tetromino | null;
  label: string;
}

export function PiecePreview({ tetromino, label }: PiecePreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear canvas
    ctx.fillStyle = "hsl(var(--background))";
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    if (!tetromino) return;

    // Calculate centering offset
    const shape = tetromino.shape;
    const shapeWidth = shape[0].length;
    const shapeHeight = shape.length;
    const offsetX = Math.floor((PREVIEW_SIZE - shapeWidth) / 2);
    const offsetY = Math.floor((PREVIEW_SIZE - shapeHeight) / 2);

    // Draw piece
    for (let y = 0; y < shapeHeight; y++) {
      for (let x = 0; x < shapeWidth; x++) {
        if (shape[y][x]) {
          const xPos = (offsetX + x) * CELL_SIZE;
          const yPos = (offsetY + y) * CELL_SIZE;

          // Fill cell
          ctx.fillStyle = tetromino.color;
          ctx.fillRect(xPos + 1, yPos + 1, CELL_SIZE - 2, CELL_SIZE - 2);

          // Add border
          ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
          ctx.lineWidth = 1;
          ctx.strokeRect(xPos + 1, yPos + 1, CELL_SIZE - 2, CELL_SIZE - 2);
        }
      }
    }
  }, [tetromino]);

  return (
    <div className="p-4 rounded-lg border bg-card text-card-foreground shadow-sm">
      <h4 className="text-sm font-semibold text-muted-foreground mb-2">
        {label}
      </h4>
      <canvas
        ref={canvasRef}
        width={CANVAS_SIZE}
        height={CANVAS_SIZE}
        className="rounded border mx-auto"
        style={{
          borderColor: "hsl(var(--border))",
          backgroundColor: "hsl(var(--muted))",
        }}
      />
      {tetromino && (
        <div className="mt-2 text-center text-xs text-muted-foreground">
          {tetromino.symbol} {tetromino.godName}
        </div>
      )}
    </div>
  );
}
