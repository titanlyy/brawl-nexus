# 🥊 Brawl Nexus — MVP v3

> Browser-based multiplayer beat-'em-up. No install. Just brawl.

## What's new in v3

- **Performance**: offscreen canvas background cache — grid and platforms rendered once, blitted every frame
- **Performance**: particle cap (max 80) prevents frame drops on heavy KOs
- **Performance**: in-place array compaction instead of `filter()` allocations every frame
- **Performance**: DOM dirty-flag batching — HUD only writes to DOM when values change
- **Performance**: DOM element cache on load — no `getElementById` in the game loop
- **Gameplay**: 60-second round countdown timer — time up goes to higher HP player
- **Gameplay**: auto-face opponent when idle so players always look at each other
- **Gameplay**: jump buffer (8 frames) — pressing jump just before landing is now registered
- **Multiplayer**: correct online role input routing — P2 online now sends P2 inputs, not P1
- **Multiplayer**: live ping display in HUD during online matches
- **Stability**: double-loop guard prevents `bootMatch` from stacking two `requestAnimationFrame` loops

## Controls

| | P1 (KADE) | P2 (VEX) |
|---|---|---|
| Move | `A` / `D` | `←` / `→` |
| Jump | `W` | `↑` |
| Attack | `F` | `K` |
| Special | `G` (costs 30 MP) | `L` (costs 30 MP) |
| Dash | `Left Shift` | `/` |
| Pause | `P` | `P` |
| Restart | `R` | `R` |

## Online Multiplayer

Both players open the hosted URL → click Online Multiplayer → type the **same room code** → match starts automatically.

## Deploy to Render (Free)

1. Go to [render.com](https://render.com) → New Web Service
2. Connect GitHub → select `brawl-nexus`
3. Build: `npm install` · Start: `npm start`
4. Deploy — live in ~90 seconds

## Tech

- Vanilla Canvas 2D + JavaScript (zero dependencies on client)
- Node.js + Express + Socket.io
- Render.com free tier
