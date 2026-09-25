// vitest.config.ts
//
// Tests live in tests/ rather than beside the code they cover, and that is
// deliberate: tsconfig.json compiles everything under src/ during `npm run
// build`, and these tests read the repository off disk with node:fs. Keeping
// them outside src/ means the production build neither typechecks node APIs
// this project has no types for, nor ships a single byte of test code.

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],

    // Nothing here renders a component; these are checks on data and on
    // plain functions, so there is no reason to pay for a DOM.
    environment: "node",
  },
});
