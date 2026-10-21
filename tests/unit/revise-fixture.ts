/** The feature the revise tests work on. */
export const ID = "FR-X-01";
export const FEATURE_FILE = "features/x.feature";

/** The text of a scenario of the feature file, with one step. */
export const scenario = (name: string, step = "Given a thing"): string => `  Scenario: ${name}\n    ${step}\n`;

/** The text of a feature file holding `scenarios`, tagged with the feature. */
export const featureText = (...scenarios: string[]): string => `@${ID}\nFeature: Alpha\n\n${scenarios.join("\n")}`;
