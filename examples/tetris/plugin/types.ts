/**
 * Tetris Game Type Definitions
 */

export type TetrominoType = "I" | "O" | "T" | "S" | "Z" | "J" | "L";

export interface Position {
  x: number;
  y: number;
}

export interface Tetromino {
  type: TetrominoType;
  shape: number[][];
  color: string;
  godName: string; // Percy Jackson theme
  symbol: string; // Greek god symbol
}

export interface GamePiece {
  tetromino: Tetromino;
  position: Position;
  rotation: number;
}

export type Cell = TetrominoType | null;

export interface GameState {
  grid: Cell[][];
  currentPiece: GamePiece | null;
  nextPiece: Tetromino | null;
  holdPiece: Tetromino | null;
  canHold: boolean;
  score: number;
  level: number;
  lines: number;
  isPlaying: boolean;
  isPaused: boolean;
  isGameOver: boolean;
  dropSpeed: number;
  lastDropTime: number;
}

export type GameAction =
  | { type: "START_GAME" }
  | { type: "PAUSE_GAME" }
  | { type: "RESUME_GAME" }
  | { type: "GAME_OVER" }
  | { type: "MOVE_LEFT" }
  | { type: "MOVE_RIGHT" }
  | { type: "MOVE_DOWN" }
  | { type: "ROTATE" }
  | { type: "HARD_DROP" }
  | { type: "HOLD_PIECE" }
  | { type: "SPAWN_PIECE"; payload: Tetromino }
  | { type: "LOCK_PIECE" }
  | { type: "CLEAR_LINES"; payload: number }
  | { type: "UPDATE_DROP"; payload: number }
  | { type: "RESET_GAME" };

export interface ThemeColors {
  oceanBlue: string;
  gold: string;
  bronze: string;
  celestialBronze: string;
  waterLight: string;
  waterDark: string;
  campGreen: string;
}
