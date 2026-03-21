/**
 * Tetris Game Page
 */

import { TetrisGame } from "@/plugins/tetris/components/TetrisGame";

export const metadata = {
  title: "Camp Half-Blood Tetris | Daax",
  description:
    "Percy Jackson themed Tetris game - help the demigods stack blocks of destiny!",
};

export default function TetrisPage() {
  return <TetrisGame />;
}
