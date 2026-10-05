#!/usr/bin/env node
import { runCli } from "./run-cli.js";

// The reader closed stdout early (for example `oid progress status | head -1`): stop quietly.
process.stdout.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code !== "EPIPE") throw error;
  process.exit(0);
});

process.exitCode = runCli(process.argv.slice(2), {
  cwd: process.cwd(),
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
});
