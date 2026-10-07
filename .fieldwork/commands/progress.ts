import { checkStepsInOrder, stepLabel, type StepCheck } from "../check-steps.ts";
import { connectGitHub } from "../github.ts";
import { loadProject, type Project } from "../project.ts";

/** Marks the Progress issue, so it is found again however the Learner renames it. */
const marker = "<!-- fieldwork:progress -->";

/**
 * Checks the Steps on the current checkout (in GitHub Actions, `main` after a
 * merge) and writes the result to the repository's pinned Progress issue,
 * creating it the first time. Every Step passing before the Current Step is a
 * Completed Step, so a pull request that finished several Steps records them
 * all. Nothing is committed: the issue is the progress view.
 */
export async function progressCommand(args: string[]): Promise<number> {
  if (args.length > 0) {
    console.error("Usage: fieldwork progress");
    return 2;
  }
  const project = loadProject(process.cwd());
  const body = progressBody(project, await checkStepsInOrder(project));

  const github = await connectGitHub();
  const existing = (await github.listOpenIssues()).find((issue) => issue.body.includes(marker));
  const number = existing?.number ?? (await github.createIssue("Progress", body));
  if (existing !== undefined && existing.body !== body) await github.editIssueBody(existing.number, body);
  console.log(`${existing === undefined ? "Created" : "Updated"} the Progress issue #${number}\n\n${body}`);

  if (!existing?.pinned) {
    // e.g. the repository already pins three issues. The progress is recorded
    // either way, so this must not fail the workflow on every merge.
    try {
      await github.pinIssue(number);
    } catch (error) {
      console.warn(`\nCould not pin the Progress issue #${number}: ${(error as Error).message}`);
    }
  }
  return 0;
}

function progressBody(project: Project, checks: StepCheck[]): string {
  const completed = checks.filter(({ passed }) => passed).length;
  const total = project.steps.length;
  const lines = project.steps.map((step, index) => {
    const check = checks[index];
    if (check === undefined) return `- 🔒 ${stepLabel(index, step)}`;
    if (check.passed) return `- ✅ ${stepLabel(index, step)}`;
    return `- 🚧 ${stepLabel(index, step)}: Current Step (${check.details})`;
  });
  const commit = process.env.GITHUB_SHA ? ` at commit ${process.env.GITHUB_SHA}` : "";

  return [
    marker,
    `**${project.name}** ${project.version}: ${completed === total ? `all ${total} Steps completed` : `${completed} of ${total} Steps completed`}.`,
    "",
    ...lines,
    "",
    `_Updated automatically after every merge to \`main\`${commit}. Edits to this issue are overwritten._`,
  ].join("\n");
}
