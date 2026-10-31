import { afterEach, describe, expect, it, vi } from "vitest";
import { errorMessage, log } from "./log.js";

describe("errorMessage", () => {
  it("returns the message of an Error", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom");
  });

  it("stringifies non-Error values", () => {
    expect(errorMessage("boom")).toBe("boom");
    expect(errorMessage(42)).toBe("42");
  });
});

describe("log", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes one JSON line on the console method of the level", () => {
    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);

    log("warn", "something_happened", { count: 2 });

    expect(warnSpy).toHaveBeenCalledWith(
      '{"level":"warn","event":"something_happened","count":2}',
    );
  });
});
