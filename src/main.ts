import './style.css';
import { GameController } from './game/GameController';

// Initialize the game when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const game = new GameController();
  game.start();
});
