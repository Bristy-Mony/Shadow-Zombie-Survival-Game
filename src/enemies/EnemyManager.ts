import * as THREE from 'three';
import { CONFIG } from '../config';
import { CollisionSystem } from '../world/CollisionSystem';
import { LightExposureSystem } from '../lighting/LightExposureSystem';
import { Player } from '../player/Player';
import { Zombie } from './Zombie';

export class EnemyManager {
  readonly zombies: Zombie[] = [];
  private shadowWarnings = new Set<number>();
  onShadowWarning?: () => void;
  onPlayerHit?: () => void;
  onZombieKilled?: (zombie: Zombie, headshot: boolean) => void;
  private lastHealth = 100;

  constructor(private readonly scene: THREE.Scene, spawnPoints: THREE.Vector3[], private readonly triggers: THREE.Vector3[], exposure: LightExposureSystem, collision: CollisionSystem) {
    spawnPoints.slice(0, CONFIG.enemy.population).forEach((point, index) => {
      const zombie = new Zombie(false, point.clone(), exposure, collision, index % 3); zombie.onDied = (dead, headshot) => this.onZombieKilled?.(dead, headshot); scene.add(zombie.object); this.zombies.push(zombie);
    });
    triggers.forEach((point) => { const zombie = new Zombie(true, point.clone(), exposure, collision, 3); zombie.onDied = (dead, headshot) => this.onZombieKilled?.(dead, headshot); scene.add(zombie.object); this.zombies.push(zombie); });
  }

  update(dt: number, player: Player, active: boolean) {
    this.triggers.forEach((point, index) => {
      const zombie = this.zombies[CONFIG.enemy.population + index];
      const distance = player.object.position.distanceTo(point);
      if (!zombie.object.visible && distance < 10 && !this.shadowWarnings.has(index)) {
        this.shadowWarnings.add(index); this.onShadowWarning?.();
        window.setTimeout(() => zombie.emerge(), 1100);
      }
    });
    this.zombies.forEach((zombie) => zombie.update(dt, player, active));
    if (player.health < this.lastHealth) this.onPlayerHit?.(); this.lastHealth = player.health;
  }

  get stunnedTotal() { return this.zombies.reduce((sum, z) => sum + z.stunnedCount, 0); }
  get alive() { return this.zombies.filter((zombie) => zombie.alive && zombie.object.visible); }
}
