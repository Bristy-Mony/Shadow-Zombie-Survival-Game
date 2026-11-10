import * as THREE from 'three';
import { CONFIG, COLORS } from '../config';
import { LightExposureSystem } from '../lighting/LightExposureSystem';
import { CollisionSystem } from '../world/CollisionSystem';
import { Player } from '../player/Player';
import { CharacterAssets, crossFadeAction } from '../assets/CharacterAssets';

export type ZombieState = 'WANDER' | 'INVESTIGATE' | 'CHASE' | 'ATTACK' | 'LIGHT_RECOIL' | 'STUNNED' | 'DEAD';

export class Zombie {
  readonly object = new THREE.Group();
  state: ZombieState = 'WANDER';
  exposure = 0;
  lightLevel = 0;
  alive = true;
  health: number;
  readonly maxHealth: number;
  onDied?: (zombie: Zombie, headshot: boolean) => void;
  stunnedCount = 0;
  private leftArm!: THREE.Group;
  private rightArm!: THREE.Group;
  private leftLeg!: THREE.Group;
  private rightLeg!: THREE.Group;
  private target = new THREE.Vector3();
  private lastPosition = new THREE.Vector3();
  private wanderTimer = 0;
  private attackCooldown = 0;
  private stunCharge = 0;
  private stunTimer = 0;
  private stunResistance = 0;
  private anim = Math.random() * 10;
  private scalePulse = Math.random() * 3;
  private fallbackModel = new THREE.Group();
  private mixer?: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  private currentAction?: THREE.AnimationAction;
  private currentAnimation = '';
  private attackWindup = 0;
  private animatedRoot?: THREE.Group;
  private deathTimer = 0;

  constructor(public readonly shadow: boolean, position: THREE.Vector3, private readonly exposureSystem: LightExposureSystem, private readonly collision: CollisionSystem, private readonly variant = 0) {
    this.maxHealth = shadow ? 125 : variant === 1 ? 105 : 82; this.health = this.maxHealth;
    this.object.position.copy(position); this.object.visible = !shadow; this.object.add(this.fallbackModel);
    this.buildModel(); this.pickWanderTarget(); void this.loadAnimatedCharacter();
  }

  private limb(color: number, length: number, radius: number) {
    const pivot = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 4, 7), new THREE.MeshStandardMaterial({ color, roughness: 0.95 }));
    mesh.position.y = -length * 0.45; mesh.castShadow = true; pivot.add(mesh); return pivot;
  }

  private buildModel() {
    const skin = this.shadow ? COLORS.shadow : COLORS.zombie;
    const bodyMat = new THREE.MeshStandardMaterial({ color: this.shadow ? 0x08090e : 0x39433c, roughness: 0.94 });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(this.shadow ? 0.72 : 0.82, 1.1, 0.46), bodyMat);
    torso.position.y = this.shadow ? 1.45 : 1.65; torso.rotation.z = this.shadow ? 0.08 : -0.05; torso.castShadow = true; this.fallbackModel.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(this.shadow ? 0.27 : 0.31, 10, 8), new THREE.MeshStandardMaterial({ color: skin, roughness: 1 }));
    head.position.set(0.08, this.shadow ? 2.17 : 2.48, 0.1); head.castShadow = true; this.fallbackModel.add(head);
    [-0.1, 0.1].forEach((x) => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 5), new THREE.MeshBasicMaterial({ color: this.shadow ? 0xff3b3b : 0xffb947 }));
      eye.position.set(x + 0.08, head.position.y + 0.03, -0.265); this.fallbackModel.add(eye);
    });
    this.leftArm = this.limb(skin, this.shadow ? 1.05 : 0.86, 0.12); this.leftArm.position.set(-0.52, 2.05, 0); this.fallbackModel.add(this.leftArm);
    this.rightArm = this.limb(skin, this.shadow ? 1.05 : 0.86, 0.12); this.rightArm.position.set(0.52, 2.05, 0); this.fallbackModel.add(this.rightArm);
    this.leftLeg = this.limb(bodyMat.color.getHex(), 0.9, 0.15); this.leftLeg.position.set(-0.2, 1.05, 0); this.fallbackModel.add(this.leftLeg);
    this.rightLeg = this.limb(bodyMat.color.getHex(), 0.9, 0.15); this.rightLeg.position.set(0.2, 1.05, 0); this.fallbackModel.add(this.rightLeg);
  }

  private async loadAnimatedCharacter() {
    try {
      const character = await CharacterAssets.create({
        role: 'zombie',
        variant: this.shadow ? 3 : this.variant,
        height: this.shadow ? 2.62 : 2.72,
        shadow: this.shadow,
      });
      this.object.add(character.root);
      this.animatedRoot = character.root;
      this.mixer = character.mixer;
      this.actions = character.actions;
      this.currentAnimation = 'Idle';
      this.currentAction = crossFadeAction(this.actions, undefined, this.currentAnimation, 0);
      this.fallbackModel.visible = false;
    } catch (error) {
      console.warn('Animated zombie could not load; using procedural fallback.', error);
    }
  }

  emerge() { this.object.visible = true; this.state = 'CHASE'; }

  takeDamage(amount: number, headshot = false) {
    if (!this.alive) return { killed: false, damage: 0 };
    const dealt = amount * (headshot ? 1.75 : 1);
    this.health = Math.max(0, this.health - dealt);
    if (this.health <= 0) {
      this.alive = false; this.state = 'DEAD'; this.deathTimer = 2.2;
      const deathName = this.actions.has('Death') ? 'Death' : 'HitReact';
      this.currentAnimation = deathName; this.currentAction = crossFadeAction(this.actions, this.currentAction, deathName, 0.08);
      if (this.currentAction) { this.currentAction.setLoop(THREE.LoopOnce, 1); this.currentAction.clampWhenFinished = true; }
      this.onDied?.(this, headshot);
      return { killed: true, damage: dealt };
    }
    this.state = 'LIGHT_RECOIL'; this.stunTimer = 0.2;
    const hit = this.actions.has('HitReact') ? 'HitReact' : 'Idle';
    this.currentAnimation = hit; this.currentAction = crossFadeAction(this.actions, this.currentAction, hit, 0.06);
    this.currentAction?.reset().play();
    return { killed: false, damage: dealt };
  }

  private pickWanderTarget() {
    this.target.copy(this.object.position).add(new THREE.Vector3((Math.random() - 0.5) * 12, 0, (Math.random() - 0.5) * 12));
    this.target.x = THREE.MathUtils.clamp(this.target.x, -36, 36); this.target.z = THREE.MathUtils.clamp(this.target.z, -36, 36);
    this.wanderTimer = 3 + Math.random() * 4;
  }

  update(dt: number, player: Player, active: boolean) {
    if (!this.object.visible) return;
    if (!this.alive) {
      if (active) {
        this.deathTimer -= dt; this.mixer?.update(dt);
        if (!this.mixer) this.object.rotation.x = Math.min(Math.PI / 2, this.object.rotation.x + dt * 2.8);
        if (this.deathTimer <= 0) this.object.visible = false;
      }
      return;
    }
    if (!active) return;
    this.attackCooldown -= dt; this.stunResistance -= dt;
    this.exposure = this.exposureSystem.exposureAt(this.object.position);
    this.lightLevel += (this.exposure - this.lightLevel) * Math.min(1, dt * 4);
    const toPlayer = player.object.position.clone().sub(this.object.position); const distance = toPlayer.length();
    const safeBlocked = this.exposureSystem.inSafeZone(player.object.position) && distance > 2.8;
    const detection = this.shadow ? THREE.MathUtils.lerp(22, 8, this.lightLevel) : THREE.MathUtils.lerp(17, 9, this.lightLevel);

    if (this.state === 'STUNNED') {
      this.stunTimer -= dt;
      if (this.stunTimer <= 0) { this.state = 'CHASE'; this.stunResistance = this.shadow ? 2.8 : 4.2; }
    } else if (this.lightLevel > (this.shadow ? 0.42 : 0.74)) {
      this.stunCharge += dt * (this.shadow ? 1.6 : 1);
      if (this.stunCharge >= CONFIG.flashlight.stunTime && this.stunResistance <= 0) {
        this.state = 'STUNNED'; this.stunTimer = this.shadow ? 2 : 1.35; this.stunCharge = 0; this.stunnedCount++;
      } else this.state = 'LIGHT_RECOIL';
    } else {
      this.stunCharge = Math.max(0, this.stunCharge - dt * 0.75);
      if (distance < CONFIG.enemy.attackRange && !safeBlocked) this.state = 'ATTACK';
      else if (distance < detection && !safeBlocked) this.state = 'CHASE';
      else this.state = 'WANDER';
    }

    let speed = (this.shadow ? CONFIG.enemy.shadowSpeed : CONFIG.enemy.normalSpeed) * THREE.MathUtils.lerp(1.5, 0.42, this.lightLevel);
    let direction = new THREE.Vector3();
    if (this.state === 'WANDER') {
      this.wanderTimer -= dt; if (this.wanderTimer <= 0 || this.object.position.distanceTo(this.target) < 1) this.pickWanderTarget();
      direction.copy(this.target).sub(this.object.position).setY(0).normalize(); speed *= 0.43;
    } else if (this.state === 'CHASE') direction.copy(toPlayer).setY(0).normalize();
    else if (this.state === 'LIGHT_RECOIL') { direction.copy(toPlayer).setY(0).normalize().multiplyScalar(-1); speed = this.shadow ? 3.8 : 1.5; }
    else if (this.state === 'ATTACK' && this.attackCooldown <= 0 && this.attackWindup <= 0) {
      this.attackWindup = this.shadow ? 0.28 : 0.42;
      this.attackCooldown = THREE.MathUtils.lerp(1.15, 1.9, this.lightLevel);
      const biteName = this.actions.has('Idle_Attack') ? 'Idle_Attack' : this.actions.has('Run_Attack') ? 'Run_Attack' : 'HitReact';
      this.currentAnimation = biteName;
      this.currentAction = crossFadeAction(this.actions, this.currentAction, biteName, 0.08);
      this.currentAction?.reset().play();
    }
    if (this.attackWindup > 0) {
      this.attackWindup -= dt;
      if (this.attackWindup <= 0 && distance < CONFIG.enemy.attackRange + 0.35 && this.state === 'ATTACK') {
        player.damage(this.shadow ? CONFIG.enemy.shadowDamage : CONFIG.enemy.normalDamage, this.object.position);
      }
    }
    if (direction.lengthSq() > 0 && this.state !== 'STUNNED') {
      this.lastPosition.copy(this.object.position); this.object.position.addScaledVector(direction, speed * dt);
      this.collision.resolve(this.object.position, this.lastPosition, 0.45);
      const angle = Math.atan2(-direction.x, -direction.z);
      this.object.rotation.y += Math.atan2(Math.sin(angle - this.object.rotation.y), Math.cos(angle - this.object.rotation.y)) * Math.min(1, dt * 8);
    }
    this.animate(dt, speed);
  }

  private animate(dt: number, speed: number) {
    if (this.mixer) {
      let animation = 'Idle';
      if (this.state === 'WANDER') animation = 'Walk';
      else if (this.state === 'CHASE') animation = this.actions.has('Run_Arms') ? 'Run_Arms' : 'Run';
      else if (this.state === 'ATTACK') animation = this.actions.has('Idle_Attack') ? 'Idle_Attack' : this.actions.has('Run_Attack') ? 'Run_Attack' : 'HitReact';
      else if (this.state === 'LIGHT_RECOIL' || this.state === 'STUNNED') animation = 'HitReact';
      if (animation !== this.currentAnimation) {
        this.currentAnimation = animation;
        this.currentAction = crossFadeAction(this.actions, this.currentAction, animation, 0.16);
      }
      this.mixer.update(dt * (this.shadow ? 1.18 : 1));
      if (this.animatedRoot) {
        const fullWindup = this.shadow ? 0.28 : 0.42;
        const bitePhase = this.attackWindup > 0 ? 1 - this.attackWindup / fullWindup : 0;
        const targetLean = this.state === 'ATTACK' && this.attackWindup > 0 ? -Math.sin(bitePhase * Math.PI) * 0.34 : 0;
        this.animatedRoot.rotation.x = THREE.MathUtils.lerp(this.animatedRoot.rotation.x, targetLean, Math.min(1, dt * 18));
      }
      if (this.shadow) {
        this.scalePulse += dt * 4;
        const pulse = 1 + Math.sin(this.scalePulse) * 0.022;
        this.object.scale.set(pulse, 1 / pulse, pulse);
      }
      return;
    }
    this.anim += dt * (3 + speed * 2); const intensity = this.state === 'STUNNED' ? 0.08 : this.state === 'ATTACK' ? 1.1 : 0.65;
    const swing = Math.sin(this.anim) * intensity;
    this.leftLeg.rotation.x = swing; this.rightLeg.rotation.x = -swing;
    this.leftArm.rotation.x = -0.8 - swing * 0.45; this.rightArm.rotation.x = -0.8 + swing * 0.45;
    if (this.state === 'ATTACK') { this.leftArm.rotation.x = -1.7 + Math.sin(this.anim * 2) * 0.7; this.rightArm.rotation.x = this.leftArm.rotation.x; }
    if (this.state === 'LIGHT_RECOIL') this.object.rotation.z = Math.sin(this.anim * 3) * 0.08;
    else this.object.rotation.z *= 0.85;
    if (this.shadow) { this.scalePulse += dt * 4; const s = 1 + Math.sin(this.scalePulse) * 0.025; this.object.scale.set(s, 1 / s, s); }
  }
}
