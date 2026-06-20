import type { DayLog } from '../types';

export class DataLogger {
  private logs: DayLog[] = [];

  addLog(log: DayLog) {
    this.logs.push(log);
  }

  getLogs(): DayLog[] {
    return this.logs;
  }

  exportToJSON(): string {
    return JSON.stringify({
      gameVersion: '1.0.0',
      episode: 'kirana-street-ep1',
      totalDays: this.logs.length,
      logs: this.logs,
    }, null, 2);
  }

  download(filename: string = 'kirana-game-log.json') {
    const data = this.exportToJSON();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  static replayLog(log: DayLog): void {
    console.log('Replaying day', log.day, log);
  }
}
