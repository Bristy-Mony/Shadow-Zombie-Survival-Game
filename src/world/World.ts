import * as THREE from 'three';
import { COLORS } from '../config';
import { CollisionSystem, Collider } from './CollisionSystem';
import { GameplayLight, LightExposureSystem } from '../lighting/LightExposureSystem';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export interface Interactable {
  id: string;
  kind: 'fuse' | 'battery' | 'medkit' | 'generator' | 'breaker' | 'gate' | 'relay' | 'final-gate' | 'car';
  object: THREE.Object3D;
  prompt: string;
  active: boolean;
  onInteract?: () => void;
}

interface StreetLamp { light: THREE.PointLight; bulb: THREE.Mesh; data: GameplayLight; delay: number }

export class World {
  readonly group = new THREE.Group();
  readonly collisions = new CollisionSystem();
  readonly interactables: Interactable[] = [];
  readonly streetLamps: StreetLamp[] = [];
  readonly spawnPoints: THREE.Vector3[] = [];
  readonly shadowTriggers = [new THREE.Vector3(-25, 0, 8), new THREE.Vector3(21, 0, -19)];
  readonly generatorPosition = new THREE.Vector3(24, 0, -27);
  readonly gatePosition = new THREE.Vector3(0, 0, -38);
  readonly relayPosition = new THREE.Vector3(-6.7, 0, -65);
  readonly finalGatePosition = new THREE.Vector3(0, 0, -82);
  readonly escapeCar = new THREE.Group();
  private readonly objectiveBeacon = new THREE.Group();
  private dust!: THREE.Points;
  private sparks!: THREE.Points;
  private sparkLife = 0;
  private elapsed = 0;
  private powerActivatedAt = 0;
  private gateCollider?: Collider;
  private finalGateCollider?: Collider;
  powerOn = false;
  private readonly propLoader = new GLTFLoader();
  private readonly propCache = new Map<string, Promise<THREE.Group>>();
  private readonly carWheels: THREE.Object3D[] = [];
  private carSpeed = 0;
  private carTravel = 0;

  constructor(private readonly scene: THREE.Scene, private readonly exposure: LightExposureSystem) {
    this.group.name = 'Abandoned district';
    scene.add(this.group);
    this.buildGround();
    this.buildDistrict();
    void this.buildDetailedProps();
    this.buildLighting();
    this.buildPickups();
    this.buildGenerator();
    this.buildGate();
    this.buildEscapeRoute();
    this.buildParticles();
    this.buildObjectiveBeacon();
  }

  private material(color: number, roughness = 0.88, metalness = 0.05) {
    return new THREE.MeshStandardMaterial({ color, roughness, metalness });
  }

  private mesh(geometry: THREE.BufferGeometry, material: THREE.Material, position: [number, number, number], cast = true) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    return mesh;
  }

  private addBox(name: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, color: number, collision = true) {
    const box = this.mesh(new THREE.BoxGeometry(sx, sy, sz), this.material(color), [x, y + sy / 2, z]);
    box.name = name;
    if (collision) this.collisions.add(new THREE.Vector3(x, y + sy / 2, z), new THREE.Vector3(sx, sy, sz), name);
    return box;
  }

  private buildGround() {
    const ground = this.mesh(new THREE.PlaneGeometry(88, 88), this.material(0x17232e), [0, 0, 0], false);
    ground.rotation.x = -Math.PI / 2;
    const roadMat = this.material(0x171d25);
    const roadA = this.mesh(new THREE.PlaneGeometry(15, 84), roadMat, [0, 0.012, 0], false);
    roadA.rotation.x = -Math.PI / 2;
    const roadB = this.mesh(new THREE.PlaneGeometry(72, 13), roadMat, [0, 0.014, 5], false);
    roadB.rotation.x = -Math.PI / 2;
    const lineMat = new THREE.MeshBasicMaterial({ color: 0x8d793e, transparent: true, opacity: 0.38 });
    for (let z = -34; z < 36; z += 8) {
      const line = this.mesh(new THREE.PlaneGeometry(0.14, 3.5), lineMat, [0, 0.025, z], false);
      line.rotation.x = -Math.PI / 2;
    }
  }

  private buildDistrict() {
    const buildingColors = [0x202934, 0x27313a, 0x1c2730, 0x303039];
    const buildings = [
      [-31, -31, 14, 10, 13], [-17, -31, 10, 14, 9], [18, -31, 11, 13, 10], [33, -29, 11, 16, 12],
      [-31, -10, 14, 11, 10], [31, -8, 13, 13, 12], [-31, 23, 14, 14, 11], [-17, 30, 10, 14, 10],
      [19, 29, 12, 15, 12], [33, 24, 10, 18, 11], [-34, 7, 9, 10, 9], [35, 9, 8, 10, 8],
    ];
    buildings.forEach(([x, z, sx, sy, sz], i) => {
      const b = this.addBox('building', x, 0, z, sx, sy, sz, buildingColors[i % buildingColors.length]);
      const windowMat = new THREE.MeshBasicMaterial({ color: 0x263949 });
      for (let row = 0; row < 2; row++) for (let col = -1; col <= 1; col++) {
        const w = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.1), windowMat);
        w.position.set(col * 2.4, 3 + row * 2.8 - sy / 2, sz / 2 + 0.011);
        b.add(w);
      }
    });

    // Sidewalks and route framing.
    const curbMat = this.material(0x394047);
    [-8.2, 8.2].forEach((x) => this.mesh(new THREE.BoxGeometry(1.2, 0.22, 84), curbMat, [x, 0.11, 0], false));
    [-2.2, 12.2].forEach((z) => this.mesh(new THREE.BoxGeometry(72, 0.2, 1), curbMat, [0, 0.1, z], false));

    // Vehicles, crates, barriers and a dark tunnel frame.
    const vanBlocker = this.addBox('abandoned van', -12, 0, 8.2, 4.8, 1.7, 2.5, 0x39404a); vanBlocker.visible = false;
    const carBlocker = this.addBox('crashed car', 13, 0, 2, 4.2, 1.2, 2.2, 0x442b2c); carBlocker.visible = false;
    this.addBox('crate', -22, 0, -17, 2.4, 2.4, 2.4, 0x3d3429);
    this.addBox('crate', -25, 0, -15, 2, 1.7, 2, 0x4b3d2c);
    this.addBox('checkpoint', 7, 0, -15, 5.4, 1.1, 1, 0x5b5b51);
    this.addBox('tunnel wall', -7, 0, -20, 2, 6, 12, 0x171d24);
    this.addBox('tunnel wall', 7, 0, -20, 2, 6, 12, 0x171d24);
    const tunnelTop = this.addBox('tunnel lintel', 0, 4.8, -20, 16, 1.5, 12, 0x151a20, false);
    tunnelTop.castShadow = true;

    for (let i = 0; i < 8; i++) {
      const x = -34 + (i % 4) * 2.1;
      const z = -1 + Math.floor(i / 4) * 2;
      this.addBox('concrete barrier', x, 0, z, 1.7, 0.8, 0.65, 0x4b5154);
    }
    this.addSigns();
    this.spawnPoints.push(
      new THREE.Vector3(-18, 0, 19), new THREE.Vector3(18, 0, 18), new THREE.Vector3(-24, 0, -4),
      new THREE.Vector3(24, 0, 3), new THREE.Vector3(-18, 0, -21), new THREE.Vector3(16, 0, -16),
      new THREE.Vector3(-4, 0, -27), new THREE.Vector3(30, 0, 16), new THREE.Vector3(-30, 0, 14),
    );
  }

  private loadProp(file: string) {
    let cached = this.propCache.get(file);
    if (!cached) {
      cached = this.propLoader.loadAsync(`${import.meta.env.BASE_URL}assets/zombie-pack/${file}`).then((asset) => asset.scene);
      this.propCache.set(file, cached);
    }
    return cached;
  }

  private async placeProp(file: string, position: THREE.Vector3, targetSize: number, rotation = 0) {
    try {
      const source = await this.loadProp(file);
      const model = source.clone(true);
      model.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true; }
      });
      const bounds = new THREE.Box3().setFromObject(model);
      const size = bounds.getSize(new THREE.Vector3());
      const scale = targetSize / Math.max(size.x, size.z, 0.01);
      model.scale.setScalar(scale);
      model.position.copy(position);
      model.position.y -= bounds.min.y * scale;
      model.rotation.y = rotation;
      this.group.add(model);
      return model;
    } catch (error) {
      console.warn(`Map prop failed to load: ${file}`, error);
      return undefined;
    }
  }

  private async buildDetailedProps() {
    await Promise.all([
      this.placeProp('Vehicle_Sports_Armored.gltf', new THREE.Vector3(-12, 0, 8.2), 5.1, 0.18),
      this.placeProp('Vehicle_Pickup.gltf', new THREE.Vector3(13, 0, 2), 4.7, -0.32),
      this.placeProp('Vehicle_Truck_Armored.gltf', new THREE.Vector3(27, 0, -19), 6.4, Math.PI / 2),
      this.placeProp('Container_Green.gltf', new THREE.Vector3(-24, 0, -20), 5.5, 0.08),
      this.placeProp('Container_Red.gltf', new THREE.Vector3(25, 0, 22), 5.2, Math.PI / 2),
      this.placeProp('Couch.gltf', new THREE.Vector3(-25, 0, 5.5), 2.7, 0.18),
      this.placeProp('Pallet_Broken.gltf', new THREE.Vector3(-18, 0.02, 7), 2.3, 0.55),
      this.placeProp('Wheels_Stack.gltf', new THREE.Vector3(-21, 0, 11), 1.45, -0.2),
      this.placeProp('TrafficBarrier_1.gltf', new THREE.Vector3(6, 0, -14.5), 3.8, 0.12),
      this.placeProp('TrafficBarrier_1.gltf', new THREE.Vector3(-4.5, 0, 18), 3.8, -0.1),
      this.placeProp('TrafficCone_1.gltf', new THREE.Vector3(3.2, 0, 16.5), 0.65, 0.2),
      this.placeProp('TrafficCone_1.gltf', new THREE.Vector3(5.1, 0, 15.6), 0.65, -0.4),
      this.placeProp('TrashBag_1.gltf', new THREE.Vector3(-7.1, 0, 26), 0.72, 0),
      this.placeProp('TrashBag_1.gltf', new THREE.Vector3(-6.5, 0, 25.4), 0.62, 0.7),
      this.placeProp('CinderBlock.gltf', new THREE.Vector3(9.1, 0, 7.4), 0.8, 0.3),
    ]);
    this.collisions.add(new THREE.Vector3(27, 1.3, -19), new THREE.Vector3(3.3, 2.6, 6.4), 'armored truck');
    this.collisions.add(new THREE.Vector3(-24, 1.35, -20), new THREE.Vector3(5.5, 2.7, 2.5), 'cargo container');
    this.collisions.add(new THREE.Vector3(25, 1.3, 22), new THREE.Vector3(2.5, 2.6, 5.2), 'cargo container');
  }

  private addSigns() {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#cfc5a8'; ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = '#371f1f'; ctx.font = 'bold 56px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('EVAC ROUTE  ↑', 256, 64);
    const tex = new THREE.CanvasTexture(canvas);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 1.3), new THREE.MeshBasicMaterial({ map: tex }));
    sign.position.set(-5.2, 3.2, -31); sign.rotation.y = Math.PI / 2; this.group.add(sign);
  }

  private buildLighting() {
    const emergency = new THREE.PointLight(COLORS.emergency, 6.2, 13, 2);
    emergency.position.set(0, 3, 33); emergency.castShadow = true; this.group.add(emergency);
    this.exposure.lights.push({ id: 'start-safe', position: emergency.position, radius: 9, strength: 0.9, enabled: true, safe: true });

    const positions: [number, number][] = [[-6, 24], [7, 14], [-7, 5], [7, -7], [-6, -16], [7, -27], [-5, -34]];
    positions.forEach(([x, z], index) => {
      const pole = this.mesh(new THREE.CylinderGeometry(0.12, 0.18, 5.2, 8), this.material(0x343a40, 0.55, 0.6), [x, 2.6, z]);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), new THREE.MeshBasicMaterial({ color: 0x3c3528 }));
      bulb.position.y = 2.45; pole.add(bulb);
      const light = new THREE.PointLight(COLORS.warm, 0, 13, 2);
      light.position.set(x, 4.8, z); this.group.add(light);
      const data = { id: `street-${index}`, position: light.position, radius: 12, strength: 0.78, enabled: false, safe: index === 1 || index === 5 };
      this.exposure.lights.push(data); this.streetLamps.push({ light, bulb, data, delay: index * 0.42 });
    });

    // Optional breaker floodlight in the western garage.
    const flood = new THREE.SpotLight(0xb5dcff, 0, 20, Math.PI / 4, 0.5, 1.5);
    flood.position.set(-23, 5, 4); flood.target.position.set(-18, 0, 6); this.group.add(flood, flood.target);
    const data: GameplayLight = { id: 'garage-flood', position: flood.position, radius: 15, strength: 0.85, enabled: false, safe: true };
    this.exposure.lights.push(data);
    const panel = this.addBox('breaker panel', -26, 1, 3, 0.6, 1.4, 1.1, 0x36434b, false);
    this.interactables.push({ id: 'breaker', kind: 'breaker', object: panel, prompt: '[E] Activate Flood Light', active: true, onInteract: () => {
      flood.intensity = 5; data.enabled = true;
      (panel.material as THREE.MeshStandardMaterial).emissive.setHex(0x2b95aa);
    }});
  }

  private pickup(id: string, kind: 'fuse' | 'battery' | 'medkit', position: THREE.Vector3) {
    const group = new THREE.Group(); group.position.copy(position);
    const isFuse = kind === 'fuse';
    const color = isFuse ? 0xffcc4c : kind === 'battery' ? 0x66dfff : 0x74ff86;
    const core = new THREE.Mesh(isFuse ? new THREE.CylinderGeometry(0.16, 0.16, 0.65, 8) : new THREE.BoxGeometry(0.38, 0.62, 0.25), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.1, roughness: 0.35 }));
    core.rotation.z = isFuse ? Math.PI / 2 : 0; core.castShadow = true; group.add(core);
    const glow = new THREE.PointLight(color, 0.85, 4); group.add(glow);
    this.group.add(group);
    this.interactables.push({ id, kind, object: group, prompt: `[E] Pick Up ${isFuse ? 'Power Fuse' : kind === 'battery' ? 'Laser Energy Cell' : 'Medical Kit'}`, active: true });
  }

  private buildPickups() {
    this.pickup('fuse-garage', 'fuse', new THREE.Vector3(-24, 1, 13));
    this.pickup('fuse-parking', 'fuse', new THREE.Vector3(25, 1, 14));
    this.pickup('fuse-warehouse', 'fuse', new THREE.Vector3(-10, 1, -28));
    const cellLocations = [
      new THREE.Vector3(-3, 0.8, 12), new THREE.Vector3(19, 0.8, -11), new THREE.Vector3(-4, 0.8, -24),
      new THREE.Vector3(-27, 0.8, 7), new THREE.Vector3(23, 0.8, 23), new THREE.Vector3(5, 0.8, -8),
      new THREE.Vector3(-17, 0.8, -8), new THREE.Vector3(29, 0.8, -18), new THREE.Vector3(11, 0.8, 18),
    ].sort(() => Math.random() - 0.5);
    cellLocations.slice(0, 5).forEach((position, index) => this.pickup(`energy-cell-${index}`, 'battery', position));
    this.pickup('medkit', 'medkit', new THREE.Vector3(28, 0.8, 8));
  }

  private buildGenerator() {
    const generator = new THREE.Group(); generator.position.copy(this.generatorPosition);
    const body = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.2, 2.2), this.material(0x454b39, 0.65, 0.5));
    body.position.y = 1.1; body.castShadow = true; generator.add(body);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.75, 0.18), this.material(0x172026, 0.35, 0.55));
    panel.position.set(0, 1.35, 1.16); generator.add(panel);
    for (let i = -1; i <= 1; i++) {
      const slot = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.44, 0.08), new THREE.MeshBasicMaterial({ color: 0x431818 }));
      slot.position.set(i * 0.34, 1.37, 1.27); generator.add(slot);
    }
    this.group.add(generator);
    this.collisions.add(new THREE.Vector3(24, 1.1, -27), new THREE.Vector3(3.4, 2.2, 2.2), 'generator');
    this.interactables.push({ id: 'generator', kind: 'generator', object: generator, prompt: '[E] Insert 3 Fuses', active: true });
  }

  private buildGate() {
    this.addBox('gate pillar', -4.5, 0, -39, 1.2, 5, 1.4, 0x40464b);
    this.addBox('gate pillar', 4.5, 0, -39, 1.2, 5, 1.4, 0x40464b);
    const gate = this.addBox('evacuation gate', 0, 0, -39, 7.8, 3.7, 0.45, 0x343c41, false);
    this.gateCollider = this.collisions.add(new THREE.Vector3(0, 1.85, -39), new THREE.Vector3(7.8, 3.7, 0.7), 'evacuation gate');
    const panel = this.addBox('gate panel', 5.2, 1.1, -38.6, 0.55, 1.3, 0.45, 0x4b2929, false);
    this.interactables.push({ id: 'gate', kind: 'gate', object: panel, prompt: '[E] Gate Has No Power', active: true });
    gate.userData.closedY = gate.position.y; gate.userData.open = false;
    panel.userData.gate = gate;
    const safeLight = new THREE.PointLight(0x9be8ff, 0, 16, 1.5); safeLight.position.set(0, 4, -42); this.group.add(safeLight);
    panel.userData.light = safeLight;
  }

  private buildEscapeRoute() {
    const road = this.mesh(new THREE.PlaneGeometry(18, 108), this.material(0x111820, 0.94), [0, 0.018, -92], false);
    road.rotation.x = -Math.PI / 2;
    const lineMaterial = new THREE.MeshBasicMaterial({ color: 0xd5b856, transparent: true, opacity: 0.52 });
    for (let z = -48; z > -140; z -= 9) {
      const line = this.mesh(new THREE.PlaneGeometry(0.16, 4), lineMaterial, [0, 0.035, z], false); line.rotation.x = -Math.PI / 2;
    }
    [-9.2, 9.2].forEach((x) => this.mesh(new THREE.BoxGeometry(0.55, 0.5, 108), this.material(0x343a40), [x, 0.25, -92], false));
    for (let z = -55; z > -136; z -= 16) {
      [-7.6, 7.6].forEach((x) => {
        this.mesh(new THREE.CylinderGeometry(0.07, 0.1, 3.4, 7), this.material(0x303b44, 0.5, 0.7), [x, 1.7, z]);
        this.mesh(new THREE.SphereGeometry(0.16, 7, 5), new THREE.MeshBasicMaterial({ color: 0x8ecfff }), [x, 3.25, z], false);
      });
    }

    const relay = this.addBox('extraction relay', -6.7, 1, -65, 0.75, 1.7, 1.15, 0x253039, false);
    relay.visible = false;
    this.interactables.push({ id: 'extraction-relay', kind: 'relay', object: relay, prompt: '[E] Activate Extraction Relay', active: false });

    this.addBox('final gate pillar', -4.5, 0, -82, 1.2, 5, 1.4, 0x353f46);
    this.addBox('final gate pillar', 4.5, 0, -82, 1.2, 5, 1.4, 0x353f46);
    const finalGate = this.addBox('final evacuation gate', 0, 0, -82, 7.8, 3.7, 0.45, 0x263138, false);
    this.finalGateCollider = this.collisions.add(new THREE.Vector3(0, 1.85, -82), new THREE.Vector3(7.8, 3.7, 0.7), 'final evacuation gate');
    finalGate.userData.open = false;
    const finalPanel = this.addBox('final gate panel', 5.2, 1.1, -81.6, 0.55, 1.3, 0.45, 0x4b2929, false);
    finalPanel.userData.gate = finalGate;
    this.interactables.push({ id: 'final-gate', kind: 'final-gate', object: finalPanel, prompt: 'Final Gate Locked', active: false });

    const car = this.escapeCar; car.name = 'Armored escape vehicle'; car.position.set(0, 0, -91); car.visible = false;
    const fallback = new THREE.Group(); fallback.name = 'Vehicle loading fallback'; car.add(fallback);
    const bodyMaterial = this.material(0x26343b, 0.38, 0.72); const glassMaterial = this.material(0x07151c, 0.12, 0.35);
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.45, 0.72, 4.8), bodyMaterial); body.position.y = 0.83; body.castShadow = true; fallback.add(body);
    const hood = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.45, 1.35), bodyMaterial); hood.position.set(0, 1.2, -1.55); hood.castShadow = true; fallback.add(hood);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.02, 1.05, 2.15), glassMaterial); cabin.position.set(0, 1.55, 0.15); cabin.castShadow = true; fallback.add(cabin);
    const bumper = new THREE.Mesh(new THREE.BoxGeometry(2.62, 0.28, 0.25), this.material(0x111518, 0.3, 0.9)); bumper.position.set(0, 0.62, -2.45); fallback.add(bumper);
    const wheelGeometry = new THREE.CylinderGeometry(0.46, 0.46, 0.32, 16); wheelGeometry.rotateZ(Math.PI / 2);
    for (const x of [-1.24, 1.24]) for (const z of [-1.55, 1.55]) {
      const wheel = new THREE.Mesh(wheelGeometry, this.material(0x090b0d, 0.82, 0.18)); wheel.position.set(x, 0.48, z); wheel.castShadow = true; fallback.add(wheel); this.carWheels.push(wheel);
    }
    for (const x of [-0.72, 0.72]) {
      const headlight = new THREE.SpotLight(0xdff5ff, 5.5, 24, Math.PI / 7, 0.45, 1.4); headlight.position.set(x, 1, -2.35);
      headlight.target.position.set(x, 0.2, -15); car.add(headlight, headlight.target);
    }
    void this.loadProp('Vehicle_Sports_Armored.gltf').then((source) => {
      const model = source.clone(true); model.traverse((object) => { const mesh = object as THREE.Mesh; if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true; } });
      const bounds = new THREE.Box3().setFromObject(model); const size = bounds.getSize(new THREE.Vector3()); const scale = 5.25 / Math.max(size.x, size.z, 0.01);
      model.scale.setScalar(scale); model.position.y = -bounds.min.y * scale; model.rotation.y = Math.PI; car.add(model); fallback.visible = false;
      this.carWheels.length = 0; ['BackWheels', 'FrontWheel_R', 'FrontWheel_L'].forEach((name) => { const wheel = model.getObjectByName(name); if (wheel) this.carWheels.push(wheel); });
    }).catch((error) => console.warn('Escape vehicle model failed to load; using fallback.', error));
    this.group.add(car);
    this.interactables.push({ id: 'escape-car', kind: 'car', object: car, prompt: '[E] Enter Escape Vehicle', active: false });
  }

  showEscapeVehicle() {
    this.escapeCar.visible = true;
    const car = this.interactables.find((item) => item.kind === 'car'); if (car) car.active = true;
  }

  showExtractionRelay() {
    const relay = this.interactables.find((item) => item.kind === 'relay');
    if (relay) { relay.object.visible = true; relay.active = true; }
  }

  activateExtractionRelay() {
    const relay = this.interactables.find((item) => item.kind === 'relay');
    if (relay) {
      relay.active = false;
      const mesh = relay.object as THREE.Mesh; (mesh.material as THREE.MeshStandardMaterial).emissive.setHex(0x38b9a8);
    }
    const finalGate = this.interactables.find((item) => item.kind === 'final-gate')?.object.userData.gate as THREE.Mesh | undefined;
    if (finalGate) finalGate.userData.open = true;
    if (this.finalGateCollider) { this.collisions.remove(this.finalGateCollider); this.finalGateCollider = undefined; }
  }

  beginDriving() {
    const car = this.interactables.find((item) => item.kind === 'car'); if (car) car.active = false;
    this.carSpeed = 0; this.carTravel = 0;
  }

  driveEscapeVehicle(dt: number, throttle: boolean, steering: number) {
    const targetSpeed = throttle ? 11.5 : 4.2;
    this.carSpeed = THREE.MathUtils.lerp(this.carSpeed, targetSpeed, 1 - Math.exp(-dt * 2.4));
    const targetYaw = THREE.MathUtils.clamp(-steering * 0.24, -0.24, 0.24);
    this.escapeCar.rotation.y = THREE.MathUtils.lerp(this.escapeCar.rotation.y, targetYaw, 1 - Math.exp(-dt * 3.4));
    const forward = new THREE.Vector3(-Math.sin(this.escapeCar.rotation.y), 0, -Math.cos(this.escapeCar.rotation.y));
    this.escapeCar.position.addScaledVector(forward, this.carSpeed * dt); this.escapeCar.position.x = THREE.MathUtils.clamp(this.escapeCar.position.x, -5.7, 5.7);
    this.carTravel += this.carSpeed * dt;
    this.carWheels.forEach((wheel) => { wheel.rotation.x -= this.carSpeed * dt / 0.46; });
    return this.carTravel;
  }

  private buildParticles() {
    const dustGeo = new THREE.BufferGeometry();
    const points = new Float32Array(240 * 3);
    for (let i = 0; i < 240; i++) { points[i * 3] = (Math.random() - 0.5) * 80; points[i * 3 + 1] = Math.random() * 8; points[i * 3 + 2] = (Math.random() - 0.5) * 80; }
    dustGeo.setAttribute('position', new THREE.BufferAttribute(points, 3));
    this.dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0x8195a5, size: 0.06, transparent: true, opacity: 0.3, depthWrite: false }));
    this.group.add(this.dust);
    const sparkGeo = new THREE.BufferGeometry(); sparkGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(36 * 3), 3));
    this.sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ color: 0xffcc63, size: 0.13, transparent: true, opacity: 0 }));
    this.sparks.position.copy(this.generatorPosition).add(new THREE.Vector3(0, 2.5, 0)); this.group.add(this.sparks);
  }

  private buildObjectiveBeacon() {
    const ringMaterial = new THREE.MeshBasicMaterial({ color: 0x6cebf2, transparent: true, opacity: 0.78, depthTest: false, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.055, 8, 24), ringMaterial); ring.rotation.x = Math.PI / 2;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.12, 3.4, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0x58dce8, transparent: true, opacity: 0.22, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
    beam.position.y = 1.75; this.objectiveBeacon.add(ring, beam); this.objectiveBeacon.visible = false; this.objectiveBeacon.renderOrder = 20; this.group.add(this.objectiveBeacon);
  }

  setObjectiveTarget(position?: THREE.Vector3) {
    this.objectiveBeacon.visible = !!position;
    if (position) this.objectiveBeacon.position.set(position.x, 0.18, position.z);
  }

  activatePower() {
    this.powerOn = true; this.powerActivatedAt = this.elapsed; this.sparkLife = 4;
    const gate = this.interactables.find((i) => i.kind === 'gate')!;
    gate.prompt = '[E] Open Evacuation Gate';
    const panel = gate.object as THREE.Mesh;
    (panel.material as THREE.MeshStandardMaterial).emissive.setHex(0x2f8a76);
    (panel.userData.light as THREE.PointLight).intensity = 4;
    this.exposure.lights.push({ id: 'safe-zone', position: new THREE.Vector3(0, 2, -42), radius: 12, strength: 1, enabled: true, safe: true });
  }

  openGate() {
    const panel = this.interactables.find((i) => i.kind === 'gate')!.object;
    panel.userData.gate.userData.open = true;
    if (this.gateCollider) { this.collisions.remove(this.gateCollider); this.gateCollider = undefined; }
  }

  update(dt: number) {
    this.elapsed += dt;
    this.interactables.forEach((item, index) => {
      if (!item.active || !['fuse', 'battery', 'medkit'].includes(item.kind)) return;
      item.object.rotation.y += dt * 1.2;
      item.object.position.y += Math.sin(this.elapsed * 2 + index) * dt * 0.035;
    });
    if (this.powerOn) this.streetLamps.forEach((lamp) => {
      const progress = THREE.MathUtils.clamp((this.elapsed - this.powerActivatedAt - lamp.delay) * 2, 0, 1);
      lamp.light.intensity = progress * (6.4 + Math.sin(this.elapsed * 13 + lamp.delay) * (progress < 0.95 ? 1.2 : 0.08));
      lamp.data.enabled = progress > 0.2;
      (lamp.bulb.material as THREE.MeshBasicMaterial).color.setHex(progress > 0.2 ? 0xffd293 : 0x3c3528);
    });
    const gateObj = (this.interactables.find((i) => i.kind === 'gate')!.object.userData.gate as THREE.Mesh);
    if (gateObj.userData.open) gateObj.position.y = Math.min(5.3, gateObj.position.y + dt * 2.3);
    const finalGateObj = (this.interactables.find((i) => i.kind === 'final-gate')!.object.userData.gate as THREE.Mesh);
    if (finalGateObj.userData.open) finalGateObj.position.y = Math.min(5.3, finalGateObj.position.y + dt * 2.3);
    this.dust.rotation.y += dt * 0.006;
    if (this.objectiveBeacon.visible) {
      this.objectiveBeacon.rotation.y += dt * 1.4;
      this.objectiveBeacon.children[0].position.y = Math.sin(this.elapsed * 2.4) * 0.12;
    }
    if (this.sparkLife > 0) {
      this.sparkLife -= dt; const a = this.sparks.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < a.count; i++) { a.setXYZ(i, (Math.random() - 0.5) * 3, Math.random() * 2 - 0.8, (Math.random() - 0.5) * 2); }
      a.needsUpdate = true; (this.sparks.material as THREE.PointsMaterial).opacity = Math.random() * 0.9;
    } else (this.sparks.material as THREE.PointsMaterial).opacity = 0;
  }
}
