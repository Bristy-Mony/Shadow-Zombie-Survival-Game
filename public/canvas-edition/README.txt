SHADOW ZOMBIE — Browser Game
================================

Files:
- index.html: game interface
- style.css: visual design, HUD and responsive layout
- game.js: game logic, flashlight, pistol, laser sight, bullets, zombie AI, health, ammo, batteries, score, timer and 2 fixed levels
- shooting.mp3: user-provided shooting sound
- background-music.mp3: user-provided background music with a seamless 5-second crossfade loop
- zombie-death.mp3: zombie death sound
- zombie-groan.mp3: zombie groan sound

Run:
Easy Windows method:
1. Double-click RUN_GAME.bat.
2. The local server starts and the game opens at http://127.0.0.1:4173.
3. Click START SURVIVING.
4. To stop the server, close the minimized "Shadow Zombie Local Server" window.

Manual method:
1. Open a terminal inside the shadow_zombie_game folder.
2. Run: node local-server.js
3. Open http://127.0.0.1:4173 in your browser.
4. Press Ctrl+C in the terminal when you want to stop the server.

Requirements:
- Node.js must be installed. No npm install or other dependencies are needed.

Controls:
- WASD / Arrow keys: move
- Mouse: move the aim point
- Hold left mouse button: show the red laser sight and fire the pistol
- Space: toggle the brighter flashlight beam on/off
- R: reload the 12-round magazine
- Shift: sprint
- P: pause/resume

Gameplay:
- Level 1 starts with exactly 10 zombies and no zombie respawns. Defeat all 10 to automatically advance to Level 2.
- Level 2 starts with exactly 20 zombies and no zombie respawns. Defeat all 20 to trigger the victory screen.
- Music and sound effects start when you click START SURVIVING. Use the sound button in the top bar to mute/unmute all audio.
- The background music plays quietly and uses two synchronized audio players for a seamless equal-power 5-second crossfade at every loop.
- Hold the left mouse button to show the red laser sight; move the mouse to aim and shoot. The red line and target marker disappear when the button is released.
- Most zombies take two direct hits to defeat. Defeated zombies award score.
- The flashlight remains equipped alongside the pistol. Aim it at zombies to slow them while you line up a shot.
- Collect glowing yellow batteries to recharge the flashlight.
- Collect blue ammo crates to replenish reserve ammunition.
- Reloads take about one second. Keep moving while reloading.
- Survive as long as possible. Your best score is saved in browser localStorage.

The arena has brighter ambient visibility so the player and zombies are easier to see even when the flashlight is off. Press Space to toggle the forward-facing flashlight beam; the beam slows zombies in its path.

This browser game uses original Canvas-drawn graphics and requires no image assets or server.
