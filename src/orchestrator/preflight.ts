import { NEWLINE } from "../artifacts/lines.js";
import { ProgressError } from "../artifacts/progress.js";
import { checkSetup, type DoctorServices } from "../commands/doctor.js";
import { formatCheck, STATUS } from "../commands/setup-checks.js";

/** The checks of `oid doctor`, without a call to any provider, before a run starts or resumes: refuses, naming each check that is not ok and its fix. Without services there is nothing to check against (a run in a test, with its own agent). */
export async function requireSetup(cwd: string, preflight: DoctorServices | undefined): Promise<void> {
  if (preflight === undefined) return;
  const problems = (await checkSetup(cwd, preflight, { connect: false })).filter(({ status }) => status !== STATUS.ok);
  if (problems.length > 0) throw new ProgressError(`oid cannot run yet; oid doctor reports:${NEWLINE}${problems.map((check) => `  ${formatCheck(check)}`).join(NEWLINE)}`);
}
