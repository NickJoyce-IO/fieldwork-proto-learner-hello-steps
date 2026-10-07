import { watch as watchDir, type FSWatcher } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { loadProject, stepDir, stepsFolder, type Project, type StepDefinition } from "../project.ts";
import { describeStepTests, runStepTests, stepTestsPass } from "../run-step-tests.ts";
import { typeCheck, typeErrorsForStep, type TypeDiagnostic } from "../type-check.ts";

/**
 * Runs the Project's Steps in order, stopping at the Current Step, or with
 * `--step N` only Step N. Prints the result; returns the exit code. With
 * `--watch`, reruns on every change to Learner Code or Step folders instead
 * of exiting.
 */
export async function testCommand(args: string[]): Promise<number> {
  let values;
  try {
    ({ values } = parseArgs({ args, options: { step: { type: "string" }, watch: { type: "boolean" } } }));
  } catch (error) {
    console.error(`${(error as Error).message}\n\n${usage}`);
    return 2;
  }

  const project = loadProject(process.cwd());
  let stepIndex: number | undefined;
  if (values.step !== undefined) {
    stepIndex = parseStepNumber(values.step, project);
    if (stepIndex === undefined) {
      console.error(`Invalid Step number "${values.step}": this Project has Steps 1 to ${project.steps.length}`);
      return 2;
    }
  }

  const runAndPrint = async () => {
    const report = stepIndex === undefined ? await runInOrder(project) : await runOne(project, stepIndex);
    console.log(report.lines.join("\n"));
    return report.exitCode;
  };
  return values.watch ? watch(project, runAndPrint) : runAndPrint();
}

const usage = "Usage: fieldwork test [--step N] [--watch]";

/** The zero-based index of the Step a Learner numbered from 1, if the Project has it. */
function parseStepNumber(value: string, project: Project): number | undefined {
  if (!/^\d+$/.test(value)) return undefined;
  const number = Number(value);
  return number >= 1 && number <= project.steps.length ? number - 1 : undefined;
}

/** The folders whose changes trigger a rerun: Learner Code and Step folders. */
const watchedFolders = ["src", stepsFolder];

/**
 * Runs, then reruns after every change until the process is stopped. Changes
 * arriving mid-run queue one more run. Resolves only if watching fails.
 */
async function watch(project: Project, runAndPrint: () => Promise<number>): Promise<number> {
  let running = false;
  let rerunQueued = false;
  let stopped = false;
  let debounce: NodeJS.Timeout | undefined;

  const runAndWait = async (): Promise<void> => {
    running = true;
    try {
      if (process.stdout.isTTY) console.clear();
      await runAndPrint();
    } catch (error) {
      // e.g. a Step folder renamed mid-edit: report it and wait for the next change.
      console.error(`Could not run the Steps: ${(error as Error).message}`);
    } finally {
      running = false;
    }
    if (stopped) return;
    console.log(`\nWatching for changes in ${watchedFolders.map((folder) => `${folder}/`).join(" and ")} (Ctrl+C to stop)`);
    if (rerunQueued) {
      rerunQueued = false;
      await runAndWait();
    }
  };

  const onChange = () => {
    clearTimeout(debounce);
    // Editors often save a file in several writes; wait for them to settle.
    debounce = setTimeout(() => {
      if (running) rerunQueued = true;
      else void runAndWait();
    }, 100);
  };

  return new Promise((resolve) => {
    const watchers: FSWatcher[] = [];
    const fail = (error: Error) => {
      stopped = true;
      watchers.forEach((watcher) => watcher.close());
      clearTimeout(debounce);
      console.error(`Stopped watching: ${error.message}`);
      resolve(1);
    };
    try {
      for (const folder of watchedFolders) {
        watchers.push(watchDir(join(project.dir, folder), { recursive: true }, onChange).on("error", fail));
      }
    } catch (error) {
      fail(error as Error);
      return;
    }
    void runAndWait();
  });
}

interface Report {
  lines: string[];
  exitCode: number;
}

interface StepResult {
  passed: boolean;
  /** The Step's status line, e.g. `✘ Step 2: Say goodbye (1/2 tests passing)`. */
  line: string;
  typeErrors: TypeDiagnostic[];
}

async function runInOrder(project: Project): Promise<Report> {
  const allTypeErrors = typeCheck(project);
  const lines: string[] = [];
  let current: StepResult | undefined;

  for (const [index, step] of project.steps.entries()) {
    if (current !== undefined) {
      lines.push(`🔒 ${stepLabel(index, step)}`);
      continue;
    }
    const result = await checkStep(project, index, allTypeErrors);
    lines.push(result.line);
    if (!result.passed) current = result;
  }

  if (current === undefined) {
    lines.push("", `All ${project.steps.length} Steps passing`);
  } else {
    lines.push(...typeErrorLines(current));
  }
  return { lines, exitCode: current === undefined ? 0 : 1 };
}

async function runOne(project: Project, index: number): Promise<Report> {
  const result = await checkStep(project, index, typeCheck(project));
  return { lines: [result.line, ...typeErrorLines(result)], exitCode: result.passed ? 0 : 1 };
}

/** Runs one Step's tests and counts the type errors against it. */
async function checkStep(project: Project, index: number, allTypeErrors: TypeDiagnostic[]): Promise<StepResult> {
  const step = project.steps[index]!;
  const label = stepLabel(index, step);
  const results = await runStepTests(stepDir(project, step));
  const typeErrors = typeErrorsForStep(allTypeErrors, step);
  // Monorepo `verify` counts these "✔ Step" lines (tooling/src/tracks.ts).
  if (stepTestsPass(results) && typeErrors.length === 0) return { passed: true, line: `✔ ${label}`, typeErrors };

  const details = [describeStepTests(results)];
  if (typeErrors.length > 0) details.push(`${typeErrors.length} type error${typeErrors.length === 1 ? "" : "s"}`);
  return { passed: false, line: `✘ ${label} (${details.filter(Boolean).join(", ")})`, typeErrors };
}

function typeErrorLines({ typeErrors }: StepResult): string[] {
  if (typeErrors.length === 0) return [];
  return ["", "Type errors:", ...typeErrors.map(({ text }) => `  ${text}`)];
}

function stepLabel(index: number, step: StepDefinition): string {
  return `Step ${index + 1}: ${step.title}`;
}
