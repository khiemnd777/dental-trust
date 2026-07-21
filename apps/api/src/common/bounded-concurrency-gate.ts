export class ConcurrencyQueueFullError extends Error {
  constructor() {
    super('The bounded concurrency queue is full');
    this.name = 'ConcurrencyQueueFullError';
  }
}

type Release = () => void;

export class BoundedConcurrencyGate {
  private active = 0;
  private readonly waiters: ((release: Release) => void)[] = [];

  constructor(
    private readonly concurrency: number,
    private readonly maximumQueueLength: number,
  ) {
    if (!Number.isInteger(concurrency) || concurrency < 1) {
      throw new TypeError('Concurrency must be a positive integer');
    }
    if (!Number.isInteger(maximumQueueLength) || maximumQueueLength < 0) {
      throw new TypeError('Maximum queue length must be a non-negative integer');
    }
  }

  get activeCount(): number {
    return this.active;
  }

  get queuedCount(): number {
    return this.waiters.length;
  }

  async run<T>(operation: () => Promise<T>): Promise<T> {
    const release = await this.acquire();
    try {
      return await operation();
    } finally {
      release();
    }
  }

  private acquire(): Promise<Release> {
    if (this.active < this.concurrency) {
      this.active += 1;
      return Promise.resolve(this.createRelease());
    }
    if (this.waiters.length >= this.maximumQueueLength) {
      return Promise.reject(new ConcurrencyQueueFullError());
    }
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  private createRelease(): Release {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const next = this.waiters.shift();
      if (next) {
        next(this.createRelease());
        return;
      }
      this.active -= 1;
    };
  }
}
