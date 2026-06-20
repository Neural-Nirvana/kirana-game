import { spawn } from 'node:child_process';

const children = [
  spawn('npm', ['run', 'server:dev'], { stdio: 'inherit' }),
  spawn('npm', ['run', 'web:dev'], { stdio: 'inherit' }),
];

let shuttingDown = false;

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(code), 250);
}

for (const child of children) {
  child.on('exit', (code) => {
    if (!shuttingDown && code !== 0) shutdown(code ?? 1);
  });
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
