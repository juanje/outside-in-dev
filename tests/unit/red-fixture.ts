/** The feature the Red-base tests work on. */
export const FEATURE = "FR-X-01";

/** The details of a Red checkpoint of the feature. */
export const RED = { step: "tdd_red", feature: FEATURE, verify: { kind: "red", target: "tests/a.test.ts > adds" }, external: false, date: new Date("2026-10-06T12:00:00Z") };

/** Whether a path of the temporary project is source code. */
export const isSource = (name: string): boolean => name.startsWith("src/");
