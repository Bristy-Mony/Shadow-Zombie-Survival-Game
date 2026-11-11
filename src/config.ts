export const CONFIG = {
  player: {
    walkSpeed: 5.2,
    sprintSpeed: 8.2,
    radius: 0.5,
    staminaDrain: 25,
    staminaRegen: 18,
    health: 100,
    invulnerability: 0.85,
  },
  flashlight: {
    batteryDrain: 1.15,
    range: 28,
    angle: Math.PI / 6,
    stunExposure: 0.72,
    stunTime: 1.25,
  },
  enemy: {
    normalSpeed: 2.25,
    shadowSpeed: 3.25,
    attackRange: 1.4,
    normalDamage: 12,
    shadowDamage: 21,
    population: 7,
  },
  world: {
    size: 84,
    fogDensity: 0.013,
  },
} as const;

export const COLORS = {
  night: 0x07111b,
  fog: 0x0b1722,
  moon: 0x8aa7c7,
  warm: 0xffb45f,
  emergency: 0xff3b2f,
  cyan: 0x72e6ff,
  zombie: 0x65715f,
  shadow: 0x090b11,
};
