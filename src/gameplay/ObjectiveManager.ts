export type ObjectiveStage = 'FUSES' | 'GENERATOR' | 'GATE_ONE' | 'PURGE' | 'RELAY' | 'FINAL_GATE' | 'CAR' | 'DRIVE' | 'ESCAPED';

export class ObjectiveManager {
  stage: ObjectiveStage = 'FUSES';
  fuses = 0;
  kills = 0;
  requiredKills = 3;
  driveDistance = 0;
  readonly driveTarget = 42;
  onUpdate?: (title: string, detail: string) => void;

  get level() {
    if (this.stage === 'FUSES' || this.stage === 'GENERATOR' || this.stage === 'GATE_ONE') return 1;
    if (this.stage === 'PURGE') return 2;
    if (this.stage === 'RELAY') return 3;
    if (this.stage === 'FINAL_GATE' || this.stage === 'CAR') return 4;
    return 5;
  }

  get title() {
    if (this.stage === 'FUSES') return 'Level 1 · Find Power Fuses';
    if (this.stage === 'GENERATOR') return 'Level 1 · Restore Generator';
    if (this.stage === 'GATE_ONE') return 'Level 1 · Open Checkpoint Gate';
    if (this.stage === 'PURGE') return 'Level 2 · Clear the Infected';
    if (this.stage === 'RELAY') return 'Level 3 · Activate Extraction Relay';
    if (this.stage === 'FINAL_GATE') return 'Level 4 · Cross Final Gate';
    if (this.stage === 'CAR') return 'Level 4 · Enter Escape Vehicle';
    if (this.stage === 'DRIVE') return 'Level 5 · Drive to Safety';
    return 'Evacuation Complete';
  }
  get progress() {
    if (this.stage === 'FUSES') return `${this.fuses} / 3`;
    if (this.stage === 'PURGE') return `${this.kills} / ${this.requiredKills}`;
    if (this.stage === 'DRIVE') return `${Math.min(100, Math.round(this.driveDistance / this.driveTarget * 100))}%`;
    return '';
  }

  collectFuse() {
    if (this.stage !== 'FUSES') return;
    this.fuses = Math.min(3, this.fuses + 1);
    if (this.fuses === 3) { this.stage = 'GENERATOR'; this.onUpdate?.('LEVEL 1 · OBJECTIVE UPDATED', 'Take the fuses to the central generator'); }
    else this.onUpdate?.('POWER FUSE RECOVERED', `${this.fuses} of 3 collected`);
  }

  restorePower() { this.stage = 'GATE_ONE'; this.onUpdate?.('POWER RESTORED', 'Open the checkpoint gate'); }

  beginPurge(aliveEnemies: number) {
    if (aliveEnemies <= 0) { this.stage = 'RELAY'; this.onUpdate?.('LEVEL 3 · BLACKOUT', 'Push forward and activate the extraction relay'); return; }
    this.stage = 'PURGE'; this.kills = 0; this.requiredKills = Math.min(3, aliveEnemies);
    this.onUpdate?.('LEVEL 2 · CONTAINMENT', `Eliminate ${this.requiredKills} infected to secure the route`);
  }

  recordKill() {
    if (this.stage !== 'PURGE') return false;
    this.kills = Math.min(this.requiredKills, this.kills + 1);
    if (this.kills >= this.requiredKills) {
      this.stage = 'RELAY'; this.onUpdate?.('LEVEL 3 · BLACKOUT', 'Push forward and activate the extraction relay');
      return true;
    } else this.onUpdate?.('INFECTED NEUTRALIZED', `${this.kills} of ${this.requiredKills} eliminated`);
    return false;
  }

  activateRelay() { if (this.stage === 'RELAY') { this.stage = 'FINAL_GATE'; this.onUpdate?.('FINAL ROUTE OPEN', 'Cross the evacuation gate and reach the vehicle'); } }
  reachVehicle() { if (this.stage === 'FINAL_GATE') { this.stage = 'CAR'; this.onUpdate?.('LEVEL 4 · EXTRACTION', 'Enter the armored escape vehicle'); } }
  enterVehicle() { if (this.stage === 'CAR') { this.stage = 'DRIVE'; this.onUpdate?.('DRIVE TO SAFETY', 'W accelerate · A/D steer'); } }
  setDriveDistance(distance: number) { this.driveDistance = Math.max(this.driveDistance, distance); }
  escape() { this.stage = 'ESCAPED'; }
}
