import './style.css';
import { GameController } from './game/GameController';

// Initialize the game when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  if (window.location.pathname.startsWith('/arena')) {
    void import('./arena/ArenaApp').then(({ ArenaApp }) => {
      const arena = new ArenaApp('app');
      void arena.start();
    });
    return;
  }

  const game = new GameController();
  game.start();
});
