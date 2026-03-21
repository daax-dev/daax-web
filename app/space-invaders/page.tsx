"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

// Game constants
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;
const PLAYER_WIDTH = 50;
const PLAYER_HEIGHT = 30;
const PLAYER_SPEED = 8;
const BULLET_WIDTH = 4;
const BULLET_HEIGHT = 15;
const BULLET_SPEED = 10;
const ALIEN_WIDTH = 40;
const ALIEN_HEIGHT = 30;
const ALIEN_ROWS = 5;
const ALIEN_COLS = 10;
const ALIEN_PADDING = 10;
const ALIEN_SPEED_INITIAL = 1;
const ALIEN_DROP = 20;
const ALIEN_BULLET_SPEED = 5;
const ALIEN_SHOOT_CHANCE = 0.005;

// Types
interface Position {
  x: number;
  y: number;
}

interface Bullet extends Position {
  active: boolean;
}

interface Alien extends Position {
  alive: boolean;
  type: number;
}

interface GameState {
  player: Position;
  bullets: Bullet[];
  alienBullets: Bullet[];
  aliens: Alien[];
  score: number;
  lives: number;
  level: number;
  alienDirection: number;
  alienSpeed: number;
  gameStatus: "start" | "playing" | "paused" | "gameover" | "won";
}

// Pixel art for aliens (simple patterns)
const ALIEN_PATTERNS = [
  // Type 0 - Squid
  [
    "  ####  ",
    " ###### ",
    "########",
    "## ## ##",
    "########",
    "  #  #  ",
    " # ## # ",
    "# #  # #",
  ],
  // Type 1 - Crab
  [
    " # ## # ",
    "  ####  ",
    " ###### ",
    "## ## ##",
    "########",
    " # ## # ",
    "#      #",
    " #    # ",
  ],
  // Type 2 - Octopus
  [
    "  ####  ",
    " ###### ",
    "########",
    "#  ##  #",
    "########",
    "  #  #  ",
    " #    # ",
    "  #  #  ",
  ],
];

const PLAYER_PATTERN = [
  "    #    ",
  "   ###   ",
  "   ###   ",
  "#########",
  "#########",
  "#########",
];

export default function SpaceInvadersPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameStateRef = useRef<GameState | null>(null);
  const keysRef = useRef<Set<string>>(new Set());
  const animationFrameRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  const [displayScore, setDisplayScore] = useState(0);
  const [displayLives, setDisplayLives] = useState(3);
  const [displayLevel, setDisplayLevel] = useState(1);
  const [gameStatus, setGameStatus] = useState<
    "start" | "playing" | "paused" | "gameover" | "won"
  >("start");

  const initializeGame = useCallback((level: number = 1) => {
    const aliens: Alien[] = [];
    const startX = 80;
    const startY = 60;

    for (let row = 0; row < ALIEN_ROWS; row++) {
      for (let col = 0; col < ALIEN_COLS; col++) {
        aliens.push({
          x: startX + col * (ALIEN_WIDTH + ALIEN_PADDING),
          y: startY + row * (ALIEN_HEIGHT + ALIEN_PADDING),
          alive: true,
          type: row < 1 ? 0 : row < 3 ? 1 : 2,
        });
      }
    }

    gameStateRef.current = {
      player: { x: CANVAS_WIDTH / 2 - PLAYER_WIDTH / 2, y: CANVAS_HEIGHT - 60 },
      bullets: [],
      alienBullets: [],
      aliens,
      score: level === 1 ? 0 : gameStateRef.current?.score || 0,
      lives: level === 1 ? 3 : gameStateRef.current?.lives || 3,
      level,
      alienDirection: 1,
      alienSpeed: ALIEN_SPEED_INITIAL + (level - 1) * 0.5,
      gameStatus: "playing",
    };

    setDisplayScore(gameStateRef.current.score);
    setDisplayLives(gameStateRef.current.lives);
    setDisplayLevel(level);
    setGameStatus("playing");
  }, []);

  const drawPixelArt = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      pattern: string[],
      x: number,
      y: number,
      pixelSize: number,
      color: string,
    ) => {
      ctx.fillStyle = color;
      pattern.forEach((row, rowIndex) => {
        row.split("").forEach((pixel, colIndex) => {
          if (pixel === "#") {
            ctx.fillRect(
              x + colIndex * pixelSize,
              y + rowIndex * pixelSize,
              pixelSize,
              pixelSize,
            );
          }
        });
      });
    },
    [],
  );

  const render = useCallback(
    (ctx: CanvasRenderingContext2D, state: GameState) => {
      // Clear canvas
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Draw stars background
      ctx.fillStyle = "#333";
      for (let i = 0; i < 100; i++) {
        const sx = (i * 73) % CANVAS_WIDTH;
        const sy = (i * 91) % CANVAS_HEIGHT;
        ctx.fillRect(sx, sy, 2, 2);
      }

      // Draw player
      drawPixelArt(
        ctx,
        PLAYER_PATTERN,
        state.player.x,
        state.player.y,
        5,
        "#0f0",
      );

      // Draw player bullets
      ctx.fillStyle = "#0ff";
      state.bullets.forEach((bullet) => {
        if (bullet.active) {
          ctx.fillRect(bullet.x, bullet.y, BULLET_WIDTH, BULLET_HEIGHT);
        }
      });

      // Draw alien bullets
      ctx.fillStyle = "#f00";
      state.alienBullets.forEach((bullet) => {
        if (bullet.active) {
          ctx.fillRect(bullet.x, bullet.y, BULLET_WIDTH, BULLET_HEIGHT);
        }
      });

      // Draw aliens
      const alienColors = ["#f0f", "#ff0", "#0ff"];
      state.aliens.forEach((alien) => {
        if (alien.alive) {
          drawPixelArt(
            ctx,
            ALIEN_PATTERNS[alien.type],
            alien.x,
            alien.y,
            4,
            alienColors[alien.type],
          );
        }
      });

      // Draw ground line
      ctx.fillStyle = "#0f0";
      ctx.fillRect(0, CANVAS_HEIGHT - 20, CANVAS_WIDTH, 2);
    },
    [drawPixelArt],
  );

  const update = useCallback((state: GameState): GameState => {
    // Player movement
    if (keysRef.current.has("ArrowLeft") || keysRef.current.has("a")) {
      state.player.x = Math.max(0, state.player.x - PLAYER_SPEED);
    }
    if (keysRef.current.has("ArrowRight") || keysRef.current.has("d")) {
      state.player.x = Math.min(
        CANVAS_WIDTH - PLAYER_WIDTH,
        state.player.x + PLAYER_SPEED,
      );
    }

    // Update player bullets
    state.bullets = state.bullets.filter((bullet) => {
      if (!bullet.active) return false;
      bullet.y -= BULLET_SPEED;
      if (bullet.y < 0) return false;
      return true;
    });

    // Update alien bullets
    state.alienBullets = state.alienBullets.filter((bullet) => {
      if (!bullet.active) return false;
      bullet.y += ALIEN_BULLET_SPEED;
      if (bullet.y > CANVAS_HEIGHT) return false;
      return true;
    });

    // Find alive aliens bounds
    const aliveAliens = state.aliens.filter((a) => a.alive);
    if (aliveAliens.length === 0) {
      state.gameStatus = "won";
      return state;
    }

    const minX = Math.min(...aliveAliens.map((a) => a.x));
    const maxX = Math.max(...aliveAliens.map((a) => a.x));
    const maxY = Math.max(...aliveAliens.map((a) => a.y));

    // Check if aliens reached bottom
    if (maxY > CANVAS_HEIGHT - 100) {
      state.lives = 0;
      state.gameStatus = "gameover";
      return state;
    }

    // Move aliens
    let shouldDrop = false;
    if (state.alienDirection > 0 && maxX + ALIEN_WIDTH > CANVAS_WIDTH - 20) {
      shouldDrop = true;
      state.alienDirection = -1;
    } else if (state.alienDirection < 0 && minX < 20) {
      shouldDrop = true;
      state.alienDirection = 1;
    }

    state.aliens.forEach((alien) => {
      if (alien.alive) {
        if (shouldDrop) {
          alien.y += ALIEN_DROP;
        }
        alien.x += state.alienSpeed * state.alienDirection;
      }
    });

    // Alien shooting
    const bottomAliens = new Map<number, Alien>();
    aliveAliens.forEach((alien) => {
      const col = Math.floor(alien.x / (ALIEN_WIDTH + ALIEN_PADDING));
      if (!bottomAliens.has(col) || alien.y > bottomAliens.get(col)!.y) {
        bottomAliens.set(col, alien);
      }
    });

    bottomAliens.forEach((alien) => {
      if (Math.random() < ALIEN_SHOOT_CHANCE * (1 + state.level * 0.2)) {
        state.alienBullets.push({
          x: alien.x + ALIEN_WIDTH / 2 - BULLET_WIDTH / 2,
          y: alien.y + ALIEN_HEIGHT,
          active: true,
        });
      }
    });

    // Collision detection - player bullets vs aliens
    state.bullets.forEach((bullet) => {
      if (!bullet.active) return;
      state.aliens.forEach((alien) => {
        if (!alien.alive) return;
        if (
          bullet.x < alien.x + ALIEN_WIDTH &&
          bullet.x + BULLET_WIDTH > alien.x &&
          bullet.y < alien.y + ALIEN_HEIGHT &&
          bullet.y + BULLET_HEIGHT > alien.y
        ) {
          bullet.active = false;
          alien.alive = false;
          const points = (3 - alien.type) * 10;
          state.score += points;
          // Speed up remaining aliens
          state.alienSpeed += 0.02;
        }
      });
    });

    // Collision detection - alien bullets vs player
    state.alienBullets.forEach((bullet) => {
      if (!bullet.active) return;
      if (
        bullet.x < state.player.x + PLAYER_WIDTH &&
        bullet.x + BULLET_WIDTH > state.player.x &&
        bullet.y < state.player.y + PLAYER_HEIGHT &&
        bullet.y + BULLET_HEIGHT > state.player.y
      ) {
        bullet.active = false;
        state.lives--;
        if (state.lives <= 0) {
          state.gameStatus = "gameover";
        }
      }
    });

    return state;
  }, []);

  const gameLoop = useCallback(
    function gameLoop(timestamp: number) {
      if (!canvasRef.current || !gameStateRef.current) return;
      if (gameStateRef.current.gameStatus !== "playing") return;

      const ctx = canvasRef.current.getContext("2d");
      if (!ctx) return;

      // Target 60 FPS
      const elapsed = timestamp - lastTimeRef.current;
      if (elapsed > 16) {
        lastTimeRef.current = timestamp;
        gameStateRef.current = update(gameStateRef.current);
        render(ctx, gameStateRef.current);

        // Update display state
        setDisplayScore(gameStateRef.current.score);
        setDisplayLives(gameStateRef.current.lives);

        if (gameStateRef.current.gameStatus === "gameover") {
          setGameStatus("gameover");
          return;
        }
        if (gameStateRef.current.gameStatus === "won") {
          setGameStatus("won");
          return;
        }
      }

      animationFrameRef.current = requestAnimationFrame(gameLoop);
    },
    [update, render],
  );

  const shoot = useCallback(() => {
    if (!gameStateRef.current || gameStateRef.current.gameStatus !== "playing")
      return;
    // Limit bullets on screen
    if (gameStateRef.current.bullets.filter((b) => b.active).length < 3) {
      gameStateRef.current.bullets.push({
        x: gameStateRef.current.player.x + PLAYER_WIDTH / 2 - BULLET_WIDTH / 2,
        y: gameStateRef.current.player.y,
        active: true,
      });
    }
  }, []);

  const startGame = useCallback(() => {
    initializeGame(1);
    animationFrameRef.current = requestAnimationFrame(gameLoop);
  }, [initializeGame, gameLoop]);

  const nextLevel = useCallback(() => {
    const nextLvl = (gameStateRef.current?.level || 1) + 1;
    initializeGame(nextLvl);
    animationFrameRef.current = requestAnimationFrame(gameLoop);
  }, [initializeGame, gameLoop]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keysRef.current.add(e.key);
      if (e.key === " " || e.key === "ArrowUp") {
        e.preventDefault();
        shoot();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      cancelAnimationFrame(animationFrameRef.current);
    };
  }, [shoot]);

  // Initial render of start screen
  useEffect(() => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Draw title
    ctx.fillStyle = "#0f0";
    ctx.font = "bold 48px monospace";
    ctx.textAlign = "center";
    ctx.fillText("SPACE INVADERS", CANVAS_WIDTH / 2, 200);

    // Draw sample aliens
    const centerX = CANVAS_WIDTH / 2 - 100;
    ALIEN_PATTERNS.forEach((pattern, i) => {
      const colors = ["#f0f", "#ff0", "#0ff"];
      ctx.fillStyle = colors[i];
      pattern.forEach((row, rowIndex) => {
        row.split("").forEach((pixel, colIndex) => {
          if (pixel === "#") {
            ctx.fillRect(
              centerX + i * 80 + colIndex * 4,
              280 + rowIndex * 4,
              4,
              4,
            );
          }
        });
      });
      ctx.fillStyle = "#fff";
      ctx.font = "16px monospace";
      ctx.fillText(`${(3 - i) * 10}`, centerX + i * 80 + 16, 340);
    });

    ctx.fillStyle = "#888";
    ctx.font = "20px monospace";
    ctx.fillText("Use ARROW KEYS or A/D to move", CANVAS_WIDTH / 2, 420);
    ctx.fillText("Press SPACE or UP to shoot", CANVAS_WIDTH / 2, 450);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4">
      <Card className="p-6 bg-black border-green-500 border-2">
        <div className="flex justify-between items-center mb-4 text-green-500 font-mono text-xl">
          <span>SCORE: {displayScore.toString().padStart(6, "0")}</span>
          <span>LEVEL: {displayLevel}</span>
          <span>LIVES: {"♥".repeat(displayLives)}</span>
        </div>

        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="border border-green-500 rounded"
          tabIndex={0}
        />

        <div className="flex justify-center gap-4 mt-4">
          {gameStatus === "start" && (
            <Button
              onClick={startGame}
              className="bg-green-600 hover:bg-green-700 text-black font-mono text-lg px-8"
            >
              START GAME
            </Button>
          )}
          {gameStatus === "gameover" && (
            <div className="text-center">
              <p className="text-red-500 font-mono text-2xl mb-4">GAME OVER</p>
              <p className="text-green-500 font-mono text-xl mb-4">
                Final Score: {displayScore}
              </p>
              <Button
                onClick={startGame}
                className="bg-green-600 hover:bg-green-700 text-black font-mono text-lg px-8"
              >
                PLAY AGAIN
              </Button>
            </div>
          )}
          {gameStatus === "won" && (
            <div className="text-center">
              <p className="text-green-500 font-mono text-2xl mb-4">
                LEVEL {displayLevel} COMPLETE!
              </p>
              <Button
                onClick={nextLevel}
                className="bg-green-600 hover:bg-green-700 text-black font-mono text-lg px-8"
              >
                NEXT LEVEL
              </Button>
            </div>
          )}
        </div>

        <div className="mt-4 text-center text-muted-foreground font-mono text-sm">
          <p>Arrow Keys / A,D = Move | Space / Up = Shoot</p>
        </div>
      </Card>
    </div>
  );
}
