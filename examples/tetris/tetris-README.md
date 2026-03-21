# Camp Half-Blood Tetris 🏛️⚡

A Percy Jackson themed Tetris game built as a plugin for Daax. Stack blocks representing the Greek gods and achieve victory in this mythological puzzle challenge!

## Features

### Game Mechanics
- **Classic Tetris** - 10x20 grid with 7 tetromino pieces
- **Hold Piece** - Press 'C' to save a piece for later
- **Next Piece Preview** - Plan your moves ahead
- **Hard Drop** - Instantly place pieces with Space
- **Progressive Difficulty** - Levels increase speed every 10 lines
- **Score System** - Classic Tetris scoring with multipliers

### Percy Jackson Theme
Each tetromino represents a Greek god from the Percy Jackson universe:

- **🔱 I-Piece (Poseidon)** - The trident of the sea god
- **🛡️ O-Piece (Athena)** - The wisdom goddess's shield
- **⚡ T-Piece (Zeus)** - The lightning bolt of the sky god
- **🪽 S-Piece (Hermes)** - The messenger god's wing
- **⚔️ Z-Piece (Ares)** - The war god's sword
- **🏹 J-Piece (Artemis)** - The hunt goddess's bow
- **🎵 L-Piece (Apollo)** - The music god's lyre

### Visual Design
- Ocean blue and gold color palette
- Greek mythology aesthetic
- Smooth 60fps animations
- 3D block effects
- Camp Half-Blood branding

## Controls

| Key | Action |
|-----|--------|
| ← → | Move left/right |
| ↓ | Soft drop (move down faster) |
| ↑ / X | Rotate piece |
| Space | Hard drop (instant placement) |
| C | Hold/swap piece |
| P / Esc | Pause/resume game |

## Scoring

- **Single (1 line)**: 100 × (level + 1)
- **Double (2 lines)**: 300 × (level + 1)
- **Triple (3 lines)**: 500 × (level + 1)
- **Tetris (4 lines)**: 800 × (level + 1)
- **Soft drop**: +1 point per cell
- **Hard drop**: +2 points per cell dropped

## How to Play

1. Start the game by clicking "Start Quest"
2. Use arrow keys to position falling pieces
3. Create complete horizontal lines to clear them
4. The game speeds up as you level up
5. Try to last as long as possible and achieve a high score!

## Installation & Setup

### Prerequisites
- Node.js 18+ or Bun
- Daax installed

### Running the Game

1. **Install dependencies**:
   ```bash
   npm install
   # or
   bun install
   ```

2. **Start the development server**:
   ```bash
   npm run dev
   # or
   bun dev
   ```

3. **Access the game**:
   - Navigate to `http://localhost:4200/tetris`
   - Or click on the "Tetris" link in the Daax navigation

### Using Docker

```bash
# Build container
docker build -t daax .

# Run container
docker run -d \
  --name daax \
  -p 4200:4200 \
  -p 4201:4201 \
  daax
```

Access at: `http://localhost:4200/tetris`

## Architecture

### Plugin System
The game is built as a Daax plugin, making it:
- Easy to enable/disable
- Isolated from core features
- Integrated with existing routing and theming

### Tech Stack
- **React 18+** - UI framework
- **TypeScript** - Type safety
- **HTML Canvas** - High-performance rendering
- **Motion (Framer Motion)** - Smooth animations
- **Tailwind CSS** - Styling

### File Structure
```
plugins/tetris/
├── index.ts                 # Plugin registration
├── components/
│   ├── TetrisGame.tsx      # Main game component
│   ├── GameCanvas.tsx      # Canvas renderer
│   ├── GameControls.tsx    # UI controls
│   ├── ScoreBoard.tsx      # Score display
│   └── PiecePreview.tsx    # Next/hold piece previews
├── hooks/
│   ├── useGameState.ts     # Game state management
│   ├── useGameLoop.ts      # Animation loop
│   └── useControls.ts      # Input handling
├── lib/
│   ├── tetris-engine.ts    # Core game logic
│   ├── tetrominoes.ts      # Piece definitions
│   ├── collision.ts        # Collision detection
│   └── scoring.ts          # Score calculation
└── types.ts                # TypeScript types
```

## Decision Log

All architectural and implementation decisions are logged in JSONL format at:
`/workspace/data/tetris-decisions.jsonl`

This includes decisions about:
- Architecture choices (plugin system, Canvas rendering, state management)
- Design choices (Percy Jackson theme, color palette, god mappings)
- Implementation choices (game mechanics, controls, scoring)
- Performance targets (60 FPS, rendering optimization)
- Deployment strategy (Cloudflare Tunnel)

View with:
```bash
cat data/tetris-decisions.jsonl | jq
```

## Documentation

- **Architecture Document**: `/workspace/docs/tetris-architecture.md`
- **Decision Log**: `/workspace/data/tetris-decisions.jsonl`
- **README**: This file

## Sharing the Game

### Cloudflare Tunnel

1. **Install cloudflared**:
   ```bash
   # Linux/macOS
   curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o cloudflared
   chmod +x cloudflared
   sudo mv cloudflared /usr/local/bin/
   ```

2. **Authenticate**:
   ```bash
   cloudflared tunnel login
   ```

3. **Create tunnel**:
   ```bash
   cloudflared tunnel create daax-tetris
   ```

4. **Start tunnel** (with dev server running on port 4200):
   ```bash
   cloudflared tunnel --url http://localhost:4200
   ```

5. **Share the public URL** provided by Cloudflare!

### Alternative: Quick Share with npx
```bash
npx cloudflared tunnel --url http://localhost:4200
```

## Credits

- **Game Design**: Classic Tetris mechanics
- **Theme**: Percy Jackson & the Olympians by Rick Riordan
- **Built for**: Daax
- **Architecture**: Plugin-based design
- **Technology**: React, TypeScript, Canvas API

## License

Part of the Daax project.

---

**May the gods guide your blocks!** ⚡️ 🏛️ 🎮
