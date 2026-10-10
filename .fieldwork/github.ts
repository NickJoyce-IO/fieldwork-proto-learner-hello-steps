import { execFile } from "node:child_process";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export interface Issue {
  number: number;
  title: string;
  body: string;
  pinned: boolean;
}

/** What the active rulesets require before anything reaches a branch. */
export interface BranchProtection {
  requiresPullRequest: boolean;
  /** Names of the status checks that must pass, e.g. "Fieldwork Steps". */
  requiredChecks: string[];
}

/**
 * An active ruleset on one branch, as Fieldwork applies it. Its pull request
 * rule needs no approving reviews, since a Learner cannot approve their own.
 */
export interface Ruleset {
  name: string;
  branch: string;
  requiredChecks: string[];
}

/**
 * Every Learner-side GitHub interaction goes through this adapter, for the
 * repository the command runs in. The real one wraps the `gh` CLI; tests use
 * a fake that keeps the same contract (test/github-contract.ts). Failures
 * that the Learner can fix throw a GitHubError.
 */
export interface GitHub {
  listOpenIssues(): Promise<Issue[]>;
  /** Opens an issue, unpinned, and returns its number. */
  createIssue(title: string, body: string): Promise<number>;
  editIssueBody(number: number, body: string): Promise<void>;
  pinIssue(number: number): Promise<void>;

  branchProtection(branch: string): Promise<BranchProtection>;
  /** The repository's own rulesets (not ones inherited from an organisation). */
  listRulesets(): Promise<{ id: number; name: string }[]>;
  createRuleset(ruleset: Ruleset): Promise<void>;
  updateRuleset(id: number, ruleset: Ruleset): Promise<void>;

  /**
   * Writes the files of the template repository this one was created from
   * into `dir`, as they stand on its default branch: the latest published
   * version of the Project.
   */
  downloadTemplate(dir: string): Promise<void>;
  /** Opens a pull request from a branch already pushed to the repository, and returns its URL. */
  createPullRequest(pullRequest: PullRequest): Promise<string>;
}

export interface PullRequest {
  /** The branch with the changes. */
  head: string;
  /** The branch they are to be merged into. */
  base: string;
  title: string;
  body: string;
}

/** Why GitHub could not be reached in a way the Learner can fix. */
export type GitHubProblem = "gh-missing" | "not-authenticated" | "forbidden" | "needs-public-repo" | "not-from-template";

const guidance: Record<GitHubProblem, string> = {
  "gh-missing": "The GitHub CLI (gh) is not installed. Install it from https://cli.github.com, then run `gh auth login`.",
  "not-authenticated":
    "You are not logged in to the GitHub CLI. Run `gh auth login`, choose GitHub.com, and follow the prompts. `gh auth status` shows who you are logged in as.",
  forbidden:
    "Your GitHub login cannot read or change this repository's rulesets, which needs admin rights on it. Check that you are in your own Project repository (`gh repo view` shows which one) and logged in as its owner (`gh auth status`). If your login lacks the `repo` scope, run `gh auth refresh -s repo`, then try again.",
  "needs-public-repo":
    "Rulesets on a private repository need a paid GitHub plan. Make this repository public (Settings, then General, then Danger Zone, then Change visibility), then try again.",
  "not-from-template":
    "GitHub has no record of a template this repository was created from, so there is nowhere to look for newer versions of the Project. Updates reach repositories made with the Project's \"Use this template\" button, which the Fieldwork README links to.",
};

export class GitHubError extends Error {
  readonly problem: GitHubProblem;

  constructor(problem: GitHubProblem, detail?: string) {
    super(detail ? `${guidance[problem]}\n\n(${detail})` : guidance[problem]);
    this.problem = problem;
  }
}

/**
 * The adapter commands use. `FIELDWORK_GITHUB_ADAPTER` names a module whose
 * `createGitHub()` replaces it; the runner's tests point it at their fake.
 */
export async function connectGitHub(): Promise<GitHub> {
  const override = process.env.FIELDWORK_GITHUB_ADAPTER;
  if (override) {
    const module = (await import(pathToFileURL(override).href)) as { createGitHub: () => GitHub };
    return module.createGitHub();
  }
  return new GhCli();
}

/**
 * Wraps the `gh` CLI, which authenticates with `gh auth login` locally or
 * `GH_TOKEN` in GitHub Actions. Without a `repo` (`owner/name`), gh uses the
 * repository of the current directory's Git remote. `env` adds to the
 * environment gh runs with.
 */
export class GhCli implements GitHub {
  readonly repo: string | undefined;
  readonly env: NodeJS.ProcessEnv;

  constructor(options: { repo?: string; env?: NodeJS.ProcessEnv } = {}) {
    this.repo = options.repo;
    this.env = options.env ?? {};
  }

  async listOpenIssues(): Promise<Issue[]> {
    const output = await this.gh(["issue", "list", "--state", "open", "--limit", "100", "--json", "number,title,body,isPinned"]);
    const issues = JSON.parse(output) as { number: number; title: string; body: string; isPinned: boolean }[];
    return issues.map(({ number, title, body, isPinned }) => ({ number, title, body, pinned: isPinned }));
  }

  async createIssue(title: string, body: string): Promise<number> {
    // gh prints the new issue's URL, which ends in its number.
    const url = await this.gh(["issue", "create", "--title", title, "--body-file", "-"], body);
    const number = /\/issues\/(\d+)\s*$/.exec(url)?.[1];
    if (number === undefined) throw new Error(`Unexpected output from gh issue create: ${url}`);
    return Number(number);
  }

  async editIssueBody(number: number, body: string): Promise<void> {
    await this.gh(["issue", "edit", String(number), "--body-file", "-"], body);
  }

  async pinIssue(number: number): Promise<void> {
    await this.gh(["issue", "pin", String(number)]);
  }

  async branchProtection(branch: string): Promise<BranchProtection> {
    // Only active rules apply here, from every ruleset that targets the branch.
    const rules = JSON.parse(
      await this.gh(["api", `repos/{owner}/{repo}/rules/branches/${encodeURIComponent(branch)}`]),
    ) as { type: string; parameters?: { required_status_checks?: { context: string }[] } }[];
    return {
      requiresPullRequest: rules.some(({ type }) => type === "pull_request"),
      requiredChecks: rules.flatMap(({ type, parameters }) =>
        type === "required_status_checks" ? (parameters?.required_status_checks ?? []).map(({ context }) => context) : [],
      ),
    };
  }

  async listRulesets(): Promise<{ id: number; name: string }[]> {
    const rulesets = JSON.parse(await this.gh(["api", "repos/{owner}/{repo}/rulesets?includes_parents=false"])) as {
      id: number;
      name: string;
    }[];
    return rulesets.map(({ id, name }) => ({ id, name }));
  }

  async createRuleset(ruleset: Ruleset): Promise<void> {
    await this.gh(["api", "--method", "POST", "repos/{owner}/{repo}/rulesets", "--input", "-"], rulesetPayload(ruleset));
  }

  async updateRuleset(id: number, ruleset: Ruleset): Promise<void> {
    await this.gh(["api", "--method", "PUT", `repos/{owner}/{repo}/rulesets/${id}`, "--input", "-"], rulesetPayload(ruleset));
  }

  async downloadTemplate(dir: string): Promise<void> {
    const template = (
      await this.gh(["api", "repos/{owner}/{repo}", "--jq", ".template_repository.full_name // empty"])
    ).trim();
    if (template === "") throw new GitHubError("not-from-template");
    // Only the files are wanted, not the template's history.
    await this.gh(["repo", "clone", template, dir, "--", "--depth=1", "--quiet"]);
    rmSync(join(dir, ".git"), { recursive: true, force: true });
  }

  async createPullRequest({ head, base, title, body }: PullRequest): Promise<string> {
    // gh prints the new pull request's URL.
    return (await this.gh(["pr", "create", "--head", head, "--base", base, "--title", title, "--body-file", "-"], body)).trim();
  }

  private gh(args: string[], input?: string): Promise<string> {
    // GH_REPO picks the repository for `gh api` as well as `gh issue`.
    return gh(args, { ...process.env, ...this.env, ...(this.repo === undefined ? {} : { GH_REPO: this.repo }) }, input);
  }
}

/** The REST API's form of a Fieldwork ruleset. */
function rulesetPayload({ name, branch, requiredChecks }: Ruleset): string {
  return JSON.stringify({
    name,
    target: "branch",
    enforcement: "active",
    conditions: { ref_name: { include: [`refs/heads/${branch}`], exclude: [] } },
    rules: [
      {
        type: "pull_request",
        parameters: {
          required_approving_review_count: 0,
          dismiss_stale_reviews_on_push: false,
          require_code_owner_review: false,
          require_last_push_approval: false,
          required_review_thread_resolution: false,
        },
      },
      {
        type: "required_status_checks",
        parameters: {
          strict_required_status_checks_policy: false,
          required_status_checks: requiredChecks.map((context) => ({ context })),
        },
      },
    ],
  });
}

function gh(args: string[], env: NodeJS.ProcessEnv, input?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile("gh", args, { encoding: "utf8", env }, (error, stdout, stderr) => {
      if (!error) {
        resolve(stdout);
        return;
      }
      const detail = `gh ${args.slice(0, 2).join(" ")}: ${stderr.trim() || error.message}`;
      const problem = classify(error, stderr);
      reject(problem === undefined ? new Error(detail) : new GitHubError(problem, problem === "gh-missing" ? undefined : detail));
    });
    child.stdin?.end(input);
  });
}

/** Recognises the gh failures a Learner can fix from gh's exit code and message. */
function classify(error: Error & { code?: unknown }, stderr: string): GitHubProblem | undefined {
  if (error.code === "ENOENT") return "gh-missing";
  // gh exits 4 when it has no login at all; HTTP 401 means a bad or expired token.
  if (error.code === 4 || /HTTP 401/.test(stderr)) return "not-authenticated";
  if (/Upgrade to GitHub Pro|make this repository public/i.test(stderr)) return "needs-public-repo";
  // Rulesets answer 404 rather than 403 to a login that cannot administer the repository.
  if (/HTTP 403|HTTP 404|Resource not accessible/.test(stderr)) return "forbidden";
  return undefined;
}
