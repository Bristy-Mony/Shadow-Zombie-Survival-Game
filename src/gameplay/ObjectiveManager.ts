export type ObjectiveStage = 'FUSES' | 'GENERATOR' | 'GATE' | 'ESCAPED';

export class ObjectiveManager {
  stage: ObjectiveStage = 'FUSES';
  fuses = 0;
  onUpdate?: (title: string, detail: string) => void;

  get title() {
    if (this.stage === 'FUSES') return 'Find Power Fuses';
    if (this.stage === 'GENERATOR') return 'Restore the Generator';
    if (this.stage === 'GATE') return 'Reach the Evacuation Gate';
    return 'Escaped';
  }
  get progress() { return this.stage === 'FUSES' ? `${this.fuses} / 3` : ''; }

  collectFuse() {
    if (this.stage !== 'FUSES') return;
    this.fuses = Math.min(3, this.fuses + 1);
    if (this.fuses === 3) { this.stage = 'GENERATOR'; this.onUpdate?.('OBJECTIVE UPDATED', 'Take the fuses to the central generator'); }
    else this.onUpdate?.('POWER FUSE RECOVERED', `${this.fuses} of 3 collected`);
  }
  restorePower() { this.stage = 'GATE'; this.onUpdate?.('POWER RESTORED', 'Reach the Evacuation Gate'); }
  escape() { this.stage = 'ESCAPED'; }
}
