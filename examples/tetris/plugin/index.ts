/**
 * Tetris Plugin
 * Percy Jackson themed Tetris game for Daax
 */

import { Plugin } from "@/lib/plugins/types";
import { Gamepad2 } from "lucide-react";

export const tetrisPlugin: Plugin = {
  id: "tetris",
  name: "Camp Half-Blood Tetris",
  description:
    "Percy Jackson themed Tetris game - help the demigods stack blocks!",
  version: "1.0.0",
  author: "Daax",
  category: "games",
  enabledByDefault: true,

  ui: {
    navigation: [
      {
        id: "tetris-nav",
        label: "Tetris",
        href: "/tetris",
        icon: Gamepad2,
        order: 100,
      },
    ],
  },
};

export default tetrisPlugin;
