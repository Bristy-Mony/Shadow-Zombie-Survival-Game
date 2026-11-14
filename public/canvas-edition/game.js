(() => {
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const $ = id => document.getElementById(id);
  const W = canvas.width, H = canvas.height;
  const keys = new Set();

  let running = false, paused = false, gameOver = false, lightOn = false;
  let shooting = false;
  let player, zombies = [], batteries = [], ammoPacks = [], bullets = [], particles = [];
  let score = 0, elapsed = 0, battery = 100, health = 100, lives = 3, collected = 0, levelNow = 1, victory = false;
  let magazine = 12, reserveAmmo = 72, reloadTimer = 0;
  let lastTime = 0, spawnTimer = 0, batteryTimer = 0, ammoTimer = 0;
  let damageTimer = 0, fireCooldown = 0, muzzleFlash = 0, recoil = 0, frame = 0;
  let mouse = {x: W * .7, y: H * .5}, soundEnabled = true, audioCtx = null;
  const gunAudio = new Audio('shooting.mp3');
  const deathAudio = new Audio('zombie-death.mp3');
  const groanAudio = new Audio('zombie-groan.mp3');
  [gunAudio, deathAudio, groanAudio].forEach(a => { a.preload = 'auto'; a.volume = .55; });

  // Two players overlap the same user-provided track so every repeat is seamless.
  const MUSIC_VOLUME = .2;
  const MUSIC_CROSSFADE_SECONDS = 5;
  const musicTracks = [new Audio('background-music.mp3'), new Audio('background-music.mp3')];
  let activeMusic = 0, musicFading = false, musicFadeFrame = 0, musicWatchTimer = 0;
  musicTracks.forEach((track, index) => {
    track.loop = false;
    track.preload = 'auto';
    track.volume = index === 0 ? MUSIC_VOLUME : 0;
    track.addEventListener('ended', () => {
      if (soundEnabled && index === activeMusic && !musicFading) {
        track.currentTime = 0;
        track.volume = MUSIC_VOLUME;
        track.play().catch(() => {});
      }
    });
  });

  function beginMusicCrossfade() {
    if (!soundEnabled || musicFading) return;
    const outgoingIndex = activeMusic;
    const incomingIndex = 1 - outgoingIndex;
    const outgoing = musicTracks[outgoingIndex];
    const incoming = musicTracks[incomingIndex];
    musicFading = true;
    incoming.pause();
    incoming.currentTime = 0;
    incoming.volume = 0;
    incoming.play().then(() => {
      const fadeStartedAt = performance.now();
      const fade = now => {
        if (!musicFading || !soundEnabled) return;
        const progress = Math.min(1, (now - fadeStartedAt) / (MUSIC_CROSSFADE_SECONDS * 1000));
        // Equal-power curves keep the perceived loudness steady through the overlap.
        outgoing.volume = MUSIC_VOLUME * Math.cos(progress * Math.PI * .5);
        incoming.volume = MUSIC_VOLUME * Math.sin(progress * Math.PI * .5);
        if (progress < 1) {
          musicFadeFrame = requestAnimationFrame(fade);
        } else {
          outgoing.pause();
          outgoing.currentTime = 0;
          outgoing.volume = 0;
          activeMusic = incomingIndex;
          incoming.volume = MUSIC_VOLUME;
          musicFading = false;
        }
      };
      musicFadeFrame = requestAnimationFrame(fade);
    }).catch(() => { musicFading = false; });
  }

  function watchMusicLoop() {
    const active = musicTracks[activeMusic];
    if (!soundEnabled || musicFading || !Number.isFinite(active.duration)) return;
    if (active.duration - active.currentTime <= MUSIC_CROSSFADE_SECONDS) beginMusicCrossfade();
  }

  function startAmbience() {
    try {
      if (!soundEnabled) return;
      const active = musicTracks[activeMusic];
      active.volume = MUSIC_VOLUME;
      if (active.paused) active.play().catch(() => {});
      if (!musicWatchTimer) musicWatchTimer = window.setInterval(watchMusicLoop, 150);
    } catch(e) {}
  }

  function stopAmbience() {
    cancelAnimationFrame(musicFadeFrame);
    musicFading = false;
    const keepIndex = musicTracks[1].volume > musicTracks[0].volume ? 1 : 0;
    activeMusic = keepIndex;
    musicTracks.forEach((track, index) => {
      track.pause();
      track.volume = index === activeMusic ? MUSIC_VOLUME : 0;
      if (index !== activeMusic) track.currentTime = 0;
    });
  }
  function playClip(audio, volume = .55) {
    if (!soundEnabled) return;
    try { const clip = audio.cloneNode(); clip.volume = volume; clip.currentTime = 0; clip.play().catch(() => {}); } catch(e) {}
  }
  const levelZombieCounts = [5, 10, 15, 20, 30];
  let levelTransitionTimer = 0, transitionToLevel = 0, transitionVictory = false;
  let best = Number(localStorage.getItem('shadowZombieBest') || 0);

  function reset() {
    player = {x: W / 2, y: H / 2, r: 12, speed: 190, angle: 0};
    zombies = []; batteries = []; ammoPacks = []; bullets = []; particles = [];
    score = 0; elapsed = 0; battery = 100; health = 100; lives = 3; collected = 0; levelNow = 1; victory = false;
    magazine = 12; reserveAmmo = 72; reloadTimer = 0;
    spawnTimer = 0; batteryTimer = 1.5; ammoTimer = 7;
    levelTransitionTimer = 0; transitionToLevel = 0; transitionVictory = false;
    damageTimer = 0; fireCooldown = 0; muzzleFlash = 0; recoil = 0; frame = 0;
    lightOn = false; shooting = false;
    for (let i = 0; i < levelZombieCounts[0]; i++) spawnZombie(true);
    for (let i = 0; i < 3; i++) spawnBattery();
    spawnAmmoPack();
    updateHUD();
  }

  function rand(min, max) { return min + Math.random() * (max - min); }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

  function spawnZombie(initial = false) {
    let x, y, tries = 0;
    do {
      const side = Math.floor(Math.random() * 4);
      x = side === 0 ? 20 : side === 1 ? W - 20 : rand(20, W - 20);
      y = side === 2 ? 20 : side === 3 ? H - 20 : rand(20, H - 20);
      tries++;
    } while (player && Math.hypot(x - player.x, y - player.y) < (initial ? 170 : 250) && tries < 15);
    zombies.push({
      x, y, r: rand(12, 17), speed: rand(30, 48) + Math.min(elapsed * .18, 32),
      stun: 0, phase: Math.random() * 6, hp: 2, maxHp: 2, hitFlash: 0, dead: false
    });
    if (!initial && Math.random() < .45) playClip(groanAudio, 1.0);
  }

  function spawnBattery() {
    let p, tries = 0;
    do {
      p = {x: rand(45, W - 45), y: rand(45, H - 45), r: 9, phase: Math.random() * 6};
      tries++;
    } while (player && dist(p, player) < 100 && tries < 20);
    batteries.push(p);
  }

  function spawnAmmoPack() {
    if (ammoPacks.length >= 2) return;
    let p, tries = 0;
    do {
      p = {x: rand(45, W - 45), y: rand(45, H - 45), r: 11, phase: Math.random() * 6};
      tries++;
    } while (player && dist(p, player) < 130 && tries < 20);
    ammoPacks.push(p);
  }

  function start() {
    reset(); running = true; paused = false; gameOver = false;
    startAmbience();
    $('startOverlay').classList.add('hidden');
    $('gameOver').classList.add('hidden');
    $('pauseBtn').disabled = false;
    $('pauseBtn').textContent = 'Ⅱ  PAUSE GAME';
    $('statusText').textContent = 'LEVEL 1 — 10 ZOMBIES';
    $('canvasHint').textContent = 'LEVEL 1: DEFEAT ALL 10 ZOMBIES  ·  FLASHLIGHT: OFF';
    lastTime = performance.now();
    requestAnimationFrame(loop);
  }

  function endGame() {
    running = false; gameOver = true; shooting = false;
    const final = Math.floor(score + elapsed * 4);
    if (final > best) {
      best = final;
      localStorage.setItem('shadowZombieBest', String(best));
    }
    $('finalScore').textContent = final.toLocaleString();
    $('endTitle').textContent = victory ? 'YOU CLEARED ALL 5 LEVELS!' : 'YOU WERE OVERRUN';
    $('gameOver').classList.remove('hidden');
    $('pauseBtn').disabled = true;
    $('statusText').textContent = 'SIGNAL LOST';
    playTone(90, .35, 'sawtooth');
  }

  function updateHUD() {
    $('healthText').textContent = Math.max(0, Math.round(health)) + '%';
    $('healthBar').style.width = Math.max(0, health) + '%';
    $('healthBar').style.background = health < 35
      ? 'linear-gradient(90deg,#d84b5e,#f58b88)'
      : 'linear-gradient(90deg,#54cb97,#a1edb8)';

    $('batteryText').textContent = Math.round(battery) + '%';
    $('batteryBar').style.width = Math.max(0, battery) + '%';
    $('batteryBar').style.background = battery < 25
      ? 'linear-gradient(90deg,#d84b5e,#f58b88)'
      : 'linear-gradient(90deg,#d3a83c,#f5e68c)';

    $('ammoText').textContent = reloadTimer > 0
      ? 'RELOADING…'
      : `${magazine} / ${reserveAmmo}`;
    $('ammoBar').style.width = (magazine / 12 * 100) + '%';
    $('ammoNote').textContent = reloadTimer > 0
      ? `Reloading ${reloadTimer.toFixed(1)}s · Keep moving`
      : (magazine === 0 && reserveAmmo === 0
        ? 'OUT OF AMMO · Collect supply crates'
        : 'Press R to reload · Collect blue ammo crates');

    $('timeStat').textContent = String(Math.floor(elapsed / 60)).padStart(2, '0') + ':' + String(Math.floor(elapsed % 60)).padStart(2, '0');
    $('scoreStat').textContent = String(Math.floor(score + elapsed * 4)).padStart(4, '0');
    $('lifeRow').innerHTML = Array.from({length: 3}, (_, i) => `<span style="opacity:${i < lives ? 1 : .2}">♥</span>`).join('') + '<small>' + lives + ' LIVES</small>';
    $('objectiveText').textContent = Math.min(collected, 5) + ' / 5 batteries';
    $('objectiveBar').style.width = Math.min(100, collected * 20) + '%';
    $('level').textContent = String(levelNow).padStart(2, '0');
  }

  function playTone(freq, duration, type = 'sine', volume = .05) {
    if (!soundEnabled) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.setValueAtTime(volume, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(.001, audioCtx.currentTime + duration);
      o.connect(g); g.connect(audioCtx.destination);
      o.start(); o.stop(audioCtx.currentTime + duration);
    } catch (e) { /* Audio is optional. */ }
  }

  function startReload() {
    if (reloadTimer > 0 || magazine === 12 || reserveAmmo <= 0) return;
    shooting = false;
    reloadTimer = 1.05;
    playTone(280, .07, 'triangle', .025);
    updateHUD();
  }

  function fireWeapon() {
    if (!running || paused || reloadTimer > 0 || fireCooldown > 0) return;
    if (magazine <= 0) {
      if (reserveAmmo > 0) startReload();
      else playTone(120, .05, 'square', .025);
      return;
    }

    player.angle = Math.atan2(mouse.y - player.y, mouse.x - player.x);
    const a = player.angle;
    const muzzleX = player.x + Math.cos(a) * 29 - Math.sin(a) * -8;
    const muzzleY = player.y + Math.sin(a) * 29 + Math.cos(a) * -8;
    const targetDistance = Math.hypot(mouse.x - muzzleX, mouse.y - muzzleY);
    const speed = 920;
    bullets.push({
      x: muzzleX, y: muzzleY, prevX: muzzleX, prevY: muzzleY,
      vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
      life: Math.min(1.25, targetDistance / speed + .35), dead: false
    });
    magazine--;
    fireCooldown = .19;
    muzzleFlash = .075;
    recoil = 1;
    playClip(gunAudio, .28);
    if (magazine === 0 && reserveAmmo > 0) {
      // Begin the reload just after the final round has left the barrel.
      setTimeout(() => { if (running && !paused && magazine === 0) startReload(); }, 120);
    }
    updateHUD();
  }

  function update(dt) {
    if (!running || paused) return;
    if (levelTransitionTimer > 0) {
      levelTransitionTimer = Math.max(0, levelTransitionTimer - dt);
      if (levelTransitionTimer === 0) {
        if (transitionVictory) {
          victory = true;
          endGame();
          return;
        }
        levelNow = transitionToLevel;
        const count = levelZombieCounts[levelNow - 1];
        for (let i = 0; i < count; i++) spawnZombie(true);
        $('statusText').textContent = `LEVEL ${levelNow} — ${count} ZOMBIES`;
        $('canvasHint').textContent = `LEVEL ${levelNow}: DEFEAT ALL ${count} ZOMBIES`;
        updateHUD();
      }
      return;
    }
    elapsed += dt; frame++;
    spawnTimer += dt; batteryTimer += dt; ammoTimer += dt;
    damageTimer = Math.max(0, damageTimer - dt);
    fireCooldown = Math.max(0, fireCooldown - dt);
    muzzleFlash = Math.max(0, muzzleFlash - dt);
    recoil = Math.max(0, recoil - dt * 7);

    if (reloadTimer > 0) {
      reloadTimer = Math.max(0, reloadTimer - dt);
      if (reloadTimer === 0) {
        const loaded = Math.min(12 - magazine, reserveAmmo);
        magazine += loaded;
        reserveAmmo -= loaded;
        playTone(520, .06, 'triangle', .025);
      }
    }
    if (shooting && fireCooldown <= 0 && reloadTimer <= 0) fireWeapon();

    let dx = 0, dy = 0;
    if (keys.has('w') || keys.has('arrowup')) dy--;
    if (keys.has('s') || keys.has('arrowdown')) dy++;
    if (keys.has('a') || keys.has('arrowleft')) dx--;
    if (keys.has('d') || keys.has('arrowright')) dx++;
    const len = Math.hypot(dx, dy) || 1;
    const sprint = keys.has('shift') ? 1.55 : 1;
    player.x = Math.max(20, Math.min(W - 20, player.x + dx / len * player.speed * sprint * dt));
    player.y = Math.max(20, Math.min(H - 20, player.y + dy / len * player.speed * sprint * dt));
    player.angle = Math.atan2(mouse.y - player.y, mouse.x - player.x);

    if (lightOn && battery > 0) battery = Math.max(0, battery - 7.2 * dt);
    else if (!lightOn) battery = Math.min(100, battery + .35 * dt);
    if (battery <= 0 && lightOn) {
      lightOn = false;
      $('canvasHint').textContent = 'FLASHLIGHT EMPTY  ·  FIND A BATTERY';
    }

    // Fixed-size waves: exactly 10 zombies in level 1, then exactly 20 in level 2.
    // No extra zombies spawn during either level.
    if (batteryTimer > 9) {
      batteryTimer = 0;
      if (batteries.length < 4) spawnBattery();
    }
    if (ammoTimer > 15) {
      ammoTimer = 0;
      if (ammoPacks.length < 2 && reserveAmmo < 120) spawnAmmoPack();
    }

    zombies.forEach(z => {
      z.phase += dt * 4;
      z.hitFlash = Math.max(0, z.hitFlash - dt);
      const d = dist(z, player);
      const angle = Math.atan2(player.y - z.y, player.x - z.x);
      const inBeam = lightOn && battery > 0 && d < 300 && Math.abs(angleDiff(angle, player.angle)) < .36;
      if (inBeam) {
        z.stun = Math.min(1.4, z.stun + dt * 1.8);
        if (Math.random() < dt * 1.2) particles.push({x: z.x, y: z.y, life: .4, max: .4, color: '#f3d56b'});
      } else {
        z.stun = Math.max(0, z.stun - dt * .85);
      }
      if (z.stun < .85) {
        const slowed = inBeam ? .12 : 1;
        z.x += Math.cos(angle) * z.speed * dt * slowed;
        z.y += Math.sin(angle) * z.speed * dt * slowed;
      }

      if (d < z.r + player.r + 2 && damageTimer <= 0) {
        health -= 17; damageTimer = .75;
        playTone(75, .12, 'square', .04);
        if (health <= 0) {
          lives--; health = 100;
          if (lives <= 0) { endGame(); return; }
          player.x = W / 2; player.y = H / 2;
          z.x = rand(20, W - 20); z.y = rand(20, H - 20);
        }
      }
    });
    if (!running) return;

    // Move each round and test the whole segment so fast bullets cannot pass through a zombie between frames.
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.prevX = b.x; b.prevY = b.y;
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      let hit = null;
      for (const z of zombies) {
        if (z.dead) continue;
        if (pointSegmentDistance(z.x, z.y, b.prevX, b.prevY, b.x, b.y) <= z.r + 4) {
          hit = z; break;
        }
      }
      if (hit) {
        hit.hp--; hit.hitFlash = .16; hit.stun = Math.max(hit.stun, .18);
        for (let j = 0; j < 7; j++) {
          particles.push({x: b.x, y: b.y, life: rand(.18, .42), max: .42, color: j % 2 ? '#c65c69' : '#f3d56b'});
        }
        playTone(185, .045, 'triangle', .025);
        if (hit.hp <= 0) {
          hit.dead = true;
          score += 80;
          for (let j = 0; j < 15; j++) particles.push({x: hit.x, y: hit.y, life: rand(.25, .65), max: .65, color: '#b95b67'});
          playTone(390, .09, 'sawtooth', .035);
          playClip(deathAudio, 1.0);
        }
        b.dead = true;
      }
      if (b.life <= 0 || b.x < -20 || b.x > W + 20 || b.y < -20 || b.y > H + 20) b.dead = true;
    }
    bullets = bullets.filter(b => !b.dead);
    zombies = zombies.filter(z => !z.dead);

    // Each level is a fixed wave; show a 5-second LEVEL COMPLETE intermission.
    if (zombies.length === 0 && levelTransitionTimer <= 0) {
      $('statusText').textContent = `LEVEL ${levelNow} COMPLETE`;
      if (levelNow < levelZombieCounts.length) {
        transitionToLevel = levelNow + 1;
        transitionVictory = false;
      } else {
        transitionToLevel = 0;
        transitionVictory = true;
      }
      levelTransitionTimer = 5;
      shooting = false;
      playTone(660, .18, 'triangle', .06);
    }

    for (let i = batteries.length - 1; i >= 0; i--) {
      if (dist(player, batteries[i]) < player.r + 12) {
        batteries.splice(i, 1);
        battery = Math.min(100, battery + 38); score += 100; collected++;
        playTone(620, .12, 'sine', .035);
        for (let j = 0; j < 12; j++) particles.push({x: player.x, y: player.y, life: .5, max: .5, color: '#f3d56b'});
        spawnBattery();
      }
    }

    for (let i = ammoPacks.length - 1; i >= 0; i--) {
      if (dist(player, ammoPacks[i]) < player.r + 14) {
        ammoPacks.splice(i, 1);
        reserveAmmo = Math.min(120, reserveAmmo + 24);
        score += 50;
        playTone(720, .1, 'sine', .035);
        for (let j = 0; j < 10; j++) particles.push({x: player.x, y: player.y, life: .45, max: .45, color: '#73caff'});
      }
    }

    particles.forEach(p => { p.life -= dt; p.x += rand(-20, 20) * dt; p.y -= 20 * dt; });
    particles = particles.filter(p => p.life > 0);
    updateHUD();
  }

  function angleDiff(a, b) { return Math.atan2(Math.sin(a - b), Math.cos(a - b)); }

  function pointSegmentDistance(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const lengthSq = dx * dx + dy * dy;
    if (lengthSq === 0) return Math.hypot(px - x1, py - y1);
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSq));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  }

  function drawFloor() {
    ctx.fillStyle = '#111a25'; ctx.fillRect(0, 0, W, H);
    const grad = ctx.createRadialGradient(W * .5, H * .48, 20, W * .5, H * .5, W * .78);
    grad.addColorStop(0, '#2a3a4b'); grad.addColorStop(.58, '#1b2938'); grad.addColorStop(1, '#101721');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(154,177,201,.12)'; ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    for (let i = 0; i < 12; i++) {
      const x = (i * 137 + 73) % W, y = (i * 83 + 29) % H;
      ctx.fillStyle = 'rgba(55,72,89,.42)'; ctx.fillRect(x, y, 16 + (i % 3) * 4, 7 + (i % 2) * 4);
    }
  }

  function drawBattery(b) {
    const glow = ctx.createRadialGradient(b.x, b.y, 1, b.x, b.y, 27);
    glow.addColorStop(0, '#f5e78c66'); glow.addColorStop(1, '#f5e78c00');
    ctx.fillStyle = glow; ctx.fillRect(b.x - 28, b.y - 28, 56, 56);
    ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(Math.sin(frame * .04 + b.phase) * .08);
    ctx.fillStyle = '#e6c65b'; ctx.fillRect(-9, -6, 18, 12);
    ctx.fillStyle = '#fff1a2'; ctx.fillRect(-6, -4, 9, 8);
    ctx.fillStyle = '#f3d56b'; ctx.fillRect(9, -3, 3, 6); ctx.restore();
  }

  function drawAmmoPack(p) {
    const glow = ctx.createRadialGradient(p.x, p.y, 1, p.x, p.y, 31);
    glow.addColorStop(0, '#62c8ff88'); glow.addColorStop(1, '#62c8ff00');
    ctx.fillStyle = glow; ctx.fillRect(p.x - 32, p.y - 32, 64, 64);
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.sin(frame * .045 + p.phase) * .06);
    ctx.fillStyle = '#1d5272'; ctx.strokeStyle = '#83d7ff'; ctx.lineWidth = 1.5;
    ctx.fillRect(-11, -8, 22, 16); ctx.strokeRect(-11, -8, 22, 16);
    ctx.fillStyle = '#d7f3ff';
    for (let i = 0; i < 3; i++) { ctx.fillRect(-7 + i * 6, -4, 3, 8); }
    ctx.restore();
  }

  function drawZombie(z) {
    ctx.save(); ctx.translate(z.x, z.y); ctx.rotate(Math.sin(z.phase) * .06);
    if (z.stun > .25) { ctx.shadowColor = '#f3d56b'; ctx.shadowBlur = 24; }
    ctx.fillStyle = z.hitFlash > 0 ? '#b94f5c' : (z.stun > .25 ? '#827d59' : '#252d39');
    ctx.strokeStyle = '#111720'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.roundRect(-z.r * .7, -z.r * .1, z.r * 1.4, z.r * 1.7, 5); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, -z.r * .75, z.r * .65, 0, Math.PI * 2);
    ctx.fillStyle = z.hitFlash > 0 ? '#c45b68' : '#303b49'; ctx.fill(); ctx.stroke();
    ctx.fillStyle = z.stun > .25 ? '#fff2a1' : '#e6f3b2'; ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.arc(-z.r * .23, -z.r * .8, 2.2, 0, Math.PI * 2);
    ctx.arc(z.r * .23, -z.r * .8, 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0; ctx.strokeStyle = '#313b47'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(-z.r * .3, z.r * 1.4); ctx.lineTo(-z.r * .55, z.r * 2);
    ctx.moveTo(z.r * .3, z.r * 1.4); ctx.lineTo(z.r * .55, z.r * 2); ctx.stroke();
    if (z.hp < z.maxHp) {
      ctx.fillStyle = '#111820'; ctx.fillRect(-z.r, -z.r * 1.65, z.r * 2, 3);
      ctx.fillStyle = '#ed6875'; ctx.fillRect(-z.r, -z.r * 1.65, z.r, 3);
    }
    ctx.restore();
  }

  function drawPlayer() {
    ctx.save(); ctx.translate(player.x, player.y);
    // Keep the hero unmistakable against the dark floor without flattening the atmosphere.
    const playerGlow = ctx.createRadialGradient(0, 0, 4, 0, 0, 38);
    playerGlow.addColorStop(0, 'rgba(167,220,255,.34)');
    playerGlow.addColorStop(.55, 'rgba(109,188,239,.13)');
    playerGlow.addColorStop(1, 'rgba(109,188,239,0)');
    ctx.fillStyle = playerGlow;
    ctx.beginPath(); ctx.arc(0, 0, 38, 0, Math.PI * 2); ctx.fill();
    ctx.shadowColor = 'rgba(172,224,255,.72)';
    ctx.shadowBlur = 11;
    ctx.strokeStyle = '#d3e5f4'; ctx.lineWidth = 5.5; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-4, 8); ctx.lineTo(-8, 19); ctx.moveTo(4, 8); ctx.lineTo(8, 19);
    ctx.moveTo(-7, -1); ctx.lineTo(-13, 8); ctx.moveTo(7, -1); ctx.lineTo(13, 7); ctx.stroke();
    ctx.fillStyle = '#9eb8d3'; ctx.strokeStyle = '#e7f3fc'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.roundRect(-8, -7, 16, 19, 5); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#f0f7fc';
    ctx.beginPath(); ctx.ellipse(0, -13, 7, 9, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.rotate(player.angle);
    // Arms are angled forward to hold the sidearm and flashlight together.
    ctx.strokeStyle = '#aab5c3'; ctx.lineWidth = 4; ctx.beginPath();
    ctx.moveTo(2, -2); ctx.lineTo(10, -8); ctx.moveTo(2, 5); ctx.lineTo(10, 5); ctx.stroke();

    // Flashlight remains mounted below the gun, so the player can illuminate and shoot at once.
    ctx.save(); ctx.translate(7, 6);
    ctx.fillStyle = '#202a35'; ctx.fillRect(0, -3, 20, 6);
    ctx.fillStyle = '#69798a'; ctx.fillRect(4, -4, 8, 8);
    ctx.fillStyle = '#f7e89b'; ctx.shadowColor = '#f7e89b'; ctx.shadowBlur = lightOn ? 13 : 5;
    ctx.fillRect(19, -4, 5, 8); ctx.restore();

    // Sidearm: slide, barrel, grip and a small front sight.
    ctx.save(); ctx.translate(7, -8 - recoil * 2);
    ctx.fillStyle = '#151b24'; ctx.beginPath(); ctx.roundRect(0, -4, 27, 9, 2); ctx.fill();
    ctx.fillStyle = '#475465'; ctx.fillRect(5, -5, 17, 3);
    ctx.fillStyle = '#0d1219'; ctx.fillRect(24, -2, 7, 4);
    ctx.fillStyle = '#293747'; ctx.beginPath(); ctx.moveTo(7, 3); ctx.lineTo(15, 3); ctx.lineTo(13, 14); ctx.lineTo(7, 13); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#8796a8'; ctx.fillRect(5, -6, 3, 2);
    if (muzzleFlash > 0) {
      ctx.globalAlpha = muzzleFlash / .075;
      ctx.fillStyle = '#fff0a3'; ctx.shadowColor = '#ffbd55'; ctx.shadowBlur = 22;
      ctx.beginPath(); ctx.moveTo(31, -3); ctx.lineTo(43, -8); ctx.lineTo(39, 0); ctx.lineTo(44, 6); ctx.lineTo(30, 3); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    ctx.restore();
  }

  function drawLight() {
    ctx.save();
    // Keep the world readable even with the flashlight switched off.
    ctx.fillStyle = 'rgba(0,0,0,.34)'; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'destination-out';
    const glowRadius = lightOn && battery > 0 ? 205 : 112;
    const glow = ctx.createRadialGradient(player.x, player.y, 5, player.x, player.y, glowRadius);
    glow.addColorStop(0, 'rgba(0,0,0,.99)'); glow.addColorStop(.72, 'rgba(0,0,0,.48)'); glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(player.x, player.y, glowRadius, 0, Math.PI * 2); ctx.fill();
    if (lightOn && battery > 0) {
      const a = player.angle, r = 510, spread = .49;
      ctx.beginPath(); ctx.moveTo(player.x, player.y); ctx.arc(player.x, player.y, r, a - spread, a + spread);
      ctx.closePath(); ctx.fillStyle = 'rgba(0,0,0,.98)'; ctx.fill();
      const beam = ctx.createRadialGradient(player.x, player.y, 25, player.x + Math.cos(a) * r * .6, player.y + Math.sin(a) * r * .6, r);
      beam.addColorStop(0, 'rgba(0,0,0,.45)'); beam.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = beam; ctx.beginPath(); ctx.moveTo(player.x, player.y);
      ctx.arc(player.x, player.y, r, a - spread, a + spread); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    if (lightOn && battery > 0) {
      ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = 'rgba(255,244,180,.19)';
      ctx.beginPath(); ctx.moveTo(player.x, player.y);
      ctx.lineTo(player.x + Math.cos(player.angle - .49) * 510, player.y + Math.sin(player.angle - .49) * 510);
      ctx.lineTo(player.x + Math.cos(player.angle + .49) * 510, player.y + Math.sin(player.angle + .49) * 510);
      ctx.closePath(); ctx.fill(); ctx.restore();
    }
  }

  function drawBullets() {
    ctx.save(); ctx.lineCap = 'round';
    bullets.forEach(b => {
      ctx.strokeStyle = 'rgba(255,220,132,.9)'; ctx.lineWidth = 3;
      ctx.shadowColor = '#ffc86b'; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.moveTo(b.prevX, b.prevY); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.fillStyle = '#fff4c4'; ctx.beginPath(); ctx.arc(b.x, b.y, 2, 0, Math.PI * 2); ctx.fill();
    });
    ctx.restore();
  }

  function drawLaserSight() {
    if (!running || paused || !shooting) return;
    const a = player.angle;
    const muzzleX = player.x + Math.cos(a) * 29 - Math.sin(a) * -8;
    const muzzleY = player.y + Math.sin(a) * 29 + Math.cos(a) * -8;
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    ctx.strokeStyle = 'rgba(255,65,77,.62)'; ctx.lineWidth = 1.25;
    ctx.shadowColor = '#ff334c'; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.moveTo(muzzleX, muzzleY); ctx.lineTo(mouse.x, mouse.y); ctx.stroke();
    ctx.fillStyle = '#ff4455'; ctx.beginPath(); ctx.arc(mouse.x, mouse.y, 2.8, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,95,105,.9)'; ctx.lineWidth = 1.2; ctx.shadowBlur = 5;
    ctx.beginPath(); ctx.arc(mouse.x, mouse.y, 9, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(mouse.x - 15, mouse.y); ctx.lineTo(mouse.x - 5, mouse.y);
    ctx.moveTo(mouse.x + 5, mouse.y); ctx.lineTo(mouse.x + 15, mouse.y);
    ctx.moveTo(mouse.x, mouse.y - 15); ctx.lineTo(mouse.x, mouse.y - 5);
    ctx.moveTo(mouse.x, mouse.y + 5); ctx.lineTo(mouse.x, mouse.y + 15);
    ctx.stroke();
    ctx.restore();
  }

  function render() {
    drawFloor();
    batteries.forEach(drawBattery);
    ammoPacks.forEach(drawAmmoPack);
    zombies.forEach(drawZombie);
    particles.forEach(p => {
      ctx.globalAlpha = Math.max(0, p.life / p.max); ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, rand(2, 4), 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    });
    drawLight();

    const v = ctx.createRadialGradient(W / 2, H / 2, H * .2, W / 2, H / 2, H * .8);
    v.addColorStop(0, 'transparent'); v.addColorStop(1, 'rgba(0,0,0,.25)');
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);

    // Draw the player after the darkness pass so the main character never fades into it.
    drawPlayer();
    drawBullets();
    drawLaserSight();
    if (levelTransitionTimer > 0) {
      ctx.fillStyle = '#03060ad9'; ctx.fillRect(0, 0, W, H);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#f3d56b'; ctx.font = '800 46px sans-serif';
      ctx.fillText('LEVEL COMPLETE', W / 2, H / 2 - 28);
      ctx.fillStyle = '#ffffff'; ctx.font = '700 26px sans-serif';
      ctx.fillText(transitionVictory ? 'ALL 5 LEVELS CLEARED!' : `NEXT LEVEL ${transitionToLevel}`, W / 2, H / 2 + 16);
      ctx.fillStyle = '#aab4c2'; ctx.font = '18px sans-serif';
      ctx.fillText(`Starting in ${Math.ceil(levelTransitionTimer)} seconds`, W / 2, H / 2 + 52);
    }
    if (paused) {
      ctx.fillStyle = '#03060ac9'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#f3d56b'; ctx.textAlign = 'center'; ctx.font = '700 36px sans-serif'; ctx.fillText('PAUSED', W / 2, H / 2);
      ctx.fillStyle = '#aab4c2'; ctx.font = '14px sans-serif'; ctx.fillText('Press P or click Resume to continue', W / 2, H / 2 + 30);
    }
  }

  function loop(now) {
    if (!running) return;
    const dt = Math.min(.035, (now - lastTime) / 1000 || 0);
    lastTime = now;
    update(dt); render();
    if (running) requestAnimationFrame(loop);
  }

  function pointerPos(e) {
    const r = canvas.getBoundingClientRect();
    mouse.x = (e.clientX - r.left) / r.width * W;
    mouse.y = (e.clientY - r.top) / r.height * H;
  }

  canvas.addEventListener('pointermove', pointerPos);
  canvas.addEventListener('pointerdown', e => {
    pointerPos(e);
    if (running && !paused && e.button === 0) {
      shooting = true;
      fireWeapon();
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* Pointer capture is optional. */ }
    }
  });
  window.addEventListener('pointerup', () => { shooting = false; });
  window.addEventListener('blur', () => { shooting = false; keys.clear(); });
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  window.addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k) || e.code === 'Space') e.preventDefault();
    keys.add(k);

    // Use KeyboardEvent.code so Space works reliably even when a button has focus
    // or the active keyboard layout changes the reported key value.
    if (e.code === 'Space' && !e.repeat && running && !paused) {
      if (battery <= 0 && !lightOn) {
        $('canvasHint').textContent = 'FLASHLIGHT EMPTY  ·  FIND A BATTERY';
      } else {
        lightOn = !lightOn;
        $('canvasHint').textContent = 'FLASHLIGHT: ' + (lightOn ? 'ON' : 'OFF') + '  ·  CLICK / HOLD TO FIRE';
      }
    }
    if (k === 'r' && !e.repeat && running) startReload();
    if (k === 'p' && !e.repeat && running) togglePause();
  });
  window.addEventListener('keyup', e => { keys.delete(e.key.toLowerCase()); });

  function togglePause() {
    if (!running) return;
    paused = !paused; shooting = false;
    $('pauseBtn').textContent = paused ? '▶  RESUME GAME' : 'Ⅱ  PAUSE GAME';
    $('statusText').textContent = paused ? 'GAME PAUSED' : 'SURVIVAL IN PROGRESS';
    if (!paused) { lastTime = performance.now(); requestAnimationFrame(loop); }
    else { lightOn = false; render(); }
  }

  $('startBtn').addEventListener('click', start);
  $('restartBtn').addEventListener('click', start);
  $('pauseBtn').addEventListener('click', togglePause);
  $('soundBtn').addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    $('soundBtn').style.color = soundEnabled ? '#78e4b2' : '#f3d56b';
    $('soundBtn').title = soundEnabled ? 'Music and sound effects on' : 'Music and sound effects off';
    if (soundEnabled) {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      startAmbience();
      playTone(440, .08);
    } else stopAmbience();
  });

  $('soundBtn').style.color = '#78e4b2';
  $('soundBtn').title = 'Music and sound effects on';

  // Atmospheric title screen before the first game starts.
  player = {x: W * .5, y: H * .52, r: 12, angle: -.25};
  zombies = [
    {x: W * .75, y: H * .35, r: 16, speed: 0, stun: 0, phase: 0, hp: 2, maxHp: 2, hitFlash: 0},
    {x: W * .83, y: H * .68, r: 13, speed: 0, stun: 0, phase: 2, hp: 2, maxHp: 2, hitFlash: 0},
    {x: W * .27, y: H * .3, r: 12, speed: 0, stun: 0, phase: 1, hp: 2, maxHp: 2, hitFlash: 0}
  ];
  batteries = [{x: W * .66, y: H * .68, r: 9, phase: 0}];
  ammoPacks = [{x: W * .38, y: H * .7, r: 11, phase: 1}];
  bullets = []; particles = []; magazine = 12; reserveAmmo = 72;
  mouse = {x: W * .78, y: H * .5};
  drawFloor(); batteries.forEach(drawBattery); ammoPacks.forEach(drawAmmoPack);
  zombies.forEach(drawZombie); drawLight(); drawPlayer();
})();
