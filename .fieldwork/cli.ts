// Learner-side commands for a TypeScript-on-Node Project (ADR-0002). This
// runner ships inside every published Project; maintainer-only commands
// (verify, publish) live in the monorepo's tooling package instead.
import { progressCommand } from "./commands/progress.ts";
import { setupCommand } from "./commands/setup.ts";
import { testCommand } from "./commands/test.ts";
import { updateCommand } from "./commands/update.ts";

interface Command {
  summary: string;
  /** Receives the arguments after the command name; returns the exit code. */
  run: (args: string[]) => Promise<number>;
}

const commands: Record<string, Command> = {
  test: {
    summary: "Run Steps in order up to the Current Step (--step N for one Step, --watch to rerun on save)",
    run: testCommand,
  },
  progress: {
    summary: "Record Completed Steps in the repository's pinned Progress issue (run by GitHub Actions on main)",
    run: progressCommand,
  },
  setup: {
    summary: "Protect main with a ruleset requiring a pull request and the Fieldwork Steps check",
    run: setupCommand,
  },
  update: {
    summary: "Bring a newer version of the Project in as a pull request (--major to take a major version)",
    run: updateCommand,
  },
};

// node:test marks its child processes with NODE_TEST_CONTEXT, and run() skips
// every file when it sees it. The CLI is always a top-level run of a Project's
// Steps, even when launched from inside a test (e.g. by `verify`).
delete process.env.NODE_TEST_CONTEXT;

const [name, ...args] = process.argv.slice(2);
const command = name === undefined ? undefined : commands[name];

if (command === undefined) {
  if (name !== undefined) console.error(`Unknown command: ${name}\n`);
  console.error(
    ["Usage: fieldwork <command> [options]", "", "Commands:"]
      .concat(Object.entries(commands).map(([commandName, { summary }]) => `  ${commandName}  ${summary}`))
      .join("\n"),
  );
  process.exitCode = 2;
} else {
  // Exit code 1 means "the Current Step is unfinished" (the PR workflow relies
  // on it), so a command that cannot run at all exits 2 instead.
  try {
    process.exitCode = await command.run(args);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 2;
  }
}
