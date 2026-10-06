// cucumber-js runs parallel scenarios in worker threads, which do not inherit `--import tsx`:
// register the TypeScript loader in each worker before the steps are imported.
import { register } from "tsx/esm/api";

register();
