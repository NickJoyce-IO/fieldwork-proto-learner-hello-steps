import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface StepDefinition {
  id: string;
  title: string;
  /**
   * A check the runner makes itself instead of running the Step's tests:
   * "main-ruleset" is Step 0, which asks GitHub whether main is protected.
   */
  check?: "main-ruleset";
}

export interface Project {
  dir: string;
  name: string;
  version: string;
  steps: StepDefinition[];
}

/** Reads a Project's metadata (fieldwork.json) from its root directory. */
export function loadProject(dir: string): Project {
  const metadata = JSON.parse(readFileSync(join(dir, "fieldwork.json"), "utf8")) as Omit<Project, "dir">;
  for (const { id, check } of metadata.steps) {
    if (check !== undefined && check !== "main-ruleset") throw new Error(`Step ${id} has an unknown check "${check}" in fieldwork.json`);
  }
  return { dir, name: metadata.name, version: metadata.version, steps: metadata.steps };
}

/** The folder, relative to the Project root, holding every Step's Project Content. */
export const stepsFolder = "steps";

/** The folder, relative to the Project root, holding Learner Code. */
export const learnerCodeFolder = "src";

/** Where this runner lives in a published Project, relative to its root. */
export const runnerFolder = ".fieldwork";

/** Where a Step's Project Content lives, relative to the Project root, with forward slashes. */
export function stepPath(step: StepDefinition): string {
  return `${stepsFolder}/${step.id}`;
}

/** True when a Project-relative path (forward slashes) is inside some Step's folder. */
export function isStepContent(path: string): boolean {
  return path.startsWith(`${stepsFolder}/`);
}

export function stepDir(project: Project, step: StepDefinition): string {
  return join(project.dir, stepPath(step));
}
