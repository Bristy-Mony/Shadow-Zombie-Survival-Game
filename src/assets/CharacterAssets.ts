import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const ASSET_ROOT = `${import.meta.env.BASE_URL}assets/zombie-pack/`;
const PLAYER_URL = `${ASSET_ROOT}Characters_Matt.gltf`;
const ZOMBIE_URLS = [
  `${ASSET_ROOT}Zombie_Basic.gltf`,
  `${ASSET_ROOT}Zombie_Chubby.gltf`,
  `${ASSET_ROOT}Zombie_Ribcage.gltf`,
  `${ASSET_ROOT}Zombie_Arm.gltf`,
];

export interface CharacterInstance {
  root: THREE.Group;
  mixer: THREE.AnimationMixer;
  actions: Map<string, THREE.AnimationAction>;
}

interface CharacterOptions {
  role: 'player' | 'zombie';
  variant?: number;
  height?: number;
  shadow?: boolean;
}

export class CharacterAssets {
  private static loader = new GLTFLoader();
  private static libraries = new Map<string, Promise<{ model: THREE.Group; clips: THREE.AnimationClip[] }>>();

  private static loadLibrary(url: string) {
    let library = this.libraries.get(url);
    if (!library) {
      library = this.loader.loadAsync(url).then((asset) => ({ model: asset.scene, clips: asset.animations }));
      this.libraries.set(url, library);
    }
    return library;
  }

  static async create(options: CharacterOptions): Promise<CharacterInstance> {
    const url = options.role === 'player' ? PLAYER_URL : ZOMBIE_URLS[(options.variant ?? 0) % ZOMBIE_URLS.length];
    const { model, clips } = await this.loadLibrary(url);
    const clone = SkeletonUtils.clone(model) as THREE.Group;
    const wrapper = new THREE.Group();
    wrapper.name = options.role === 'player' ? 'Tactical survivor' : 'Animated zombie';
    wrapper.add(clone);

    clone.traverse((object) => {
      const mesh = object as THREE.SkinnedMesh;
      if (options.role === 'player' && ['Axe', 'Guitar', 'Knife', 'Pistol', 'Rifle', 'Shotgun', 'SMG', 'Spear', 'WoodenBat_Barbed', 'WoodenBat_Saw'].includes(object.name)) object.visible = false;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      if (options.shadow) {
        const source = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        const materials = source.map((material) => {
          const copy = material.clone() as THREE.MeshStandardMaterial;
          if (copy.color) copy.color.multiply(new THREE.Color(0x271535)).multiplyScalar(0.42);
          copy.roughness = 0.9;
          copy.emissive = new THREE.Color(0x17001d);
          copy.emissiveIntensity = 0.45;
          return copy;
        });
        mesh.material = Array.isArray(mesh.material) ? materials : materials[0];
      }
    });

    const bounds = new THREE.Box3().setFromObject(clone);
    const size = bounds.getSize(new THREE.Vector3());
    const scale = (options.height ?? 2.65) / Math.max(0.01, size.y);
    clone.scale.setScalar(scale);
    clone.position.y = -bounds.min.y * scale;
    clone.rotation.y = Math.PI;

    const mixer = new THREE.AnimationMixer(clone);
    const actions = new Map<string, THREE.AnimationAction>();
    clips.forEach((clip) => actions.set(clip.name, mixer.clipAction(clip)));
    return { root: wrapper, mixer, actions };
  }
}

export function crossFadeAction(
  actions: Map<string, THREE.AnimationAction>,
  current: THREE.AnimationAction | undefined,
  name: string,
  duration = 0.2,
) {
  const next = actions.get(name);
  if (!next || next === current) return current;
  next.enabled = true;
  next.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(duration).play();
  current?.fadeOut(duration);
  return next;
}
