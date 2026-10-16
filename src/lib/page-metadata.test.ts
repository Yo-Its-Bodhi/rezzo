import { describe, expect, it } from "vitest";
import { baseMetadata, reservationMetadata } from "./page-metadata";

describe("server-derived demo indexing metadata", () => {
  it.each([
    {},
    { REZZO_DEMO_MODE: "true" },
    { REZZO_DEMO_PREVIEW: "true" },
  ])("preserves the original production metadata without both flags (%j)", (flags) => {
    const metadata = reservationMetadata({ NODE_ENV: "production", ...flags });
    expect(metadata).toBe(baseMetadata);
    expect(metadata.robots).toBeUndefined();
  });

  it("excludes an explicitly opted-in production demo while preserving the restaurant identity", () => {
    const metadata = reservationMetadata({
      NODE_ENV: "production",
      REZZO_DEMO_MODE: "true",
      REZZO_DEMO_PREVIEW: "true",
    });
    expect(metadata).toEqual({
      ...baseMetadata,
      robots: { index: false, follow: false, noarchive: true },
    });
    expect(baseMetadata.robots).toBeUndefined();
  });

  it("also excludes the existing local development demo", () => {
    expect(
      reservationMetadata({ NODE_ENV: "development", REZZO_DEMO_MODE: "true" })
        .robots,
    ).toEqual({ index: false, follow: false, noarchive: true });
  });
});
