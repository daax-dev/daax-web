/**
 * Game State Hook
 */

import { useReducer } from "react";
import { createInitialState, gameReducer } from "../lib/tetris-engine";
import { GameAction, GameState } from "../types";

export function useGameState(): [GameState, React.Dispatch<GameAction>] {
  const [state, dispatch] = useReducer(gameReducer, createInitialState());
  return [state, dispatch];
}
