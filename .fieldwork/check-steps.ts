import { connectGitHub, GitHubError } from "./github.ts";
import { missingProtection } from "./main-ruleset.ts";
import { stepDir, stepPath, type Project, type StepDefinition } from "./project.ts";
import { describeStepTests, runStepTests, stepTestsPass } from "./run-step-tests.ts";
import { typeCheck, typeErrorsForStep, type TypeDiagnostic } from "./type-check.ts";

export interface StepCheck {
  index: number;
  step: StepDefinition;
  passed: boolean;
  /** Why a failing Step fails, e.g. `1/2 tests passing, 1 type error`. */
  details?: string;
  typeErrors: TypeDiagnostic[];
  /** What to do next, for a failing Step whose tests cannot say it themselves. */
  guidance?: string;
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

/** Runs one Step's tests and counts the type errors against it, or runs its built-in check. */
async function checkStep(project: Project, index: number, allTypeErrors: TypeDiagnostic[]): Promise<StepCheck> {
  const step = project.steps[index]!;
  if (step.check === "main-ruleset") return checkMainRuleset(index, step);
  const results = await runStepTests(stepDir(project, step));
  const typeErrors = typeErrorsForStep(allTypeErrors, step);
  if (stepTestsPass(results) && typeErrors.length === 0) return { index, step, passed: true, typeErrors };

  const details = [describeStepTests(results)];
  if (typeErrors.length > 0) details.push(`${typeErrors.length} type error${typeErrors.length === 1 ? "" : "s"}`);
  return { index, step, passed: false, details: details.filter(Boolean).join(", "), typeErrors };
}

/**
 * Step 0: main must have a ruleset requiring a pull request and the Fieldwork
 * check. It is about the Learner's repository, not their code, so type errors
 * do not count against it.
 */
async function checkMainRuleset(index: number, step: StepDefinition): Promise<StepCheck> {
  let missing;
  try {
    missing = missingProtection(await (await connectGitHub()).branchProtection("main"));
  } catch (error) {
    // Only what the Learner can fix makes this their Current Step; anything
    // else means the Steps could not run at all.
    if (!(error instanceof GitHubError)) throw error;
    return { index, step, passed: false, details: "could not check main's rulesets", typeErrors: [], guidance: error.message };
  }
  if (missing === undefined) return { index, step, passed: true, typeErrors: [] };
  return {
    index,
    step,
    passed: false,
    details: `main does not require ${missing}`,
    typeErrors: [],
    guidance: `Follow ${stepPath(step)}/README.md to add a ruleset to main, then run the Steps again.`,
  };
}

export function stepLabel(index: number, step: StepDefinition): string {
  return `Step ${index + 1}: ${step.title}`;
}
