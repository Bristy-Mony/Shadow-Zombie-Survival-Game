import * as THREE from 'three';
import { CONFIG, COLORS } from '../config';
import { InputManager } from '../core/InputManager';
import { CollisionSystem } from '../world/CollisionSystem';
import { LightExposureSystem } from '../lighting/LightExposureSystem';
import { CharacterAssets, crossFadeAction } from '../assets/CharacterAssets';
import { Progression } from '../gameplay/Progression';

export class Player {
  readonly object = new THREE.Group();
  readonly cameraTarget = new THREE.Vector3();
  health = 100;
  maxHealth = 100;
  stamina = 100;
  battery = 100;
  energy: number;
  maxEnergy = 36;
  laserDamage = 34;
  fireCooldown = 0.3;
  flashlightOn = true;
  moving = false;
  sprinting = false;
  yaw = Math.PI;
  pitch = -0.12;
  invulnerability = 0;
  private animationTime = 0;
  private leftArm!: THREE.Group;
  private rightArm!: THREE.Group;
  private leftLeg!: THREE.Group;
  private rightLeg!: THREE.Group;
  private flashlight!: THREE.SpotLight;
  private flashlightTarget = new THREE.Object3D();
  private beam!: THREE.Mesh;
  private outerBeam!: THREE.Mesh;
  private fallbackModel = new THREE.Group();
  private mixer?: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  private currentAction?: THREE.AnimationAction;
  private previous = new THREE.Vector3();
  private torch = new THREE.Group();
  private weapon?: THREE.Object3D;
  private muzzle = new THREE.Object3D();
  private shootCooldown = 0;
  private vehicleEntryStart = new THREE.Vector3();
  private vehicleEntryTime = 0;
  private vehicleExitTime = 0;

  constructor(scene: THREE.Scene, private readonly camera: THREE.PerspectiveCamera, private readonly collision: CollisionSystem, private readonly exposure: LightExposureSystem, private readonly progression: Progression) {
    const effects = progression.effects;
    this.maxHealth = effects.maxHealth; this.health = this.maxHealth;
    this.maxEnergy = effects.maxEnergy; this.energy = this.maxEnergy;
    this.laserDamage = effects.damage; this.fireCooldown = effects.fireCooldown;
    this.object.position.set(0, 0, 34);
    scene.add(this.object);
    this.object.add(this.fallbackModel);
    this.buildModel();
    this.buildFlashlight(scene);
    this.buildEquipment();
    void this.loadAnimatedCharacter();
  }

  private buildEquipment() {
    const dark = new THREE.MeshStandardMaterial({ color: 0x161c22, metalness: 0.76, roughness: 0.28 });
    const cyan = new THREE.MeshStandardMaterial({ color: 0x2c9dac, emissive: 0x19d9ff, emissiveIntensity: 2.4, metalness: 0.5, roughness: 0.2 });
    const torchBody = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.095, 0.36, 12), dark); torchBody.rotation.x = Math.PI / 2; torchBody.castShadow = true; this.torch.add(torchBody);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.115, 0.07, 12), cyan); lens.rotation.x = Math.PI / 2; lens.position.z = -0.205; this.torch.add(lens);
    this.torch.visible = false;
  }

  private limb(color: number, length: number, radius: number) {
    const pivot = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 5, 8), new THREE.MeshStandardMaterial({ color, roughness: 0.82 }));
    mesh.position.y = -length * 0.45; mesh.castShadow = true; pivot.add(mesh); return pivot;
  }

  private buildModel() {
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.25, 0.5), new THREE.MeshStandardMaterial({ color: 0x384d5b, roughness: 0.8 }));
    torso.position.y = 1.75; torso.castShadow = true; this.fallbackModel.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.33, 12, 10), new THREE.MeshStandardMaterial({ color: 0xc1a184, roughness: 0.9 }));
    head.position.y = 2.65; head.castShadow = true; this.fallbackModel.add(head);
    this.leftArm = this.limb(0x334550, 0.8, 0.13); this.leftArm.position.set(-0.58, 2.2, 0); this.fallbackModel.add(this.leftArm);
    this.rightArm = this.limb(0x334550, 0.8, 0.13); this.rightArm.position.set(0.58, 2.2, 0); this.rightArm.rotation.x = -0.55; this.fallbackModel.add(this.rightArm);
    this.leftLeg = this.limb(0x242d35, 0.9, 0.16); this.leftLeg.position.set(-0.24, 1.1, 0); this.fallbackModel.add(this.leftLeg);
    this.rightLeg = this.limb(0x242d35, 0.9, 0.16); this.rightLeg.position.set(0.24, 1.1, 0); this.fallbackModel.add(this.rightLeg);
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.8, 0.25), new THREE.MeshStandardMaterial({ color: 0x252c2d }));
    pack.position.set(0, 1.85, 0.36); this.fallbackModel.add(pack);
  }

  private async loadAnimatedCharacter() {
    try {
      const character = await CharacterAssets.create({ role: 'player', height: 2.68 });
      this.object.add(character.root);
      this.mixer = character.mixer;
      this.actions = character.actions;
      this.currentAction = crossFadeAction(this.actions, undefined, this.actions.has('Idle_Gun') ? 'Idle_Gun' : 'Idle', 0);
      this.bindEquipmentToRig(character.root);
      this.fallbackModel.visible = false;
    } catch (error) {
      console.warn('Animated character could not load; using procedural fallback.', error);
    }
  }

  private bindEquipmentToRig(characterRoot: THREE.Group) {
    const rifle = characterRoot.getObjectByName('Rifle');
    if (rifle) {
      rifle.visible = true; this.weapon = rifle;
      this.object.updateMatrixWorld(true);
      const rifleMesh = rifle as THREE.Mesh;
      if (rifleMesh.isMesh) {
        rifleMesh.geometry.computeBoundingBox();
        const bounds = rifleMesh.geometry.boundingBox;
        if (bounds) {
          const size = bounds.getSize(new THREE.Vector3()); const center = bounds.getCenter(new THREE.Vector3());
          const axis: 'x' | 'y' | 'z' = size.x > size.y && size.x > size.z ? 'x' : size.y > size.z ? 'y' : 'z';
          const start = center.clone(); const end = center.clone(); start[axis] = bounds.min[axis]; end[axis] = bounds.max[axis];
          const torso = this.object.localToWorld(new THREE.Vector3(0, 1.55, 0));
          const startDistance = rifle.localToWorld(start.clone()).distanceTo(torso); const endDistance = rifle.localToWorld(end.clone()).distanceTo(torso);
          const barrelEnd = startDistance > endDistance ? start : end; const direction = startDistance > endDistance ? -1 : 1;
          barrelEnd[axis] += direction * 0.08; this.muzzle.position.copy(barrelEnd);
        }
      }
      rifle.add(this.muzzle);
    }
    const offHand = characterRoot.getObjectByName('Middle1.R');
    if (offHand) {
      offHand.add(this.torch); this.torch.position.set(-0.035, 0.045, -0.045); this.torch.rotation.set(1.62, 0.08, 0.12); this.torch.visible = true;
    }
  }

  private buildFlashlight(scene: THREE.Scene) {
    this.flashlight = new THREE.SpotLight(0xeaf8ff, 38, CONFIG.flashlight.range, CONFIG.flashlight.angle, 0.34, 1.15);
    this.flashlight.castShadow = true; this.flashlight.shadow.mapSize.set(512, 512); this.flashlight.shadow.bias = -0.0002;
    this.flashlight.target = this.flashlightTarget; scene.add(this.flashlight, this.flashlightTarget);
    const makeBeamMaterial = (color: number, opacity: number) => {
      const material = new THREE.ShaderMaterial({
        uniforms: { beamColor: { value: new THREE.Color(color) }, beamOpacity: { value: opacity } },
        vertexShader: `
          varying vec2 vBeamUv;
          void main() {
            vBeamUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 beamColor;
          uniform float beamOpacity;
          varying vec2 vBeamUv;
          void main() {
            float fromLens = smoothstep(0.0, 0.08, vBeamUv.y);
            float distanceFade = 1.0 - smoothstep(0.16, 0.92, vBeamUv.y);
            gl_FragColor = vec4(beamColor, beamOpacity * fromLens * distanceFade);
          }
        `,
        transparent: true,
        depthWrite: false,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
      });
      material.forceSinglePass = true;
      return material;
    };
    const cone = new THREE.ConeGeometry(5.4, CONFIG.flashlight.range, 24, 1, true);
    cone.translate(0, -CONFIG.flashlight.range / 2, 0); cone.rotateX(Math.PI / 2);
    this.beam = new THREE.Mesh(cone, makeBeamMaterial(0xdff8ff, 0.02));
    scene.add(this.beam);
    const outerCone = new THREE.ConeGeometry(7.1, CONFIG.flashlight.range, 24, 1, true);
    outerCone.translate(0, -CONFIG.flashlight.range / 2, 0); outerCone.rotateX(Math.PI / 2);
    this.outerBeam = new THREE.Mesh(outerCone, makeBeamMaterial(0x8edfff, 0.004));
    scene.add(this.outerBeam);
    this.exposure.flashlight = { id: 'flashlight', position: this.flashlight.position, radius: CONFIG.flashlight.range, strength: 1.15, enabled: true };
  }

  reset() {
    this.object.position.set(0, 0, 34); this.health = this.maxHealth; this.stamina = 100; this.battery = 100; this.energy = this.maxEnergy; this.flashlightOn = true; this.invulnerability = 0;
  }

  heal(amount: number) { this.health = Math.min(this.maxHealth, this.health + amount); }
  addEnergy(amount: number) { this.energy = Math.min(this.maxEnergy, this.energy + amount); }
  canShoot() { return this.shootCooldown <= 0 && this.energy > 0 && this.health > 0; }
  fire() { if (!this.canShoot()) return false; this.energy--; this.shootCooldown = this.fireCooldown; return true; }
  getMuzzleWorld(target = new THREE.Vector3()) {
    if (this.weapon) return this.muzzle.getWorldPosition(target);
    return this.object.localToWorld(target.set(0.42, 1.65, -0.75));
  }
  applyUpgrades() {
    const effects = this.progression.effects; const previousMaxHealth = this.maxHealth; const previousMaxEnergy = this.maxEnergy;
    this.maxHealth = effects.maxHealth; this.maxEnergy = effects.maxEnergy; this.laserDamage = effects.damage; this.fireCooldown = effects.fireCooldown;
    if (this.maxHealth > previousMaxHealth) this.health += this.maxHealth - previousMaxHealth;
    if (this.maxEnergy > previousMaxEnergy) this.energy += this.maxEnergy - previousMaxEnergy;
    this.health = Math.min(this.health, this.maxHealth); this.energy = Math.min(this.energy, this.maxEnergy);
  }

  beginVehicleEntry() {
    this.vehicleEntryStart.copy(this.object.position); this.vehicleEntryTime = 0; this.flashlightOn = false;
    if (this.weapon) this.weapon.visible = false; this.torch.visible = false;
    const duck = this.actions.get('Duck');
    if (duck) {
      this.currentAction?.fadeOut(0.18); duck.reset().setLoop(THREE.LoopOnce, 1); duck.clampWhenFinished = true; duck.fadeIn(0.18).play(); this.currentAction = duck;
    }
  }

  updateVehicleEntry(dt: number, car: THREE.Object3D) {
    this.vehicleEntryTime += dt; const t = THREE.MathUtils.clamp(this.vehicleEntryTime / 1.65, 0, 1); const eased = t * t * (3 - 2 * t);
    const door = new THREE.Vector3(-1.15 * (1 - eased), 0.18, 0.25).applyAxisAngle(new THREE.Vector3(0, 1, 0), car.rotation.y).add(car.position);
    this.object.position.lerpVectors(this.vehicleEntryStart, door, eased);
    this.object.rotation.y += Math.atan2(Math.sin(car.rotation.y - this.object.rotation.y), Math.cos(car.rotation.y - this.object.rotation.y)) * Math.min(1, dt * 8);
    this.mixer?.update(dt); this.updateCamera(dt);
    if (t >= 1) { this.object.visible = false; return true; }
    return false;
  }

  followVehicle(dt: number, car: THREE.Object3D) {
    this.object.visible = false; this.object.position.copy(car.position); this.yaw = Math.PI + car.rotation.y; this.pitch = -0.08;
    this.updateCamera(dt);
  }

  beginVehicleExit(car: THREE.Object3D) {
    this.vehicleExitTime = 0; this.object.visible = true;
    this.object.position.copy(new THREE.Vector3(-1.1, 0.18, 0.25).applyAxisAngle(new THREE.Vector3(0, 1, 0), car.rotation.y).add(car.position));
    const duck = this.actions.get('Duck');
    if (duck) {
      duck.enabled = true; duck.paused = false; duck.time = duck.getClip().duration; duck.setEffectiveTimeScale(-1).setLoop(THREE.LoopOnce, 1); duck.clampWhenFinished = true; duck.play(); this.currentAction = duck;
    }
  }

  updateVehicleExit(dt: number, car: THREE.Object3D) {
    this.vehicleExitTime += dt; const t = THREE.MathUtils.clamp(this.vehicleExitTime / 1.45, 0, 1); const eased = t * t * (3 - 2 * t);
    const start = new THREE.Vector3(-1.1, 0.18, 0.25); const end = new THREE.Vector3(-2.2, 0, 0.2);
    const local = start.lerp(end, eased).applyAxisAngle(new THREE.Vector3(0, 1, 0), car.rotation.y).add(car.position);
    this.object.position.copy(local); this.object.rotation.y = car.rotation.y; this.mixer?.update(dt); this.updateCamera(dt);
    if (t >= 1) { if (this.weapon) this.weapon.visible = true; this.torch.visible = true; return true; }
    return false;
  }

  damage(amount: number, from: THREE.Vector3) {
    if (this.invulnerability > 0 || this.health <= 0) return false;
    this.health = Math.max(0, this.health - amount * this.progression.effects.damageMultiplier); this.invulnerability = CONFIG.player.invulnerability;
    const knock = this.object.position.clone().sub(from).setY(0).normalize().multiplyScalar(0.55);
    this.previous.copy(this.object.position); this.object.position.add(knock); this.collision.resolve(this.object.position, this.previous, CONFIG.player.radius);
    return true;
  }

  update(dt: number, input: InputManager, active: boolean) {
    if (this.invulnerability > 0) this.invulnerability -= dt;
    this.shootCooldown = Math.max(0, this.shootCooldown - dt);
    const mouse = input.consumeMouse();
    if (active) {
      this.yaw -= mouse.x * 0.0022; this.pitch = THREE.MathUtils.clamp(this.pitch - mouse.y * 0.0017, -0.65, 0.45);
      if (input.consume('KeyF') && this.battery > 0) this.flashlightOn = !this.flashlightOn;
      const x = Number(input.down('KeyD')) - Number(input.down('KeyA'));
      const z = Number(input.down('KeyS')) - Number(input.down('KeyW'));
      const move = new THREE.Vector3(x, 0, z);
      this.moving = move.lengthSq() > 0;
      this.sprinting = this.moving && input.down('ShiftLeft') && this.stamina > 0;
      if (this.moving) {
        move.normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw + Math.PI);
        const speed = this.sprinting ? CONFIG.player.sprintSpeed : CONFIG.player.walkSpeed;
        this.previous.copy(this.object.position); this.object.position.addScaledVector(move, speed * dt);
        this.collision.resolve(this.object.position, this.previous, CONFIG.player.radius);
      }
      // The survivor always faces the crosshair, including while idle or strafing.
      const aimYaw = this.yaw - Math.PI;
      this.object.rotation.y += Math.atan2(Math.sin(aimYaw - this.object.rotation.y), Math.cos(aimYaw - this.object.rotation.y)) * Math.min(1, dt * 18);
      this.stamina = THREE.MathUtils.clamp(this.stamina + (this.sprinting ? -CONFIG.player.staminaDrain : CONFIG.player.staminaRegen) * dt, 0, 100);
      if (this.flashlightOn) this.battery = Math.max(0, this.battery - CONFIG.flashlight.batteryDrain * dt);
      if (this.battery <= 0) this.flashlightOn = false;
    }
    this.updateAnimation(dt);
    this.updateCamera(dt);
    this.updateFlashlight();
  }

  private updateAnimation(dt: number) {
    if (this.mixer) {
      const animation = this.sprinting ? (this.actions.has('Run_Gun') ? 'Run_Gun' : 'Run') : this.moving ? (this.actions.has('Walk_Gun') ? 'Walk_Gun' : 'Walk') : (this.actions.has('Idle_Gun') ? 'Idle_Gun' : 'Idle');
      this.currentAction = crossFadeAction(this.actions, this.currentAction, animation);
      this.currentAction?.setEffectiveTimeScale(this.sprinting ? 1.18 : this.moving ? 1.1 : 1);
      this.mixer.update(dt);
      return;
    }
    this.animationTime += dt * (this.sprinting ? 11 : this.moving ? 7 : 2);
    const amount = this.moving ? (this.sprinting ? 0.8 : 0.55) : 0.04;
    const swing = Math.sin(this.animationTime) * amount;
    this.leftLeg.rotation.x = swing; this.rightLeg.rotation.x = -swing;
    this.leftArm.rotation.x = -swing * 0.7; this.rightArm.rotation.x = -0.55 + swing * 0.25;
    this.object.position.y = this.moving ? Math.abs(Math.sin(this.animationTime * 2)) * 0.035 : Math.sin(this.animationTime) * 0.012;
  }

  private updateCamera(dt: number) {
    const forward = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
    this.cameraTarget.copy(this.object.position).add(new THREE.Vector3(0, 1.75, 0));
    const desired = this.cameraTarget.clone().addScaledVector(forward, -5.6).add(new THREE.Vector3(0, 1.45, 0));
    this.collision.constrainCamera(this.cameraTarget, desired);
    this.camera.position.lerp(desired, 1 - Math.exp(-dt * 10));
    this.camera.lookAt(this.cameraTarget.clone().addScaledVector(forward, 8));
  }

  private updateFlashlight() {
    const direction = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch)).normalize();
    this.flashlight.position.copy(this.cameraTarget).addScaledVector(direction, 0.65).add(new THREE.Vector3(0.42, 0.1, 0));
    this.flashlightTarget.position.copy(this.flashlight.position).addScaledVector(direction, 20);
    const lowFlicker = this.battery < 18 && Math.random() < 0.025;
    this.flashlight.visible = this.flashlightOn && !lowFlicker; this.flashlight.intensity = this.flashlight.visible ? 38 : 0;
    this.beam.visible = this.flashlight.visible; this.outerBeam.visible = this.flashlight.visible; this.beam.position.copy(this.flashlight.position); this.outerBeam.position.copy(this.flashlight.position);
    this.beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), direction);
    this.outerBeam.quaternion.copy(this.beam.quaternion);
    this.exposure.flashlight!.enabled = this.flashlight.visible; this.exposure.flashlightDirection.copy(direction);
  }
}
