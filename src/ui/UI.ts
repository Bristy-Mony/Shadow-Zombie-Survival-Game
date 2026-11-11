import { Player } from '../player/Player';
import { ObjectiveManager } from '../gameplay/ObjectiveManager';
import { GameState } from '../core/GameState';
import { Progression, SHOP_ITEMS, UpgradeId } from '../gameplay/Progression';

export class UI {
  readonly root: HTMLElement;
  readonly canvasHost: HTMLElement;
  private objective!: HTMLElement;
  private progress!: HTMLElement;
  private healthFill!: HTMLElement;
  private staminaFill!: HTMLElement;
  private batteryFill!: HTMLElement;
  private batteryText!: HTMLElement;
  private energyFill!: HTMLElement;
  private energyText!: HTMLElement;
  private coinText!: HTMLElement;
  private danger!: HTMLElement;
  private prompt!: HTMLElement;
  private toast!: HTMLElement;
  private damage!: HTMLElement;
  private lowHealth!: HTMLElement;
  private hud!: HTMLElement;
  private overlays!: HTMLElement;
  onStart?: () => void;
  onResume?: () => void;
  onRestart?: () => void;
  onMenu?: () => void;
  onPurchase?: (id: UpgradeId) => void;

  constructor() {
    this.root = document.querySelector('#game')!;
    this.root.innerHTML = `
      <div id="canvas-host"></div>
      <div class="grain"></div><div class="vignette"></div><div id="damage-flash"></div>
      <div id="hud" class="hidden">
        <section class="objective-panel"><span class="eyebrow">OBJECTIVE</span><strong id="objective">Find Power Fuses</strong><span id="progress">0 / 3</span></section>
        <div class="status-stack">
          <div class="status health"><span>HEALTH</span><b>100</b><div class="meter"><i></i></div></div>
          <div class="status stamina"><span>STAMINA</span><b>100</b><div class="meter"><i></i></div></div>
        </div>
        <div class="battery-panel"><span>FLASHLIGHT</span><strong id="battery-text">100%</strong><div class="meter"><i></i></div></div>
        <div class="weapon-panel"><span>LASER CELLS</span><strong id="energy-text">36 / 36</strong><div class="meter"><i></i></div></div>
        <div class="coin-panel"><span>COINS</span><strong id="coin-text">0</strong></div>
        <div id="danger" class="danger dim"><span>AMBIENT LIGHT</span><strong>DIM</strong></div>
        <div class="crosshair"><i></i><i></i></div>
        <div id="prompt"></div><div id="toast"></div><div id="low-health">CRITICAL CONDITION</div>
      </div>
      <div id="overlays">
        <main id="menu" class="screen active">
          <div class="menu-fog"></div><div class="title-rule"></div>
          <p class="kicker">A LIGHT-BASED SURVIVAL GAME</p><h1>SHADOW<br><em>ZOMBIE</em></h1>
          <p class="tagline">Light the way. <strong>Pull the trigger.</strong></p>
          <button data-action="start">START GAME <span>→</span></button><button data-action="shop">SURVIVOR SHOP</button><button class="ghost" data-action="how">HOW TO PLAY</button>
          <p class="hint">HEADPHONES RECOMMENDED · DESKTOP / KEYBOARD + MOUSE</p>
        </main>
        <section id="how" class="screen panel-screen">
          <div class="modal"><p class="kicker">FIELD BRIEFING</p><h2>THE DARKNESS HUNTS</h2>
            <p>Your flashlight freezes only the infected caught inside its beam; move the light away and they immediately resume the hunt. Aim the laser weapon and fire; headshots deal extra damage. Complete four staged objectives, enter the extraction vehicle, and drive to safety.</p>
            <div class="controls"><span><kbd>WASD</kbd> Move</span><span><kbd>MOUSE</kbd> Look / Fire</span><span><kbd>SHIFT</kbd> Sprint</span><span><kbd>F</kbd> Flashlight</span><span><kbd>E</kbd> Interact</span><span><kbd>ESC</kbd> Pause</span></div>
            <button data-action="back">BACK</button>
          </div>
        </section>
        <section id="shop" class="screen panel-screen"><div class="modal shop-modal"><p class="kicker">SURVIVOR ARMORY</p><h2>PERMANENT UPGRADES</h2><div class="shop-balance">AVAILABLE COINS <b data-shop-coins>0</b></div><div class="shop-grid">${SHOP_ITEMS.map((item) => `<article data-shop-item="${item.id}"><h3>${item.name}</h3><p>${item.description}</p><button data-buy="${item.id}">${item.price} COINS</button></article>`).join('')}</div><button class="ghost" data-action="back">BACK</button></div></section>
        <section id="pause" class="screen panel-screen"><div class="modal compact"><p class="kicker">SYSTEM HALTED</p><h2>PAUSED</h2><button data-action="resume">RESUME</button><button class="ghost" data-action="restart">RESTART</button><button class="ghost" data-action="menu">MAIN MENU</button></div></section>
        <section id="death" class="screen panel-screen red"><div class="modal"><p class="kicker">SIGNAL LOST</p><h2>YOU WERE CONSUMED<br>BY THE DARKNESS</h2><p>The district remembers every light that went out.</p><button data-action="restart">RESTART</button><button class="ghost" data-action="menu">MAIN MENU</button></div></section>
        <section id="victory" class="screen panel-screen victory"><div class="modal"><p class="kicker">EVACUATION COMPLETE</p><h2>YOU ESCAPED<br>THE SHADOW ZONE</h2><div id="stats" class="stats"></div><button data-action="restart">PLAY AGAIN</button><button class="ghost" data-action="menu">MAIN MENU</button></div></section>
        <div id="tutorial"><span><kbd>WASD</kbd> MOVE</span><span><kbd>MOUSE</kbd> AIM</span><span><kbd>LMB</kbd> FIRE</span><span><kbd>F</kbd> FLASHLIGHT</span><span><kbd>E</kbd> INTERACT</span><b>FLASHLIGHT FREEZES · LASER KILLS</b></div>
      </div>
      <div class="mobile-warning">Shadow Zombie is designed for keyboard and mouse.<br>For the best experience, use a desktop browser.</div>`;
    this.canvasHost = this.root.querySelector('#canvas-host')!;
    this.objective = this.root.querySelector('#objective')!; this.progress = this.root.querySelector('#progress')!;
    this.healthFill = this.root.querySelector('.health i')!; this.staminaFill = this.root.querySelector('.stamina i')!; this.batteryFill = this.root.querySelector('.battery-panel i')!;
    this.batteryText = this.root.querySelector('#battery-text')!; this.danger = this.root.querySelector('#danger')!; this.prompt = this.root.querySelector('#prompt')!;
    this.energyFill = this.root.querySelector('.weapon-panel i')!; this.energyText = this.root.querySelector('#energy-text')!; this.coinText = this.root.querySelector('#coin-text')!;
    this.toast = this.root.querySelector('#toast')!; this.damage = this.root.querySelector('#damage-flash')!; this.lowHealth = this.root.querySelector('#low-health')!;
    this.hud = this.root.querySelector('#hud')!; this.overlays = this.root.querySelector('#overlays')!;
    this.bind();
  }

  private bind() {
    this.root.addEventListener('click', (event) => {
      const action = (event.target as HTMLElement).closest<HTMLElement>('[data-action]')?.dataset.action;
      const buy = (event.target as HTMLElement).closest<HTMLElement>('[data-buy]')?.dataset.buy as UpgradeId | undefined;
      if (buy) this.onPurchase?.(buy);
      if (action === 'start') this.onStart?.();
      if (action === 'how') this.showScreen('how');
      if (action === 'shop') this.showScreen('shop');
      if (action === 'back') this.showScreen('menu');
      if (action === 'resume') this.onResume?.();
      if (action === 'restart') this.onRestart?.();
      if (action === 'menu') this.onMenu?.();
    });
  }

  showScreen(id?: string) {
    this.root.querySelectorAll('.screen').forEach((screen) => screen.classList.remove('active'));
    if (id) this.root.querySelector(`#${id}`)?.classList.add('active');
  }

  setState(state: GameState) {
    this.hud.classList.toggle('hidden', state === GameState.MENU);
    if (state === GameState.MENU) this.showScreen('menu');
    else if (state === GameState.PAUSED) this.showScreen('pause');
    else if (state === GameState.GAME_OVER) this.showScreen('death');
    else if (state === GameState.VICTORY) this.showScreen('victory');
    else this.showScreen();
  }

  update(player: Player, objective: ObjectiveManager, exposure: number) {
    this.objective.textContent = objective.title; this.progress.textContent = objective.progress;
    this.healthFill.style.width = `${player.health / player.maxHealth * 100}%`; this.staminaFill.style.width = `${player.stamina}%`; this.batteryFill.style.width = `${player.battery}%`;
    this.energyFill.style.width = `${player.energy / player.maxEnergy * 100}%`; this.energyText.textContent = `${player.energy} / ${player.maxEnergy}`;
    (this.root.querySelector('.health b') as HTMLElement).textContent = `${Math.ceil(player.health)}`;
    (this.root.querySelector('.stamina b') as HTMLElement).textContent = `${Math.ceil(player.stamina)}`;
    this.batteryText.textContent = `${Math.ceil(player.battery)}%`;
    this.root.querySelector('.battery-panel')?.classList.toggle('warning', player.battery < 18);
    this.lowHealth.classList.toggle('visible', player.health < 26);
    const label = exposure > 0.62 ? 'LIGHT' : exposure > 0.32 ? 'DIM' : exposure > 0.14 ? 'DARK' : 'DANGER';
    this.danger.className = `danger ${label.toLowerCase()}`; this.danger.querySelector('strong')!.textContent = label;
  }

  updateProgression(progression: Progression) {
    this.coinText.textContent = `${progression.coins}`;
    this.root.querySelectorAll<HTMLElement>('[data-shop-coins]').forEach((element) => { element.textContent = `${progression.coins}`; });
    SHOP_ITEMS.forEach((item) => {
      const article = this.root.querySelector<HTMLElement>(`[data-shop-item="${item.id}"]`); const button = article?.querySelector<HTMLButtonElement>('button');
      if (!article || !button) return;
      const owned = progression.has(item.id); article.classList.toggle('owned', owned); button.disabled = owned || progression.coins < item.price;
      button.textContent = owned ? 'INSTALLED' : `${item.price} COINS`;
    });
  }

  showPrompt(text?: string) { this.prompt.textContent = text ?? ''; this.prompt.classList.toggle('visible', !!text); }
  notify(title: string, detail: string) {
    this.toast.innerHTML = `<strong>${title}</strong><span>${detail}</span>`; this.toast.classList.remove('show'); void this.toast.offsetWidth; this.toast.classList.add('show');
  }
  damageFlash() { this.damage.classList.remove('hit'); void this.damage.offsetWidth; this.damage.classList.add('hit'); }
  shotFeedback(hit: boolean, headshot = false) {
    const crosshair = this.root.querySelector('.crosshair')!;
    crosshair.className = `crosshair firing${hit ? ' confirmed' : ''}${headshot ? ' headshot' : ''}`;
    window.setTimeout(() => { crosshair.className = 'crosshair'; }, 120);
  }
  showTutorial() { const el = this.root.querySelector('#tutorial')!; el.classList.add('show'); window.setTimeout(() => el.classList.remove('show'), 6200); }
  setVictoryStats(time: number, player: Player, stunned: number) {
    const min = Math.floor(time / 60); const sec = Math.floor(time % 60).toString().padStart(2, '0');
    this.root.querySelector('#stats')!.innerHTML = `<span><small>TIME</small><b>${min}:${sec}</b></span><span><small>HEALTH</small><b>${Math.ceil(player.health)}</b></span><span><small>CELLS</small><b>${player.energy}</b></span><span><small>STUNS</small><b>${stunned}</b></span>`;
  }
}
