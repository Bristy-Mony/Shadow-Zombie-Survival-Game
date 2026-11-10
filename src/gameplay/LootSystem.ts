import * as THREE from 'three';
import { Player } from '../player/Player';
import { Progression } from './Progression';

type LootKind = 'health' | 'coin' | 'battery';
interface Loot { kind: LootKind; object: THREE.Group; value: number; age: number }

export class LootSystem {
  private readonly loot: Loot[] = [];
  private elapsed = 0;
  onPickup?: (kind: LootKind, value: number) => void;

  constructor(private readonly scene: THREE.Scene, private readonly progression: Progression) {}

  spawn(position: THREE.Vector3) {
    const luck = this.progression.effects.scavenger;
    const roll = Math.random();
    const kind: LootKind = roll < (luck ? 0.42 : 0.34) ? 'health' : roll < (luck ? 0.72 : 0.64) ? 'battery' : 'coin';
    this.create(kind, position, kind === 'coin' ? 2 + Math.floor(Math.random() * 4) : kind === 'health' ? 24 : 12);
    if (Math.random() < (luck ? 0.55 : 0.3)) this.create('coin', position.clone().add(new THREE.Vector3(0.55, 0, 0.25)), 1 + Math.floor(Math.random() * 3));
  }

  private create(kind: LootKind, position: THREE.Vector3, value: number) {
    const group = new THREE.Group(); group.position.copy(position).setY(0.65);
    const color = kind === 'health' ? 0x5bff83 : kind === 'coin' ? 0xffcc4d : 0x45e8ff;
    const geometry = kind === 'coin' ? new THREE.CylinderGeometry(0.25, 0.25, 0.09, 16) : kind === 'health' ? new THREE.BoxGeometry(0.48, 0.48, 0.22) : new THREE.CylinderGeometry(0.17, 0.17, 0.55, 10);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.5, metalness: kind === 'coin' ? 0.75 : 0.2, roughness: 0.3 }));
    if (kind === 'coin') mesh.rotation.x = Math.PI / 2;
    group.add(mesh, new THREE.PointLight(color, 1.3, 4)); this.scene.add(group); this.loot.push({ kind, object: group, value, age: 0 });
  }

  update(dt: number, player: Player, active: boolean) {
    if (!active) return; this.elapsed += dt;
    for (let index = this.loot.length - 1; index >= 0; index--) {
      const item = this.loot[index]; item.age += dt;
      item.object.rotation.y += dt * 2.4; item.object.position.y = 0.65 + Math.sin(this.elapsed * 3 + index) * 0.12;
      if (item.object.position.distanceTo(player.object.position) < 1.45) {
        if (item.kind === 'health') player.heal(item.value);
        else if (item.kind === 'battery') player.addEnergy(item.value);
        else this.progression.addCoins(item.value);
        this.onPickup?.(item.kind, item.value); this.scene.remove(item.object); this.loot.splice(index, 1);
      } else if (item.age > 45) { this.scene.remove(item.object); this.loot.splice(index, 1); }
    }
  }
}
