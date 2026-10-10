import { cpSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stepLabel } from "../check-steps.ts";
import { git } from "../git.ts";
import { connectGitHub } from "../github.ts";
import { learnerCodeFolder, loadProject, runnerFolder, stepPath, stepsFolder, type Project } from "../project.ts";
import { compareVersions, majorVersion } from "../version.ts";

/**
 * Folders the maintainers own outright. An update replaces them whole, so
 * files the newer version no longer has are removed too. Other published
 * files are overwritten one by one, which keeps any the Learner added beside
 * them, such as a workflow of their own.
 */
const replacedFolders = [stepsFolder, runnerFolder];

/**
 * Brings the latest published version of the Project into the Learner's
 * repository as a pull request, the way a dependency update arrives. The
 * version on main on GitHub is the one the Learner has (ADR-0001), so the
 * update branch starts there and is built in a temporary worktree: the
 * Learner's own checkout, unmerged branches and unsaved work are never
 * touched, and neither is Learner Code on the branch.
 */
export async function updateCommand(args: string[]): Promise<number> {
  if (args.some((arg) => arg !== "--major")) {
    console.error("Usage: fieldwork update [--major]");
    return 2;
  }
  const takeMajor = args.includes("--major");
  const repoDir = process.cwd();
  const workDir = mkdtempSync(join(tmpdir(), "fieldwork-update-"));
  try {
    const github = await connectGitHub();
    const latestDir = join(workDir, "latest");
    await github.downloadTemplate(latestDir);
    const latest = loadProject(latestDir);

    git(repoDir, ["fetch", "--quiet", "origin", "main"]);
    const updateDir = join(workDir, "update");
    git(repoDir, ["worktree", "add", "--quiet", "--detach", updateDir, "origin/main"]);
    try {
      const current = loadProject(updateDir);
      if (compareVersions(latest.version, current.version) <= 0) {
        console.log(`${current.name} is up to date at version ${current.version}.`);
        return 0;
      }

      const branch = `fieldwork/update-${latest.version}`;
      if (git(repoDir, ["ls-remote", "--heads", "origin", branch]).trim() !== "") {
        console.log(
          `The update to ${latest.version} is already waiting on the branch ${branch}. Review and merge its pull request (\`gh pr view ${branch}\` shows it), or delete the branch to make the update again.`,
        );
        return 0;
      }

      replaceProjectContent(latestDir, updateDir);
      git(updateDir, ["add", "--all"]);
      const changedPaths = git(updateDir, ["diff", "--cached", "--name-only"]).split("\n");
      const summary = describeUpdate(current, latest, changedPaths);
      const major = majorVersion(latest.version) > majorVersion(current.version);

      if (major && !takeMajor) {
        console.log(
          [
            `${latest.version} is a major update, so it was not made. It may change Steps you have already completed, so they could fail again until you rework them.`,
            "",
            summary,
            "",
            "To take it, run: npm run update -- --major",
          ].join("\n"),
        );
        return 0;
      }

      const title = `Update ${current.name} to ${latest.version}${major ? " (major)" : ""}`;
      git(updateDir, ["commit", "--quiet", "--message", title]);
      git(updateDir, ["push", "--quiet", "origin", `HEAD:refs/heads/${branch}`]);
      const url = await github.createPullRequest({
        head: branch,
        base: "main",
        title,
        body: pullRequestBody(summary, major),
      });
      console.log(`Opened a pull request to update ${current.name} to ${latest.version}: ${url}\n\n${summary}`);
      return 0;
    } finally {
      git(repoDir, ["worktree", "remove", "--force", updateDir]);
    }
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

/** Copies every published file except Learner Code over the Project in `updateDir`. */
function replaceProjectContent(latestDir: string, updateDir: string): void {
  for (const folder of replacedFolders) rmSync(join(updateDir, folder), { recursive: true, force: true });
  for (const entry of readdirSync(latestDir)) {
    if (entry === learnerCodeFolder || entry === ".git") continue;
    cpSync(join(latestDir, entry), join(updateDir, entry), { recursive: true });
  }
}

/** Which Steps the update adds, changes and removes, numbered as the Learner sees them. */
function describeUpdate(current: Project, latest: Project, changedPaths: string[]): string {
  const currentIds = new Set(current.steps.map(({ id }) => id));
  const latestIds = new Set(latest.steps.map(({ id }) => id));
  const added = latest.steps.flatMap((step, index) => (currentIds.has(step.id) ? [] : [stepLabel(index, step)]));
  const changed = latest.steps.flatMap((step, index) =>
    currentIds.has(step.id) && changedPaths.some((path) => path.startsWith(`${stepPath(step)}/`)) ? [stepLabel(index, step)] : [],
  );
  const removed = current.steps.flatMap((step, index) => (latestIds.has(step.id) ? [] : [stepLabel(index, step)]));

  const sections = [
    ["Steps added", added],
    ["Steps changed", changed],
    ["Steps removed", removed],
  ] as const;
  const steps = sections.flatMap(([heading, labels]) =>
    labels.length === 0 ? [] : [`${heading}:\n${labels.map((label) => `- ${label}`).join("\n")}`],
  );
  return [
    `This updates ${current.name} from ${current.version} to ${latest.version}.`,
    ...(steps.length === 0 ? ["No Step changes: only the files around them, such as the README or the commands behind `npm test`."] : steps),
  ].join("\n\n");
}

function pullRequestBody(summary: string, major: boolean): string {
  return [
    summary,
    "Your code in `src/` is not changed: an update only replaces the Steps, `fieldwork.json` and the other files Fieldwork provides.",
    major
      ? "**This is a major update.** It may change Steps you have already completed, so some of them could fail until you rework them."
      : "Steps you have already completed still pass after this update.",
    "Merge this pull request to take the update, then pull `main` and run `npm install` in case the Project's dependencies changed.",
  ].join("\n\n");
}
