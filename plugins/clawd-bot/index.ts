/**
 * Bot Plugin
 *
 * Embeds the Clawd AI Gateway in an iframe for chat functionality.
 */

import { MessageSquare } from "lucide-react";
import type { Plugin } from "@/lib/plugins";

export const botPlugin: Plugin = {
  id: "bot",
  name: "Bot",
  description: "Clawd AI Gateway console",
  version: "1.0.0",
  author: "Daax",
  category: "ai",
  enabledByDefault: false,
  icon: MessageSquare,

  ui: {
    navigation: [
      {
        id: "bot",
        label: "Bot",
        href: "/bot",
        icon: MessageSquare,
        order: 15,
      },
    ],
  },
};

export default botPlugin;
