import * as THREE from 'three';

export interface Collider { box: THREE.Box3; name: string }

export class CollisionSystem {
  readonly colliders: Collider[] = [];
  private readonly cameraRay = new THREE.Ray();
  private readonly cameraDirection = new THREE.Vector3();
  private readonly cameraHit = new THREE.Vector3();

  add(center: THREE.Vector3, size: THREE.Vector3, name = 'obstacle') {
    const half = size.clone().multiplyScalar(0.5);
    const collider = { box: new THREE.Box3(center.clone().sub(half), center.clone().add(half)), name };
    this.colliders.push(collider);
    return collider;
  }

  remove(collider: Collider) {
    const index = this.colliders.indexOf(collider);
    if (index >= 0) this.colliders.splice(index, 1);
  }

  constrainCamera(target: THREE.Vector3, desired: THREE.Vector3, padding = 0.32) {
    this.cameraDirection.copy(desired).sub(target);
    const maxDistance = this.cameraDirection.length();
    if (maxDistance < 0.01) return desired;
    this.cameraDirection.normalize();
    this.cameraRay.set(target, this.cameraDirection);
    let nearest = maxDistance;
    for (const collider of this.colliders) {
      const expanded = collider.box.clone().expandByScalar(padding);
      const hit = this.cameraRay.intersectBox(expanded, this.cameraHit);
      if (hit) {
        const distance = target.distanceTo(hit);
        if (distance > 0.2 && distance < nearest) nearest = distance;
      }
    }
    if (nearest < maxDistance) desired.copy(target).addScaledVector(this.cameraDirection, Math.max(0.8, nearest - padding));
    return desired;
  }

  resolve(position: THREE.Vector3, previous: THREE.Vector3, radius: number) {
    for (const collider of this.colliders) {
      const nearestX = THREE.MathUtils.clamp(position.x, collider.box.min.x, collider.box.max.x);
      const nearestZ = THREE.MathUtils.clamp(position.z, collider.box.min.z, collider.box.max.z);
      const dx = position.x - nearestX;
      const dz = position.z - nearestZ;
      if (dx * dx + dz * dz < radius * radius && position.y < collider.box.max.y + 1) {
        const testX = new THREE.Vector3(position.x, position.y, previous.z);
        const nx = THREE.MathUtils.clamp(testX.x, collider.box.min.x, collider.box.max.x);
        const nz = THREE.MathUtils.clamp(testX.z, collider.box.min.z, collider.box.max.z);
        if ((testX.x - nx) ** 2 + (testX.z - nz) ** 2 >= radius * radius) position.z = previous.z;
        else position.x = previous.x;
        if (Math.abs(position.x - previous.x) < 0.001 && Math.abs(position.z - previous.z) < 0.001) position.copy(previous);
      }
    }
    position.x = THREE.MathUtils.clamp(position.x, -39, 39);
    position.z = THREE.MathUtils.clamp(position.z, -43, 39);
  }
}
