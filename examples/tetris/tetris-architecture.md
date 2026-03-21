# Percy Jackson Tetris - Architecture Document

## Overview
A Percy Jackson themed Tetris game built as a plugin for the Daax platform. The game features Greek mythology theming, canvas-based rendering, and integrates seamlessly with the existing plugin architecture.

## Architecture Decisions

### 1. Plugin-Based Architecture
**Decision**: Build as a Daax plugin rather than standalone app
**Rationale**:
- Leverage existing infrastructure (routing, theming, UI components)
- Consistent with project's plugin-first approach
- Easy to enable/disable
- Reuses layout and navigation

### 2. Rendering Strategy
**Decision**: HTML Canvas API for game rendering
**Rationale**:
- Superior performance for 60fps animations
- Pixel-perfect control for Tetris blocks
- Efficient rendering of game grid
- Enables particle effects and animations

### 3. State Management
**Decision**: React hooks with useReducer for game state
**Rationale**:
- No external state library needed
- Predictable state transitions
- Easy to debug game logic
- Integrates naturally with React

### 4. Theme Implementation
**Decision**: Percy Jackson / Camp Half-Blood aesthetic
**Elements**:
- **Colors**: Ocean blue (#1e40af), gold (#f59e0b), bronze (#92400e), celestial bronze
- **Blocks**: Styled as Greek columns, shields, or camp cabins
- **Background**: Camp Half-Blood or underwater theme
- **Fonts**: Greek-inspired typography
- **Effects**: Water ripples, lightning, celestial particles

### 5. Game Mechanics
**Decision**: Classic Tetris with power-ups
**Features**:
- Standard 10x20 grid
- 7 tetromino shapes (themed as different gods' symbols)
- Scoring system with combo multipliers
- Level progression with increasing speed
- Hold piece functionality
- Next piece preview
- Percy Jackson power-ups (lightning bolt, trident, etc.)

## Technical Stack

### Core Technologies
- **React 18+**: UI components and game loop
- **TypeScript**: Type safety for game logic
- **HTML Canvas**: Rendering engine
- **Motion (Framer Motion)**: UI animations
- **Tailwind CSS**: Styling

### File Structure
```
plugins/tetris/
├── index.ts                 # Plugin manifest and registration
├── components/
│   ├── TetrisGame.tsx      # Main game component
│   ├── GameCanvas.tsx      # Canvas renderer
│   ├── GameControls.tsx    # UI controls (start, pause, restart)
│   ├── ScoreBoard.tsx      # Score, level, lines display
│   ├── NextPiece.tsx       # Preview next piece
│   └── HoldPiece.tsx       # Hold piece display
├── hooks/
│   ├── useGameState.ts     # Game state management
│   ├── useGameLoop.ts      # RequestAnimationFrame loop
│   └── useControls.ts      # Keyboard/touch input
├── lib/
│   ├── tetris-engine.ts    # Core game logic
│   ├── tetrominoes.ts      # Piece definitions
│   ├── collision.ts        # Collision detection
│   ├── scoring.ts          # Score calculation
│   └── theme.ts            # Percy Jackson theme data
└── types.ts                # TypeScript definitions
```

## Data Flow

```
User Input (Keyboard/Touch)
    ↓
useControls hook
    ↓
Game State (useReducer)
    ↓
Tetris Engine (pure functions)
    ↓
Canvas Renderer
    ↓
Display Update (60fps)
```

## Decision Log Format

All architectural and implementation decisions are logged to `/workspace/data/tetris-decisions.jsonl` in the following format:

```json
{
  "timestamp": "2025-12-27T10:30:00.000Z",
  "category": "architecture|implementation|design|performance",
  "decision": "Description of what was decided",
  "rationale": "Why this decision was made",
  "alternatives": ["Other options considered"],
  "impact": "What this affects"
}
```

## Performance Targets

- **Frame Rate**: 60 FPS constant
- **Input Latency**: < 16ms
- **Grid Size**: 10x20 cells
- **Update Rate**: Varies by level (800ms → 100ms)

## Percy Jackson Theme Elements

### Tetromino Designs
- **I-piece**: Trident (Poseidon)
- **O-piece**: Shield (Athena)
- **T-piece**: Lightning Bolt (Zeus)
- **S-piece**: Caduceus (Hermes)
- **Z-piece**: Sword (Ares)
- **J-piece**: Bow (Artemis)
- **L-piece**: Lyre (Apollo)

### Color Palette
```css
--ocean-blue: #1e40af
--gold: #f59e0b
--bronze: #92400e
--celestial-bronze: #cd7f32
--water-light: #3b82f6
--water-dark: #1e3a8a
--camp-green: #15803d
```

### Audio (Optional)
- Background: Camp Half-Blood ambiance
- Line clear: Sword slash
- Tetris: Thunder/lightning
- Game over: Quest complete fanfare

## Deployment

### Cloudflare Tunnel Setup
1. Install cloudflared
2. Authenticate tunnel
3. Create tunnel configuration pointing to localhost:4200
4. Start tunnel and share public URL

## Future Enhancements
- Multiplayer mode (battle other demigods)
- Quest mode (complete challenges)
- Character selection (play as Percy, Annabeth, etc.)
- Leaderboard integration
- Mobile responsive controls
