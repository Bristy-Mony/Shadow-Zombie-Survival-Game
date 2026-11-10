import './styles.css';
import './combat.css';
import { Game } from './core/Game';

let game: Game;
const boot = (startImmediately = false) => {
  game?.destroy();
  game = new Game();
  game.onRestartRequested = boot;
  if (startImmediately) game.begin();
};
boot();
