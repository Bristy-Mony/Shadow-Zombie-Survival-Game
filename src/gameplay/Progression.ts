export type UpgradeId = 'amplifier' | 'capacitor' | 'rapidCoil' | 'armor' | 'vitality' | 'scavenger';

export interface ShopItem {
  id: UpgradeId;
  name: string;
  description: string;
  price: number;
}

export const SHOP_ITEMS: ShopItem[] = [
  { id: 'amplifier', name: 'Overcharge Amplifier', description: '+10 laser damage', price: 35 },
  { id: 'capacitor', name: 'Expanded Cell Rack', description: '+18 maximum energy cells', price: 45 },
  { id: 'rapidCoil', name: 'Rapid Pulse Coil', description: '25% faster fire rate', price: 55 },
  { id: 'armor', name: 'Tactical Armor', description: '20% less bite damage', price: 65 },
  { id: 'vitality', name: 'Trauma Plating', description: '+25 maximum health', price: 75 },
  { id: 'scavenger', name: 'Scavenger Chip', description: 'Better loot and +1 coin per cache', price: 50 },
];

interface SaveData {
  coins: number;
  owned: UpgradeId[];
}

const SAVE_KEY = 'shadow-zombie-progression-v2';

export class Progression {
  coins = 0;
  private owned = new Set<UpgradeId>();

  constructor() {
    try {
      const data = JSON.parse(localStorage.getItem(SAVE_KEY) ?? '{}') as Partial<SaveData>;
      this.coins = Math.max(0, Math.floor(data.coins ?? 0));
      (data.owned ?? []).forEach((id) => { if (SHOP_ITEMS.some((item) => item.id === id)) this.owned.add(id); });
    } catch { /* A damaged save should never prevent the game from starting. */ }
  }

  has(id: UpgradeId) { return this.owned.has(id); }
  addCoins(amount: number) { this.coins += Math.max(0, Math.floor(amount)); this.save(); }
  purchase(id: UpgradeId) {
    const item = SHOP_ITEMS.find((candidate) => candidate.id === id);
    if (!item || this.has(id) || this.coins < item.price) return false;
    this.coins -= item.price; this.owned.add(id); this.save(); return true;
  }
  get effects() {
    return {
      damage: 34 + (this.has('amplifier') ? 10 : 0),
      maxEnergy: 36 + (this.has('capacitor') ? 18 : 0),
      fireCooldown: this.has('rapidCoil') ? 0.225 : 0.3,
      damageMultiplier: this.has('armor') ? 0.8 : 1,
      maxHealth: 100 + (this.has('vitality') ? 25 : 0),
      scavenger: this.has('scavenger'),
    };
  }
  snapshot() { return new Set(this.owned); }
  private save() { localStorage.setItem(SAVE_KEY, JSON.stringify({ coins: this.coins, owned: [...this.owned] } satisfies SaveData)); }
}
