import * as THREE from 'three';
import { Player } from '../player/Player';
import { Progression } from './Progression';

type LootKind = 'health' | 'coin' | 'battery';
interface Loot { kind: LootKind; object: THREE.Group; value: number; age: number; active: boolean }

const POOL_SIZE: Record<LootKind, number> = { coin: 16, battery: 10, health: 10 };

export class LootSystem {
  private readonly loot: Loot[] = [];
  private readonly free: Record<LootKind, Loot[]> = { health: [], coin: [], battery: [] };
  private elapsed = 0;
  onPickup?: (kind: LootKind, value: number) => void;

  constructor(private readonly scene: THREE.Scene, private readonly progression: Progression) {
    const geometries: Record<LootKind, THREE.BufferGeometry> = {
      coin: new THREE.CylinderGeometry(0.25, 0.25, 0.09, 12),
      health: new THREE.BoxGeometry(0.48, 0.48, 0.22),
      battery: new THREE.CylinderGeometry(0.17, 0.17, 0.55, 8),
    };
    const colors: Record<LootKind, number> = { health: 0x5bff83, coin: 0xffcc4d, battery: 0x45e8ff };
    const materials = Object.fromEntries((Object.keys(colors) as LootKind[]).map((kind) => [kind, new THREE.MeshStandardMaterial({
      color: colors[kind], emissive: colors[kind], emissiveIntensity: 1.65,
      metalness: kind === 'coin' ? 0.75 : 0.2, roughness: 0.3,
    })])) as Record<LootKind, THREE.MeshStandardMaterial>;

    for (const kind of Object.keys(POOL_SIZE) as LootKind[]) {
      for (let index = 0; index < POOL_SIZE[kind]; index++) {
        const object = new THREE.Group(); const mesh = new THREE.Mesh(geometries[kind], materials[kind]);
        if (kind === 'coin') mesh.rotation.x = Math.PI / 2;
        object.add(mesh); object.visible = false; this.scene.add(object);
        const item: Loot = { kind, object, value: 0, age: 0, active: false };
        this.loot.push(item); this.free[kind].push(item);
      }
    }
  }

  spawn(position: THREE.Vector3) {
    const luck = this.progression.effects.scavenger;
    const roll = Math.random();
    const kind: LootKind = roll < (luck ? 0.42 : 0.34) ? 'health' : roll < (luck ? 0.72 : 0.64) ? 'battery' : 'coin';
    this.activate(kind, position.x, position.z, kind === 'coin' ? 2 + Math.floor(Math.random() * 4) : kind === 'health' ? 24 : 12);
    if (Math.random() < (luck ? 0.55 : 0.3)) this.activate('coin', position.x + 0.55, position.z + 0.25, 1 + Math.floor(Math.random() * 3));
  }

  private activate(kind: LootKind, x: number, z: number, value: number) {
    const item = this.free[kind].pop() ?? this.loot.find((candidate) => candidate.kind === kind && candidate.active);
    if (!item) return;
    item.active = true; item.value = value; item.age = 0;
    item.object.position.set(x, 0.65, z); item.object.rotation.set(0, 0, 0); item.object.visible = true;
  }

  private release(item: Loot) {
    if (!item.active) return;
    item.active = false; item.object.visible = false; this.free[item.kind].push(item);
  }

  update(dt: number, player: Player, active: boolean) {
    if (!active) return; this.elapsed += dt;
    for (let index = 0; index < this.loot.length; index++) {
      const item = this.loot[index]; if (!item.active) continue; item.age += dt;
      item.object.rotation.y += dt * 2.4; item.object.position.y = 0.65 + Math.sin(this.elapsed * 3 + index) * 0.12;
      if (item.object.position.distanceToSquared(player.object.position) < 2.1025) {
        if (item.kind === 'health') player.heal(item.value);
        else if (item.kind === 'battery') player.addEnergy(item.value);
        else this.progression.addCoins(item.value);
        const { kind, value } = item; this.release(item); this.onPickup?.(kind, value);
      } else if (item.age > 45) this.release(item);
    }
  }
}
