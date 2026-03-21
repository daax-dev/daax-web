/**
 * Tetromino Definitions
 * Each piece represents a different Greek god from Percy Jackson
 */

import { Tetromino, TetrominoType } from "../types";

export const TETROMINOES: Record<TetrominoType, Tetromino> = {
  I: {
    type: "I",
    shape: [
      [0, 0, 0, 0],
      [1, 1, 1, 1],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
    color: "#3b82f6", // Ocean blue
    godName: "Poseidon",
    symbol: "🔱", // Trident
  },
  O: {
    type: "O",
    shape: [
      [1, 1],
      [1, 1],
    ],
    color: "#f59e0b", // Gold
    godName: "Athena",
    symbol: "🛡️", // Shield
  },
  T: {
    type: "T",
    shape: [
      [0, 1, 0],
      [1, 1, 1],
      [0, 0, 0],
    ],
    color: "#eab308", // Lightning yellow
    godName: "Zeus",
    symbol: "⚡", // Lightning
  },
  S: {
    type: "S",
    shape: [
      [0, 1, 1],
      [1, 1, 0],
      [0, 0, 0],
    ],
    color: "#10b981", // Hermes green
    godName: "Hermes",
    symbol: "🪽", // Wing
  },
  Z: {
    type: "Z",
    shape: [
      [1, 1, 0],
      [0, 1, 1],
      [0, 0, 0],
    ],
    color: "#ef4444", // Ares red
    godName: "Ares",
    symbol: "⚔️", // Sword
  },
  J: {
    type: "J",
    shape: [
      [1, 0, 0],
      [1, 1, 1],
      [0, 0, 0],
    ],
    color: "#8b5cf6", // Artemis purple
    godName: "Artemis",
    symbol: "🏹", // Bow
  },
  L: {
    type: "L",
    shape: [
      [0, 0, 1],
      [1, 1, 1],
      [0, 0, 0],
    ],
    color: "#ec4899", // Apollo pink
    godName: "Apollo",
    symbol: "🎵", // Lyre/Music
  },
};

export const TETROMINO_TYPES: TetrominoType[] = [
  "I",
  "O",
  "T",
  "S",
  "Z",
  "J",
  "L",
];

/**
 * Get a random tetromino
 */
export function getRandomTetromino(): Tetromino {
  const type =
    TETROMINO_TYPES[Math.floor(Math.random() * TETROMINO_TYPES.length)];
  return TETROMINOES[type];
}

/**
 * Rotate tetromino shape 90 degrees clockwise
 */
export function rotateShape(shape: number[][]): number[][] {
  const n = shape.length;
  const rotated: number[][] = Array(n)
    .fill(0)
    .map(() => Array(n).fill(0));

  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      rotated[x][n - 1 - y] = shape[y][x];
    }
  }

  return rotated;
}

/**
 * Get tetromino shape at a specific rotation (0-3)
 */
export function getShapeAtRotation(
  tetromino: Tetromino,
  rotation: number,
): number[][] {
  let shape = tetromino.shape;
  const rotations = rotation % 4;

  for (let i = 0; i < rotations; i++) {
    shape = rotateShape(shape);
  }

  return shape;
}
