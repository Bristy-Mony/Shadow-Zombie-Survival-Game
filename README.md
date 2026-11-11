# Shadow Zombie

**Shadow Zombie: A Light-Based Survival Game** is a complete browser-based 3D survival-horror experience. Explore an abandoned district, manage a limited flashlight and laser weapon, and fight infected creatures that grow faster in darkness.

> Survive the dark. Weaponize the light.

## Gameplay

The flashlight controls space by slowing, repelling, and briefly stunning infected, but only the laser weapon can kill them. Laser cells are limited, headshots deal bonus damage, and killed enemies can drop health, energy cells, or persistent shop coins.

## Objective

Recover three power fuses from the district, install them in the central generator, then follow the newly powered streetlights to the evacuation gate and enter the safe zone.

## Controls

| Control | Action |
| --- | --- |
| `WASD` | Move |
| Mouse | Look / aim flashlight |
| Left mouse | Fire laser weapon |
| `Shift` | Sprint |
| `F` | Toggle flashlight |
| `E` | Interact / collect |
| `Esc` | Pause |

Click the game canvas to recapture the mouse after it has been released.

## Features

- Dynamic gameplay lighting and light-exposure system
- Real-time selective shadows, atmospheric fog, dust, and electrical sparks
- Third-person camera and procedural player animation
- Normal and Shadow Zombie finite-state AI with procedural animation
- Zombie health, laser hitscan combat, headshots, death animations, and visible tracers
- Random energy-cell locations and enemy health/cell/coin loot drops
- Persistent coin wallet and a six-item main-menu upgrade shop
- Darkness buffs, light recoil, focused-beam stun, and safe light zones
- Lightweight sphere-vs-AABB collision detection
- Fuse, battery, and medical pickups plus an optional floodlight breaker
- Generator power-up sequence, evacuation gate, victory, death, pause, and in-place restart
- User-provided looping gameplay music plus CC0 laser, impact, and zombie approach/attack/death effects
- Responsive renderer with capped pixel ratio
- Rigged Quaternius humanoid characters with blended idle, walk, jog, sprint, hit, and attack animations
- ACES tone mapping and selective bloom for cinematic light response

## Third-Party Assets

The clothed survivor, four distinct zombie types, character animations, vehicles, and urban props are from Quaternius' **Zombie Apocalypse Kit**. The pack is released under CC0 1.0 and may be used commercially. A local license copy is included in `public/assets/zombie-pack/`.

The gameplay soundtrack is the user-provided track bundled for this project. Laser and impact sounds are from Kenney's CC0 **Sci-Fi Sounds** pack, while zombie vocals are from artisticdude's CC0 **Zombies Sound Pack**. Full provenance is included in `public/assets/audio/SOURCES.md`.

## Installation

```bash
npm install
npm run dev
```

Then open the local URL printed by Vite in a modern desktop browser.

## Production Build

```bash
npm run build
```

## Technology

- Three.js
- TypeScript
- Vite
- HTML5 / CSS3

The game combines Three.js procedural effects with bundled open assets and the project owner's supplied soundtrack.
