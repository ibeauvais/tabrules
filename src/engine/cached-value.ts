export interface CachedValue<T> {
  get(): Promise<T>;
  invalidate(): void;
}

export const createCachedValue = <T>(
  load: () => Promise<T>,
): CachedValue<T> => {
  let value: Promise<T> | undefined;

  return {
    get() {
      value ??= load().catch((error: unknown) => {
        value = undefined;
        throw error;
      });
      return value;
    },
    invalidate() {
      value = undefined;
    },
  };
};
