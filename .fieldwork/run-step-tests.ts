import { readdirSync } from "node:fs";
import { join } from "node:path";
import { run } from "node:test";

export interface StepTestResults {
  testFiles: number;
  /** Test files that threw before their tests could run, e.g. importing something not written yet. */
  failedToLoad: number;
  passed: number;
  total: number;
}

/** Runs one Step's tests with node:test and counts passing tests (suites excluded). */
export async function runStepTests(dir: string): Promise<StepTestResults> {
  const files = readdirSync(dir)
    .filter((name) => name.endsWith(".test.ts"))
    .map((name) => join(dir, name));
  const results: StepTestResults = { testFiles: files.length, failedToLoad: 0, passed: 0, total: 0 };
  if (files.length === 0) return results;

  for await (const event of run({ files, cwd: dir })) {
    if (event.type !== "test:pass" && event.type !== "test:fail") continue;
    if (event.data.details.type === "suite") continue;
    // node:test reports a whole file as one "test" named after the file when
    // it has no tests of its own (a type-only Step: not counted) or when it
    // failed to load (counted separately, since its tests never ran).
    if (event.data.name === event.data.file) {
      if (event.type === "test:fail") results.failedToLoad += 1;
      continue;
    }
    results.total += 1;
    if (event.type === "test:pass") results.passed += 1;
  }
  return results;
}

export function stepTestsPass(results: StepTestResults): boolean {
  return results.testFiles > 0 && results.failedToLoad === 0 && results.passed === results.total;
}

export function describeStepTests(results: StepTestResults): string | undefined {
  if (results.testFiles === 0) return "no tests found";
  if (results.failedToLoad > 0) return "tests failed to load";
  if (results.total === 0) return undefined;
  return `${results.passed}/${results.total} tests passing`;
}
