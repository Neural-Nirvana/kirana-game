import './style.css';
import { GameController } from './game/GameController';

// Initialize the game when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const path = window.location.pathname;
  if (path.startsWith('/lab')) {
    void import('./lab/DatasetLabApp').then(({ DatasetLabApp }) => {
      const lab = new DatasetLabApp('app');
      void lab.start();
    });
    return;
  }
  if (path.startsWith('/play')) {
    const game = new GameController();
    game.start();
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

  void import('./about/AboutPage').then(({ AboutPage }) => {
    const about = new AboutPage('app');
    about.start();
  });
});
