import { execFile } from "node:child_process";
import { pathToFileURL } from "node:url";

export interface Issue {
  number: number;
  title: string;
  body: string;
  pinned: boolean;
}

/**
 * Every Learner-side GitHub interaction goes through this adapter, for the
 * repository the command runs in. The real one wraps the `gh` CLI; tests use
 * a fake that keeps the same contract (test/github-contract.ts).
 */
export interface GitHub {
  listOpenIssues(): Promise<Issue[]>;
  /** Opens an issue, unpinned, and returns its number. */
  createIssue(title: string, body: string): Promise<number>;
  editIssueBody(number: number, body: string): Promise<void>;
  pinIssue(number: number): Promise<void>;
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
 * repository of the current directory's Git remote.
 */
export class GhCli implements GitHub {
  readonly repo: string | undefined;

  constructor(repo?: string) {
    this.repo = repo;
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

  private gh(args: string[], input?: string): Promise<string> {
    return gh(this.repo === undefined ? args : [...args, "--repo", this.repo], input);
  }
}

function gh(args: string[], input?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile("gh", args, { encoding: "utf8" }, (error, stdout, stderr) => {
      if ((error as NodeJS.ErrnoException | null)?.code === "ENOENT") {
        reject(new Error("The GitHub CLI (gh) is not installed. Install it from https://cli.github.com and run `gh auth login`."));
      } else if (error) {
        reject(new Error(`gh ${args.slice(0, 2).join(" ")} failed: ${stderr.trim() || error.message}`));
      } else {
        resolve(stdout);
      }
    });
    child.stdin?.end(input);
  });
}
