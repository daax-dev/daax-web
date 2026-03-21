/**
 * Tetris Game Engine
 * Core game logic and state management
 */

import { Cell, GameAction, GamePiece, GameState } from "../types";
import {
  canMove,
  canRotate,
  getDropPosition,
  GRID_HEIGHT,
  GRID_WIDTH,
  isValidPosition,
} from "./collision";
import {
  calculateDropSpeed,
  calculateHardDropBonus,
  calculateLevel,
  calculateScore,
} from "./scoring";
import { getRandomTetromino, getShapeAtRotation } from "./tetrominoes";

/**
 * Create an empty grid
 */
export function createEmptyGrid(): Cell[][] {
  return Array(GRID_HEIGHT)
    .fill(null)
    .map(() => Array(GRID_WIDTH).fill(null));
}

/**
 * Create initial game state
 */
export function createInitialState(): GameState {
  return {
    grid: createEmptyGrid(),
    currentPiece: null,
    nextPiece: getRandomTetromino(),
    holdPiece: null,
    canHold: true,
    score: 0,
    level: 0,
    lines: 0,
    isPlaying: false,
    isPaused: false,
    isGameOver: false,
    dropSpeed: 1000,
    lastDropTime: 0,
  };
}

/**
 * Spawn a new piece at the top
 */
function spawnPiece(state: GameState, piece = state.nextPiece!): GameState {
  const newPiece: GamePiece = {
    tetromino: piece,
    position: { x: Math.floor(GRID_WIDTH / 2) - 1, y: -1 },
    rotation: 0,
  };

  // Check if spawn position is valid
  if (!isValidPosition(state.grid, newPiece)) {
    return {
      ...state,
      isGameOver: true,
      isPlaying: false,
    };
  }

  return {
    ...state,
    currentPiece: newPiece,
    nextPiece: getRandomTetromino(),
    canHold: true,
  };
}

/**
 * Lock current piece into the grid
 */
function lockPiece(state: GameState): GameState {
  if (!state.currentPiece) return state;

  const newGrid = state.grid.map((row) => [...row]);
  const { tetromino, position, rotation } = state.currentPiece;
  const shape = getShapeAtRotation(tetromino, rotation);

  // Place piece in grid
  for (let y = 0; y < shape.length; y++) {
    for (let x = 0; x < shape[y].length; x++) {
      if (shape[y][x]) {
        const gridY = position.y + y;
        const gridX = position.x + x;
        if (
          gridY >= 0 &&
          gridY < GRID_HEIGHT &&
          gridX >= 0 &&
          gridX < GRID_WIDTH
        ) {
          newGrid[gridY][gridX] = tetromino.type;
        }
      }
    }
  }

  return {
    ...state,
    grid: newGrid,
    currentPiece: null,
  };
}

/**
 * Clear completed lines and return the number cleared
 */
function clearLines(state: GameState): {
  state: GameState;
  linesCleared: number;
} {
  const newGrid: Cell[][] = [];
  let linesCleared = 0;

  // Find complete lines
  for (let y = 0; y < GRID_HEIGHT; y++) {
    if (state.grid[y].every((cell) => cell !== null)) {
      linesCleared++;
    } else {
      newGrid.push([...state.grid[y]]);
    }
  }

  // Add empty lines at top
  while (newGrid.length < GRID_HEIGHT) {
    newGrid.unshift(Array(GRID_WIDTH).fill(null));
  }

  const totalLines = state.lines + linesCleared;
  const newLevel = calculateLevel(totalLines);
  const scoreGain = calculateScore(linesCleared, state.level);

  return {
    state: {
      ...state,
      grid: newGrid,
      lines: totalLines,
      level: newLevel,
      score: state.score + scoreGain,
      dropSpeed: calculateDropSpeed(newLevel),
    },
    linesCleared,
  };
}

/**
 * Game reducer - handles all game actions
 */
export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case "START_GAME": {
      const newState = createInitialState();
      const stateWithPiece = spawnPiece(newState);
      return {
        ...stateWithPiece,
        isPlaying: !stateWithPiece.isGameOver,
      };
    }

    case "PAUSE_GAME":
      return { ...state, isPaused: true };

    case "RESUME_GAME":
      return { ...state, isPaused: false };

    case "RESET_GAME":
      return createInitialState();

    case "GAME_OVER":
      return { ...state, isGameOver: true, isPlaying: false };

    case "MOVE_LEFT": {
      if (!state.currentPiece || state.isPaused) return state;
      if (canMove(state.grid, state.currentPiece, -1, 0)) {
        return {
          ...state,
          currentPiece: {
            ...state.currentPiece,
            position: {
              x: state.currentPiece.position.x - 1,
              y: state.currentPiece.position.y,
            },
          },
        };
      }
      return state;
    }

    case "MOVE_RIGHT": {
      if (!state.currentPiece || state.isPaused) return state;
      if (canMove(state.grid, state.currentPiece, 1, 0)) {
        return {
          ...state,
          currentPiece: {
            ...state.currentPiece,
            position: {
              x: state.currentPiece.position.x + 1,
              y: state.currentPiece.position.y,
            },
          },
        };
      }
      return state;
    }

    case "MOVE_DOWN": {
      if (!state.currentPiece || state.isPaused) return state;
      if (canMove(state.grid, state.currentPiece, 0, 1)) {
        return {
          ...state,
          currentPiece: {
            ...state.currentPiece,
            position: {
              x: state.currentPiece.position.x,
              y: state.currentPiece.position.y + 1,
            },
          },
          score: state.score + 1, // Soft drop bonus
        };
      } else {
        // Lock piece and check for line clears
        const lockedState = lockPiece(state);
        const { state: clearedState } = clearLines(lockedState);

        // Spawn next piece
        return spawnPiece(clearedState);
      }
    }

    case "ROTATE": {
      if (!state.currentPiece || state.isPaused) return state;
      if (canRotate(state.grid, state.currentPiece)) {
        return {
          ...state,
          currentPiece: {
            ...state.currentPiece,
            rotation: (state.currentPiece.rotation + 1) % 4,
          },
        };
      }
      return state;
    }

    case "HARD_DROP": {
      if (!state.currentPiece || state.isPaused) return state;

      const dropPos = getDropPosition(state.grid, state.currentPiece);
      const dropDistance = dropPos.y - state.currentPiece.position.y;
      const bonus = calculateHardDropBonus(dropDistance);

      const droppedState = {
        ...state,
        currentPiece: {
          ...state.currentPiece,
          position: dropPos,
        },
        score: state.score + bonus,
      };

      // Lock piece and check for line clears
      const lockedState = lockPiece(droppedState);
      const { state: clearedState } = clearLines(lockedState);

      // Spawn next piece
      return spawnPiece(clearedState);
    }

    case "HOLD_PIECE": {
      if (!state.currentPiece || !state.canHold || state.isPaused) return state;

      const currentTetromino = state.currentPiece.tetromino;

      if (state.holdPiece) {
        // Swap current and hold piece
        const newState = spawnPiece(state, state.holdPiece);
        return {
          ...newState,
          holdPiece: currentTetromino,
          canHold: false,
        };
      } else {
        // Store current piece and spawn next
        const newState = spawnPiece(state);
        return {
          ...newState,
          holdPiece: currentTetromino,
          canHold: false,
        };
      }
    }

    case "UPDATE_DROP": {
      if (!state.currentPiece || state.isPaused || !state.isPlaying)
        return state;

      const now = action.payload;
      if (now - state.lastDropTime > state.dropSpeed) {
        // Auto drop
        const moved = gameReducer(state, { type: "MOVE_DOWN" });
        return {
          ...moved,
          lastDropTime: now,
        };
      }

      return state;
    }

    default:
      return state;
  }
}
