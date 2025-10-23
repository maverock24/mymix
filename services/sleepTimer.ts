export type SleepTimerDuration = 5 | 10 | 15 | 30 | 45 | 60 | 90 | 120;

export interface SleepTimerState {
  isActive: boolean;
  remainingSeconds: number;
  totalSeconds: number;
}

export class SleepTimer {
  private static instance: SleepTimer;
  private timerId: NodeJS.Timeout | null = null;
  private endTime: number = 0; // Timestamp when timer should complete
  private totalSeconds: number = 0;
  private isActive: boolean = false;
  private callbacks: Set<(state: SleepTimerState) => void> = new Set();
  private onComplete: (() => void) | null = null;

  private constructor() {}

  static getInstance(): SleepTimer {
    if (!SleepTimer.instance) {
      SleepTimer.instance = new SleepTimer();
    }
    return SleepTimer.instance;
  }

  start(minutes: SleepTimerDuration, onComplete: () => void): void {
    this.stop(); // Clear any existing timer

    this.totalSeconds = minutes * 60;
    this.endTime = Date.now() + (minutes * 60 * 1000); // Calculate end timestamp
    this.isActive = true;
    this.onComplete = onComplete;

    this.notifyListeners();

    this.timerId = setInterval(() => {
      const remainingMs = this.endTime - Date.now();

      if (remainingMs <= 0) {
        this.complete();
      } else {
        this.notifyListeners();
      }
    }, 1000);
  }

  stop(): void {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    this.isActive = false;
    this.endTime = 0;
    this.totalSeconds = 0;
    this.notifyListeners();
  }

  private complete(): void {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    this.isActive = false;
    this.endTime = 0;

    if (this.onComplete) {
      this.onComplete();
    }

    this.notifyListeners();
  }

  addListener(callback: (state: SleepTimerState) => void): () => void {
    this.callbacks.add(callback);
    // Immediately call with current state
    callback(this.getState());

    // Return unsubscribe function
    return () => {
      this.callbacks.delete(callback);
    };
  }

  private notifyListeners(): void {
    const state = this.getState();
    this.callbacks.forEach(callback => callback(state));
  }

  getState(): SleepTimerState {
    let remainingSeconds = 0;
    if (this.isActive && this.endTime > 0) {
      const remainingMs = Math.max(0, this.endTime - Date.now());
      remainingSeconds = Math.ceil(remainingMs / 1000);
    }

    return {
      isActive: this.isActive,
      remainingSeconds: remainingSeconds,
      totalSeconds: this.totalSeconds,
    };
  }

  formatTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }
}
