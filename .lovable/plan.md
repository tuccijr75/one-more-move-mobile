

## One More Move — Mobile Touch Game

### Overview
Port the existing "One More Move" tactical survival puzzle game into the Lovable React app, wrapping the vanilla JS game engine and adding full touch controls. The game will be playable as an installable web app (PWA) immediately, with Capacitor setup for future App Store/Play Store deployment.

### Core Features

**1. Game Engine Integration**
- Embed the existing `game.js` canvas-based game into a React component using a ref-based wrapper
- Adapt the canvas to be responsive and fill the mobile viewport (portrait orientation)
- Remove all keyboard event listeners; replace with touch-based input system

**2. Touch Movement Controls**
- **Swipe gestures**: Swipe up/down/left/right for cardinal movement (with dead zone and direction detection)
- **Tap to move**: Tap any adjacent tile (including diagonals when token available) to move there
- Prevent accidental scrolling/zooming — lock the viewport to the game

**3. Ability Bar (Bottom HUD)**
- Floating ability icons at the bottom of the screen showing: Diagonal (D), Wall Ignore (W), Phase Step (F), Freeze (B), Time Freeze (TF)
- Each icon shows availability count and cooldown state (greyed out when on cooldown)
- Tap an ability icon to arm it, then swipe/tap to execute the action
- Visual feedback: armed ability glows/pulses, cooldown timer shown as overlay

**4. Mobile-Optimized UI**
- Full-screen portrait layout with the game grid centered
- Top HUD: turns, best score, stage, difficulty, seed — compact horizontal bar
- Game-over overlay with tap-to-restart and difficulty selection
- Settings accessible via gear icon (slide-up panel instead of keyboard shortcuts)
- Difficulty selection via tap buttons (replacing 1/2/3 keys)

**5. Game Action Buttons**
- Replay (R), New Run (N), and Manual Seed (M) as tap buttons on the game-over screen
- Mute toggle as a tap icon

**6. PWA Setup**
- Web app manifest for installability (Add to Home Screen)
- Mobile meta tags (viewport, theme-color, apple-mobile-web-app-capable)
- App icons for home screen
- No service worker initially (simple installable web app)

**7. Capacitor Configuration**
- Install Capacitor dependencies and initialize config
- Configure for hot-reload from the Lovable preview URL during development
- Document the steps for building native iOS/Android apps locally

### Pages
- **/** — Main game screen (full viewport, no navigation chrome)

