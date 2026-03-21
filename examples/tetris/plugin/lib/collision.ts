/**
 * Collision Detection
 */

import { Cell, GamePiece, Position } from "../types";
import { getShapeAtRotation } from "./tetrominoes";

export const GRID_WIDTH = 10;
export const GRID_HEIGHT = 20;

/**
 * Check if a piece position is valid (no collisions)
 */
export function isValidPosition(
  grid: Cell[][],
  piece: GamePiece,
  position?: Position,
  rotation?: number,
): boolean {
  const pos = position || piece.position;
  const rot = rotation !== undefined ? rotation : piece.rotation;
  const shape = getShapeAtRotation(piece.tetromino, rot);

  for (let y = 0; y < shape.length; y++) {
    for (let x = 0; x < shape[y].length; x++) {
      if (shape[y][x]) {
        const gridX = pos.x + x;
        const gridY = pos.y + y;

        // Check boundaries
        if (gridX < 0 || gridX >= GRID_WIDTH || gridY >= GRID_HEIGHT) {
          return false;
        }

        // Check collision with existing blocks (but not above grid)
        if (gridY >= 0 && grid[gridY][gridX] !== null) {
          return false;
        }
      }
    }
  }

  return true;
}

/**
 * Check if piece can move in a direction
 */
export function canMove(
  grid: Cell[][],
  piece: GamePiece,
  dx: number,
  dy: number,
): boolean {
  const newPosition: Position = {
    x: piece.position.x + dx,
    y: piece.position.y + dy,
  };

  return isValidPosition(grid, piece, newPosition);
}

/**
 * Check if piece can rotate
 */
export function canRotate(grid: Cell[][], piece: GamePiece): boolean {
  const newRotation = (piece.rotation + 1) % 4;
  return isValidPosition(grid, piece, undefined, newRotation);
}

/**
 * Get the final drop position for hard drop
 */
export function getDropPosition(grid: Cell[][], piece: GamePiece): Position {
  let dropY = piece.position.y;

  while (
    isValidPosition(grid, piece, {
      x: piece.position.x,
      y: dropY + 1,
    })
  ) {
    dropY++;
  }

  return { x: piece.position.x, y: dropY };
}
