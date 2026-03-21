/**
 * Score Board Component
 * Displays game stats (score, level, lines)
 */

"use client";

interface ScoreBoardProps {
  score: number;
  level: number;
  lines: number;
}

export function ScoreBoard({ score, level, lines }: ScoreBoardProps) {
  return (
    <div className="space-y-4 p-4 rounded-lg border bg-card text-card-foreground shadow-sm">
      <h3 className="text-lg font-semibold text-primary">
        Camp Half-Blood Stats
      </h3>

      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-sm text-muted-foreground">Score</span>
          <span className="text-2xl font-bold tabular-nums">
            {score.toLocaleString()}
          </span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-sm text-muted-foreground">Level</span>
          <span className="text-xl font-semibold tabular-nums">{level}</span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-sm text-muted-foreground">Lines</span>
          <span className="text-xl font-semibold tabular-nums">{lines}</span>
        </div>
      </div>
    </div>
  );
}
