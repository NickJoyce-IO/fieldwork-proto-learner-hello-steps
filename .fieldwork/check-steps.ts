import { stepDir, type Project, type StepDefinition } from "./project.ts";
import { describeStepTests, runStepTests, stepTestsPass } from "./run-step-tests.ts";
import { typeCheck, typeErrorsForStep, type TypeDiagnostic } from "./type-check.ts";

export interface StepCheck {
  index: number;
  step: StepDefinition;
  passed: boolean;
  /** Why a failing Step fails, e.g. `1/2 tests passing, 1 type error`. */
  details?: string;
  typeErrors: TypeDiagnostic[];
}

/**
 * Checks the Project's Steps in order and stops at the first failing one, the
 * Current Step. Steps after it are locked and not checked, so they are absent
 * from the result.
 */
export async function checkStepsInOrder(project: Project): Promise<StepCheck[]> {
  const allTypeErrors = typeCheck(project);
  const checks: StepCheck[] = [];
  for (const index of project.steps.keys()) {
    const check = await checkStep(project, index, allTypeErrors);
    checks.push(check);
    if (!check.passed) break;
  }
  return checks;
}

/** Checks only the Step at `index`, whatever happens to the Steps before it. */
export async function checkOneStep(project: Project, index: number): Promise<StepCheck> {
  return checkStep(project, index, typeCheck(project));
}

/** Runs one Step's tests and counts the type errors against it. */
async function checkStep(project: Project, index: number, allTypeErrors: TypeDiagnostic[]): Promise<StepCheck> {
  const step = project.steps[index]!;
  const results = await runStepTests(stepDir(project, step));
  const typeErrors = typeErrorsForStep(allTypeErrors, step);
  if (stepTestsPass(results) && typeErrors.length === 0) return { index, step, passed: true, typeErrors };

  const details = [describeStepTests(results)];
  if (typeErrors.length > 0) details.push(`${typeErrors.length} type error${typeErrors.length === 1 ? "" : "s"}`);
  return { index, step, passed: false, details: details.filter(Boolean).join(", "), typeErrors };
}

export function stepLabel(index: number, step: StepDefinition): string {
  return `Step ${index + 1}: ${step.title}`;
}
