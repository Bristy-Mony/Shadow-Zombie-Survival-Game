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

  exposureAt(position: THREE.Vector3) {
    let exposure = 0.025;
    for (const light of this.lights) {
      if (!light.enabled) continue;
      const distance = light.position.distanceTo(position);
      if (distance < light.radius) exposure += light.strength * (1 - distance / light.radius) ** 1.4;
    }
    if (this.flashlight?.enabled) {
      const offset = position.clone().sub(this.flashlight.position);
      const distance = offset.length();
      if (distance < this.flashlight.radius && distance > 0.01) {
        const angle = offset.normalize().angleTo(this.flashlightDirection);
        if (angle < this.flashlightAngle) {
          const focus = 1 - angle / this.flashlightAngle;
          exposure += this.flashlight.strength * focus * focus * (1 - distance / this.flashlight.radius);
        }
      }
    }
    return THREE.MathUtils.clamp(exposure, 0, 1);
  }

  inSafeZone(position: THREE.Vector3) {
    return this.lights.some((light) => light.enabled && light.safe && light.position.distanceTo(position) < light.radius * 0.66);
  }
}
