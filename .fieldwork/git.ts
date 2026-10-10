import { spawnSync } from "node:child_process";

/** Runs git in `cwd` and returns what it prints, or throws with git's own explanation. */
export function git(cwd: string, args: string[]): string {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed:\n${result.stderr.trim()}`);
  return result.stdout;
}
