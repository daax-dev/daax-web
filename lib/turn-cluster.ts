/**
 * Turn-clustered tool execution timeline.
 *
 * A "turn" is a set of tool invocations that are temporally close together —
 * specifically, each tool must start within `windowMs` of the previous one.
 * This mirrors the natural unit of agent reasoning (one LLM round-trip).
 *
 * Precondition: `tools` must be sorted by `startedAt` ascending before being
 * passed to `clusterByTurn`. The function preserves input order within each
 * group and does not re-sort internally.
 */

export interface ToolCall {
  /** Unix timestamp in milliseconds (or any comparable numeric value). */
  startedAt: number;
  [key: string]: unknown;
}

export interface TurnGroup {
  /** 1-based sequential turn number. */
  turnIndex: number;
  tools: ToolCall[];
}

/** Gap threshold above which a new turn is started (exclusive). */
const DEFAULT_WINDOW_MS = 500;

/**
 * Groups a sorted `ToolCall[]` into turns.
 *
 * A new turn begins when the gap between consecutive `startedAt` values
 * *exceeds* `windowMs` (i.e. `gap > windowMs`). An empty array returns `[]`.
 */
export function clusterByTurn(
  tools: ToolCall[],
  windowMs: number = DEFAULT_WINDOW_MS,
): TurnGroup[] {
  if (tools.length === 0) return [];

  const groups: TurnGroup[] = [];
  let currentGroup: ToolCall[] = [tools[0]];

  for (let i = 1; i < tools.length; i++) {
    const gap = tools[i].startedAt - tools[i - 1].startedAt;
    if (gap > windowMs) {
      groups.push({ turnIndex: groups.length + 1, tools: currentGroup });
      currentGroup = [tools[i]];
    } else {
      currentGroup.push(tools[i]);
    }
  }

  groups.push({ turnIndex: groups.length + 1, tools: currentGroup });

  return groups;
}
