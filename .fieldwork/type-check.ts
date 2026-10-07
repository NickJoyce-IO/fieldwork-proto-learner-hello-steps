import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join, sep } from "node:path";
import { isStepContent, stepPath, type Project, type StepDefinition } from "./project.ts";

export interface TypeDiagnostic {
  /** Path relative to the Project root, with forward slashes; absent for global errors. */
  file?: string;
  /** The diagnostic as tsc printed it, including any continuation lines. */
  text: string;
}

/** Type-checks the whole Project once with the Project's own `tsc` and tsconfig. */
export function typeCheck(project: Project): TypeDiagnostic[] {
  const result = spawnSync(
    process.execPath,
    [resolveTsc(project.dir), "--noEmit", "-p", join(project.dir, "tsconfig.json"), "--pretty", "false"],
    { cwd: project.dir, encoding: "utf8" },
  );
  if (result.error) throw result.error;
  const diagnostics = parseDiagnostics(result.stdout);
  // A failing tsc with nothing we recognise (a crash, an unexpected format)
  // must not read as "no type errors".
  if (result.status !== 0 && diagnostics.length === 0) {
    return [{ text: `tsc exited with code ${result.status}:\n${result.stdout}${result.stderr}`.trimEnd() }];
  }
  return diagnostics;
}

/**
 * The type errors that count against a Step: errors in Learner Code (and
 * anything else outside Step folders) count against every Step; errors inside
 * a Step's folder count only against that Step.
 */
export function typeErrorsForStep(diagnostics: TypeDiagnostic[], step: StepDefinition): TypeDiagnostic[] {
  const ownFolder = `${stepPath(step)}/`;
  return diagnostics.filter(
    ({ file }) => file === undefined || !isStepContent(file) || file.startsWith(ownFolder),
  );
}

function resolveTsc(projectDir: string): string {
  const require = createRequire(join(projectDir, "package.json"));
  return join(dirname(require.resolve("typescript/package.json")), "bin", "tsc");
}

const diagnosticStart = /^(?:(?<file>.+?)\(\d+,\d+\): )?error TS\d+:/;

function parseDiagnostics(output: string): TypeDiagnostic[] {
  const diagnostics: TypeDiagnostic[] = [];
  for (const line of output.split(/\r?\n/)) {
    const match = diagnosticStart.exec(line);
    if (match) {
      const file = match.groups?.file?.split(sep).join("/");
      diagnostics.push(file === undefined ? { text: line } : { file, text: line });
    } else if (line.startsWith(" ") && diagnostics.length > 0) {
      diagnostics[diagnostics.length - 1]!.text += `\n${line}`;
    }
  }
  return diagnostics;
}
