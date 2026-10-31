type LogLevel = "error" | "warn";

export const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export const log = (
  level: LogLevel,
  event: string,
  details: Record<string, string | number> = {},
): void => {
  console[level](JSON.stringify({ level, event, ...details }));
};
