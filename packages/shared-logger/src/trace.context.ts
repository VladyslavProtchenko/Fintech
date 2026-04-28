import { AsyncLocalStorage } from 'async_hooks';

interface TraceStore {
  traceId: string;
}

const storage = new AsyncLocalStorage<TraceStore>();

export const TraceContext = {
  run<T>(traceId: string, fn: () => T): T {
    return storage.run({ traceId }, fn);
  },

  getTraceId(): string | undefined {
    return storage.getStore()?.traceId;
  },
};
