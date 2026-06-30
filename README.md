# 🥊 Brawl Nexus — MVP Plus

> Browser-based multiplayer beat-'em-up. No install. Just brawl.

## What's new in MVP Plus

- Screen shake on every hit and KO
- Hit stop (impact freeze) for satisfying combat feel
- Floating damage numbers
- Best-of-3 rounds with persistent score
- Ground dash move for faster engagements
- Pause (P) and restart (R) keyboard controls
- Clearer online room status messages
- Lean network payloads — only boolean inputs sent between peers

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

Both players open the hosted URL, click **Online Multiplayer**, type the **same room code**, and the match starts automatically when both are in.

## Deploy to Render (Free, No Card)

1. Go to [render.com](https://render.com) → **New Web Service**
2. Connect GitHub → select `brawl-nexus`
3. Build command: `npm install`
4. Start command: `npm start`
5. Deploy — live in ~90 seconds

## Tech

- Vanilla Canvas 2D + JavaScript (no frameworks)
- Node.js + Express + Socket.io
- Hosted on Render.com free tier
