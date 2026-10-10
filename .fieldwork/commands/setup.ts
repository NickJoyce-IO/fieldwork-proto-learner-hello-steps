import { connectGitHub } from "../github.ts";
import { fieldworkCheck, fieldworkRuleset, missingProtection } from "../main-ruleset.ts";

/**
 * Protects main the way Step 0 of a Track's first Project teaches by hand, so
 * later Projects need not repeat it: main then requires a pull request and the
 * Fieldwork check. Leaves main alone if it is already protected, and repairs
 * Fieldwork's own ruleset rather than adding a second.
 */
export async function setupCommand(args: string[]): Promise<number> {
  if (args.length > 0) {
    console.error("Usage: fieldwork setup");
    return 2;
  }
  const github = await connectGitHub();
  if (missingProtection(await github.branchProtection(fieldworkRuleset.branch)) === undefined) {
    console.log(`main is already protected: it requires a pull request and the "${fieldworkCheck}" check.`);
    return 0;
  }

  const existing = (await github.listRulesets()).find(({ name }) => name === fieldworkRuleset.name);
  if (existing === undefined) await github.createRuleset(fieldworkRuleset);
  else await github.updateRuleset(existing.id, fieldworkRuleset);

  console.log(
    `${existing === undefined ? "Added" : "Updated"} the "${fieldworkRuleset.name}" ruleset: main now requires a pull request and the "${fieldworkCheck}" check.`,
  );
  return 0;
}
