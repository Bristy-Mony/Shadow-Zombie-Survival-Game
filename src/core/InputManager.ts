export class InputManager {
  readonly keys = new Set<string>();
  private pressed = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  pointerLocked = false;
  onUnlock?: () => void;

  constructor(private readonly element: HTMLElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    document.addEventListener('pointerlockchange', this.onLockChange);
    element.addEventListener('click', () => {
      if (!this.pointerLocked) element.requestPointerLock?.();
    });
  }

  private onKeyDown = (event: KeyboardEvent) => {
    if (!this.keys.has(event.code)) this.pressed.add(event.code);
    this.keys.add(event.code);
  };
  private onKeyUp = (event: KeyboardEvent) => this.keys.delete(event.code);
  private onMouseMove = (event: MouseEvent) => {
    if (this.pointerLocked) {
      this.mouseDX += event.movementX;
      this.mouseDY += event.movementY;
    }
  };
  private onMouseDown = (event: MouseEvent) => {
    const code = `Mouse${event.button}`;
    if (!this.keys.has(code)) this.pressed.add(code);
    this.keys.add(code);
  };
  private onMouseUp = (event: MouseEvent) => this.keys.delete(`Mouse${event.button}`);
  private onLockChange = () => {
    const wasLocked = this.pointerLocked;
    this.pointerLocked = document.pointerLockElement === this.element;
    if (wasLocked && !this.pointerLocked) this.onUnlock?.();
  };

  down(code: string) { return this.keys.has(code); }
  consume(code: string) {
    const value = this.pressed.has(code);
    this.pressed.delete(code);
    return value;
  }
  consumeMouse() {
    const result = { x: this.mouseDX, y: this.mouseDY };
    this.mouseDX = 0;
    this.mouseDY = 0;
    return result;
  }
  clear() {
    this.keys.clear();
    this.pressed.clear();
    this.consumeMouse();
  }
  destroy() {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    document.removeEventListener('pointerlockchange', this.onLockChange);
  }
}
