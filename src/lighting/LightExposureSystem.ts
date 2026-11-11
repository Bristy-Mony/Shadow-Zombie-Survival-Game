import * as THREE from 'three';

export interface GameplayLight {
  id: string;
  position: THREE.Vector3;
  radius: number;
  strength: number;
  enabled: boolean;
  safe?: boolean;
}

export class LightExposureSystem {
  readonly lights: GameplayLight[] = [];
  flashlight?: GameplayLight;
  flashlightDirection = new THREE.Vector3(0, 0, -1);
  flashlightAngle = Math.PI / 7;
  private readonly flashlightOffset = new THREE.Vector3();

  flashlightFocusAt(position: THREE.Vector3) {
    if (!this.flashlight?.enabled) return 0;
    this.flashlightOffset.copy(position).sub(this.flashlight.position);
    const distance = this.flashlightOffset.length();
    if (distance >= this.flashlight.radius || distance <= 0.01) return 0;
    const angle = this.flashlightOffset.normalize().angleTo(this.flashlightDirection);
    if (angle >= this.flashlightAngle) return 0;
    const focus = 1 - angle / this.flashlightAngle;
    return focus * focus * (1 - distance / this.flashlight.radius);
  }

  exposureAt(position: THREE.Vector3) {
    let exposure = 0.025;
    for (const light of this.lights) {
      if (!light.enabled) continue;
      const distance = light.position.distanceTo(position);
      if (distance < light.radius) exposure += light.strength * (1 - distance / light.radius) ** 1.4;
    }
    exposure += (this.flashlight?.strength ?? 0) * this.flashlightFocusAt(position);
    return THREE.MathUtils.clamp(exposure, 0, 1);
  }

  inSafeZone(position: THREE.Vector3) {
    return this.lights.some((light) => light.enabled && light.safe && light.position.distanceTo(position) < light.radius * 0.66);
  }
}
