import './style.css';
import { GameController } from './game/GameController';

// Initialize the game when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const path = window.location.pathname;
  if (path.startsWith('/about')) {
    void import('./about/AboutPage').then(({ AboutPage }) => {
      const about = new AboutPage('app');
      about.start();
    });
    return;
  }
  if (path.startsWith('/arena-2')) {
    void import('./arena/ArenaApp2').then(({ ArenaApp2 }) => {
      const arena = new ArenaApp2('app');
      void arena.start();
    });
    return;
  }
  if (path.startsWith('/arena')) {
    void import('./arena/ArenaApp').then(({ ArenaApp }) => {
      const arena = new ArenaApp('app');
      void arena.start();
    });
    return;
  }

  const game = new GameController();
  game.start();
});
