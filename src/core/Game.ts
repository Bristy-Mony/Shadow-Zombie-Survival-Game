import * as THREE from 'three';
import { CONFIG, COLORS } from '../config';
import { GameState } from './GameState';
import { InputManager } from './InputManager';
import { World, Interactable } from '../world/World';
import { LightExposureSystem } from '../lighting/LightExposureSystem';
import { Player } from '../player/Player';
import { EnemyManager } from '../enemies/EnemyManager';
import { ObjectiveManager } from '../gameplay/ObjectiveManager';
import { AudioManager } from '../audio/AudioManager';
import { UI } from '../ui/UI';
import { Progression, UpgradeId } from '../gameplay/Progression';
import { LootSystem } from '../gameplay/LootSystem';

interface ShotEffect {
  line: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  positions: THREE.BufferAttribute;
  life: number;
  active: boolean;
}

export class Game {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 140);
  private readonly renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  private readonly clock = new THREE.Clock();
  private readonly exposure = new LightExposureSystem();
  private readonly progression = new Progression();
  private readonly ui = new UI();
  private readonly input: InputManager;
  private readonly world: World;
  private readonly player: Player;
  private readonly enemies: EnemyManager;
  private readonly loot: LootSystem;
  private readonly objectives = new ObjectiveManager();
  private readonly audio = new AudioManager();
  private state = GameState.MENU;
  private raf = 0;
  private playTime = 0;
  private lastFlashlightState = true;
  private nearby?: Interactable;
  private readonly raycaster = new THREE.Raycaster();
  private readonly shotOrigin = new THREE.Vector3();
  private readonly shotDirection = new THREE.Vector3();
  private readonly hitCenter = new THREE.Vector3();
  private readonly hitOffset = new THREE.Vector3();
  private readonly shotStart = new THREE.Vector3();
  private readonly shotEnd = new THREE.Vector3();
  private readonly aimCenter = new THREE.Vector2();
  private readonly interactPosition = new THREE.Vector3();
  private readonly shotEffects: ShotEffect[] = [];
  private shotCursor = 0;
  private hudElapsed = 1;
  private zombieVoiceTimer = 4;
  private vehicleMode: 'FOOT' | 'ENTERING' | 'DRIVING' | 'EXITING' = 'FOOT';
  onRestartRequested?: (startImmediately: boolean) => void;

  constructor() {
    this.scene.background = new THREE.Color(COLORS.night);
    this.scene.fog = new THREE.FogExp2(COLORS.fog, CONFIG.world.fogDensity);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = false;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.28;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.ui.canvasHost.appendChild(this.renderer.domElement);
    this.input = new InputManager(this.renderer.domElement);
    this.input.onUnlock = () => { if (this.state === GameState.PLAYING) this.pause(); };
    this.setupBaseLights();
    this.buildShotPool();
    this.world = new World(this.scene, this.exposure);
    this.player = new Player(this.scene, this.camera, this.world.collisions, this.exposure, this.progression);
    this.enemies = new EnemyManager(this.scene, this.world.spawnPoints, this.world.shadowTriggers, this.exposure, this.world.collisions);
    this.loot = new LootSystem(this.scene, this.progression);
    this.bindEvents();
    this.ui.setState(this.state);
    this.ui.updateProgression(this.progression);
    window.addEventListener('resize', this.resize);
    this.raf = requestAnimationFrame(this.loop);
  }

  private setupBaseLights() {
    const hemi = new THREE.HemisphereLight(0x7296b8, 0x171510, 1.28); this.scene.add(hemi);
    const moon = new THREE.DirectionalLight(COLORS.moon, 2.7); moon.position.set(-22, 38, 18);
    this.scene.add(moon);
  }

  private buildShotPool() {
    for (let index = 0; index < 8; index++) {
      const geometry = new THREE.BufferGeometry();
      const positions = new THREE.BufferAttribute(new Float32Array(6), 3);
      positions.setUsage(THREE.DynamicDrawUsage); geometry.setAttribute('position', positions);
      const material = new THREE.LineBasicMaterial({ color: 0x38eaff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
      const line = new THREE.Line(geometry, material); line.visible = false; line.frustumCulled = false; this.scene.add(line);
      this.shotEffects.push({ line, positions, life: 0, active: false });
    }
  }

  private bindEvents() {
    this.ui.onStart = () => this.start();
    this.ui.onResume = () => this.resume();
    this.ui.onRestart = () => this.onRestartRequested?.(true);
    this.ui.onMenu = () => this.onRestartRequested?.(false);
    this.ui.onPurchase = (id: UpgradeId) => {
      if (this.progression.purchase(id)) { this.player.applyUpgrades(); this.audio.pickup(); }
      this.ui.updateProgression(this.progression);
    };
    this.objectives.onUpdate = (title, detail) => this.ui.notify(title, detail);
    this.enemies.onShadowWarning = () => { this.audio.warning(); this.ui.notify('SOMETHING STIRS', 'Keep your light trained on the darkness'); };
    this.enemies.onPlayerHit = () => { this.ui.damageFlash(); this.audio.zombieAttack(); };
    this.enemies.onZombieKilled = (zombie, headshot) => {
      this.loot.spawn(zombie.object.position); this.audio.zombieDie();
      if (zombie.object.userData.campaignWave && this.objectives.recordKill()) {
        this.world.showExtractionRelay();
        this.ui.showChapter(3, 'BLACKOUT RELAY', 'Activate the relay and open the final gate');
        this.ui.notify('LEVEL 3 UNLOCKED', 'Follow the blue road lights to the extraction relay');
      }
      if (headshot) this.ui.notify('HEADSHOT', 'Infected neutralized');
    };
    this.loot.onPickup = (kind, value) => {
      this.audio.pickup(); this.ui.updateCoinBalance(this.progression);
      const label = kind === 'coin' ? `${value} coin${value === 1 ? '' : 's'}` : kind === 'battery' ? `${value} laser cells` : `${value} health`;
      this.ui.notify('LOOT RECOVERED', `+${label}`);
    };
  }

  private start() {
    this.state = GameState.PLAYING; this.ui.setState(this.state); this.audio.resume(); this.renderer.domElement.requestPointerLock?.();
    this.ui.showTutorial(); this.ui.showChapter(1, 'BLACK START', 'Find 3 fuses · restore power · open the checkpoint'); this.ui.notify('LEVEL 1 · BLACK START', 'Find 3 power fuses and restore the district generator');
  }
  begin() { this.start(); }
  private resume() { this.state = GameState.PLAYING; this.ui.setState(this.state); this.clock.getDelta(); this.renderer.domElement.requestPointerLock?.(); }
  private pause() { if (this.state !== GameState.PLAYING) return; this.state = GameState.PAUSED; document.exitPointerLock?.(); this.input.clear(); this.ui.setState(this.state); }

  private interact(item: Interactable) {
    if (!item.active) return;
    if (item.kind === 'fuse') { item.active = false; item.object.visible = false; this.objectives.collectFuse(); this.audio.pickup(); }
    else if (item.kind === 'battery') { item.active = false; item.object.visible = false; this.player.addEnergy(15); this.player.battery = Math.min(100, this.player.battery + 12); this.audio.pickup(); this.ui.notify('ENERGY CELL RECOVERED', '+15 laser cells · +12 flashlight charge'); }
    else if (item.kind === 'medkit') { item.active = false; item.object.visible = false; this.player.heal(35); this.audio.pickup(); this.ui.notify('MEDICAL SUPPLIES', '+35 health'); }
    else if (item.kind === 'breaker') {
      item.onInteract?.(); item.active = false; this.audio.power(); this.ui.notify('GARAGE FLOOD LIGHT ONLINE', 'A temporary safe zone is active');
    }
    else if (item.kind === 'generator') {
      if (this.objectives.stage !== 'GENERATOR') { this.ui.notify('GENERATOR OFFLINE', this.objectives.fuses < 3 ? `Requires ${3 - this.objectives.fuses} more power fuse${3 - this.objectives.fuses === 1 ? '' : 's'}` : 'No response'); return; }
      item.active = false; this.world.activatePower(); this.objectives.restorePower(); this.audio.power(); this.audio.startHum();
    } else if (item.kind === 'gate') {
      if (this.objectives.stage !== 'GATE_ONE') { this.ui.notify('GATE OFFLINE', 'Restore district power first'); return; }
      this.world.openGate(); item.active = false; this.audio.power(); this.startLevelTwo();
    } else if (item.kind === 'relay') {
      if (this.objectives.stage !== 'RELAY') return;
      this.world.activateExtractionRelay(); this.objectives.activateRelay(); this.audio.power(); this.ui.notify('FINAL GATE OPENING', 'Continue down the extraction road');
    } else if (item.kind === 'car') {
      if (this.objectives.stage !== 'CAR') return;
      this.vehicleMode = 'ENTERING'; item.active = false; this.player.beginVehicleEntry(); this.audio.power();
    }
  }

  private fireLaser() {
    if (!this.player.fire()) return;
    this.audio.fire(); this.raycaster.setFromCamera(this.aimCenter, this.camera); this.raycaster.far = 52;
    this.shotOrigin.copy(this.raycaster.ray.origin); this.shotDirection.copy(this.raycaster.ray.direction);
    this.shotEnd.copy(this.shotOrigin).addScaledVector(this.shotDirection, 52);
    let confirmed = false; let headshot = false; let nearest = 52; let target: (typeof this.enemies.alive)[number] | undefined;
    // Animated skinned-mesh triangle raycasts caused a visible first-shot stall. These
    // compact head/body hit volumes are stable, fast, and feel more consistent in play.
    for (const zombie of this.enemies.alive) {
      let candidateHeadshot = false; let candidateDistance = Number.POSITIVE_INFINITY;
      for (const volume of [{ y: 2.28, radius: 0.38, head: true }, { y: 1.28, radius: 0.72, head: false }]) {
        this.hitCenter.copy(zombie.object.position); this.hitCenter.y += volume.y;
        this.hitOffset.copy(this.hitCenter).sub(this.shotOrigin);
        const alongRay = this.hitOffset.dot(this.shotDirection);
        if (alongRay <= 0 || alongRay >= nearest) continue;
        const distanceSq = this.hitOffset.lengthSq() - alongRay * alongRay;
        if (distanceSq <= volume.radius * volume.radius && alongRay < candidateDistance) {
          candidateDistance = alongRay; candidateHeadshot = volume.head;
        }
      }
      if (candidateDistance < nearest) { nearest = candidateDistance; target = zombie; headshot = candidateHeadshot; }
    }
    if (target) {
      this.shotEnd.copy(this.shotOrigin).addScaledVector(this.shotDirection, nearest);
      target.takeDamage(this.player.laserDamage, headshot); confirmed = true; this.audio.impact();
    }
    this.player.getMuzzleWorld(this.shotStart);
    const effect = this.shotEffects[this.shotCursor]; this.shotCursor = (this.shotCursor + 1) % this.shotEffects.length;
    effect.positions.setXYZ(0, this.shotStart.x, this.shotStart.y, this.shotStart.z);
    effect.positions.setXYZ(1, this.shotEnd.x, this.shotEnd.y, this.shotEnd.z); effect.positions.needsUpdate = true;
    effect.line.material.color.setHex(headshot ? 0xffd34f : 0x38eaff); effect.line.material.opacity = 0.95;
    effect.life = 0.085; effect.active = true; effect.line.visible = true;
    this.ui.shotFeedback(confirmed, headshot);
  }

  private updateShotEffects(dt: number) {
    for (const effect of this.shotEffects) {
      if (!effect.active) continue;
      effect.life -= dt; effect.line.material.opacity = Math.max(0, effect.life / 0.085);
      if (effect.life <= 0) { effect.active = false; effect.line.visible = false; }
    }
  }

  private updateInteraction() {
    this.nearby = undefined; let nearest = 3.05;
    for (const item of this.world.interactables) {
      if (!item.active) continue; const distance = this.player.object.position.distanceTo(item.object.getWorldPosition(this.interactPosition));
      if (distance < nearest) { nearest = distance; this.nearby = item; }
    }
    if (this.nearby) {
      let prompt = this.nearby.prompt;
      if (this.nearby.kind === 'generator' && this.objectives.fuses < 3) prompt = `[E] Generator — ${this.objectives.fuses}/3 Fuses`;
      this.ui.showPrompt(prompt); if (this.input.consume('KeyE')) this.interact(this.nearby);
    } else this.ui.showPrompt();
  }

  private update(dt: number) {
    const active = this.state === GameState.PLAYING;
    if (this.input.consume('Escape')) { if (active) this.pause(); else if (this.state === GameState.PAUSED) this.resume(); }
    const onFoot = active && this.vehicleMode === 'FOOT';
    if (this.vehicleMode === 'FOOT') this.player.update(dt, this.input, onFoot);
    this.world.update(active ? dt : 0);
    this.enemies.update(dt, this.player, onFoot);
    this.loot.update(dt, this.player, onFoot); this.updateShotEffects(dt);
    if (!active) return;
    if (this.vehicleMode === 'ENTERING') {
      if (this.player.updateVehicleEntry(dt, this.world.escapeCar)) {
        this.vehicleMode = 'DRIVING'; this.world.beginDriving(); this.objectives.enterVehicle();
      }
      this.audio.updateThreat(Number.POSITIVE_INFINITY, dt, true); this.updateHud(dt, 1); return;
    }
    if (this.vehicleMode === 'DRIVING') {
      const steering = Number(this.input.down('KeyD')) - Number(this.input.down('KeyA'));
      const distance = this.world.driveEscapeVehicle(dt, this.input.down('KeyW'), steering);
      this.objectives.setDriveDistance(distance); this.player.followVehicle(dt, this.world.escapeCar); this.audio.updateThreat(Number.POSITIVE_INFINITY, dt, true);
      this.updateHud(dt, 1);
      if (distance >= this.objectives.driveTarget) {
        this.vehicleMode = 'EXITING'; this.player.beginVehicleExit(this.world.escapeCar); this.ui.notify('SAFE ZONE REACHED', 'Leaving the extraction vehicle');
      }
      return;
    }
    if (this.vehicleMode === 'EXITING') {
      if (this.player.updateVehicleExit(dt, this.world.escapeCar)) {
        this.objectives.escape(); this.state = GameState.VICTORY; document.exitPointerLock?.(); this.ui.setVictoryStats(this.playTime, this.player, this.enemies.stunnedTotal); this.ui.setState(this.state);
      }
      this.audio.updateThreat(Number.POSITIVE_INFINITY, dt, true); this.updateHud(dt, 1); return;
    }
    if (this.input.down('Mouse0') || this.input.consume('Mouse0')) this.fireLaser();
    this.zombieVoiceTimer -= dt;
    if (this.zombieVoiceTimer <= 0) {
      const near = this.enemies.alive.some((zombie) => zombie.object.position.distanceTo(this.player.object.position) < 13);
      if (near) this.audio.zombieNear(); this.zombieVoiceTimer = near ? 4 + Math.random() * 4 : 2;
    }
    this.playTime += dt;
    if (this.exposure.inSafeZone(this.player.object.position)) this.player.health = Math.min(100, this.player.health + dt * 1.8);
    this.updateInteraction();
    const playerExposure = this.exposure.exposureAt(this.player.object.position);
    const nearestZombie = this.enemies.alive.reduce((nearest, zombie) => Math.min(nearest, zombie.object.position.distanceTo(this.player.object.position)), Number.POSITIVE_INFINITY);
    this.audio.updateThreat(nearestZombie, dt);
    this.updateHud(dt, playerExposure);
    if (this.lastFlashlightState !== this.player.flashlightOn) { this.audio.flashlight(); this.lastFlashlightState = this.player.flashlightOn; }
    if (this.player.health <= 0) { this.state = GameState.GAME_OVER; document.exitPointerLock?.(); this.ui.setState(this.state); }
    if (this.objectives.stage === 'GATE_ONE' && !this.world.interactables.find((item) => item.kind === 'gate')!.active) this.startLevelTwo();
    if (this.objectives.stage === 'FINAL_GATE' && this.player.object.position.z < -85) {
      this.objectives.reachVehicle(); this.world.showEscapeVehicle(); this.ui.showChapter(4, 'EXTRACTION', 'Enter the armored vehicle and drive to safety'); this.ui.notify('EXTRACTION VEHICLE LOCATED', 'Approach the driver door and press E');
    }
  }

  private updateHud(dt: number, exposure: number) {
    this.hudElapsed += dt;
    if (this.hudElapsed < 1 / 30) return;
    this.hudElapsed = 0; this.ui.update(this.player, this.objectives, exposure);
  }

  private startLevelTwo() {
    if (this.objectives.stage !== 'GATE_ONE') return;
    const waveSize = this.enemies.spawnWave([
      new THREE.Vector3(-4.8, 0, -51), new THREE.Vector3(4.6, 0, -55), new THREE.Vector3(0.5, 0, -60),
    ]);
    this.objectives.beginPurge(waveSize);
    this.ui.showChapter(2, 'CONTAINMENT', 'Eliminate the infected wave blocking the road');
    this.ui.notify('LEVEL 2 · CONTAINMENT', 'Checkpoint breached · eliminate all marked infected');
  }

  private loop = () => {
    const dt = Math.min(this.clock.getDelta(), 0.05); this.update(dt); this.renderer.render(this.scene, this.camera); this.raf = requestAnimationFrame(this.loop);
  };
  private resize = () => { this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix(); this.renderer.setSize(innerWidth, innerHeight); };
  destroy() {
    cancelAnimationFrame(this.raf); this.input.destroy(); this.audio.destroy(); window.removeEventListener('resize', this.resize);
    for (const effect of this.shotEffects) { effect.line.geometry.dispose(); effect.line.material.dispose(); }
    this.renderer.dispose();
  }
}
