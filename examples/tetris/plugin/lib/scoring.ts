/**
 * Scoring and Level System
 */

/**
 * Calculate score for cleared lines
 * Based on original Tetris scoring
 */
export function calculateScore(linesCleared: number, level: number): number {
  const baseScores = {
    1: 100, // Single
    2: 300, // Double
    3: 500, // Triple
    4: 800, // Tetris (4 lines)
  };

  const baseScore = baseScores[linesCleared as keyof typeof baseScores] || 0;
  return baseScore * (level + 1);
}

/**
 * Calculate level based on lines cleared
 * Level increases every 10 lines
 */
export function calculateLevel(totalLines: number): number {
  return Math.floor(totalLines / 10);
}

/**
 * Calculate drop speed based on level
 * Speed increases with level (lower value = faster)
 */
export function calculateDropSpeed(level: number): number {
  const baseSpeed = 1000; // 1 second at level 0
  const minSpeed = 100; // Minimum 100ms at high levels
  const speed = baseSpeed - level * 50;

  return Math.max(speed, minSpeed);
}

/**
 * Award bonus points for hard drops
 */
export function calculateHardDropBonus(dropDistance: number): number {
  return dropDistance * 2;
}
