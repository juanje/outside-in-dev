import { Given } from "@cucumber/cucumber";
import type { OidWorld } from "../support/world.js";

Given("a SPEC.md containing:", function (this: OidWorld, content: string) {
  this.write("SPEC.md", content.endsWith("\n") ? content : `${content}\n`);
});
