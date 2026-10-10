import type { BranchProtection, Ruleset } from "./github.ts";

/** The check the PR workflow reports (its job's name in .github/workflows/fieldwork.yml). */
export const fieldworkCheck = "Fieldwork Steps";

/** What `setup` applies, and what Step 0 has the Learner apply by hand. */
export const fieldworkRuleset: Ruleset = {
  name: "Fieldwork: protect main",
  branch: "main",
  requiredChecks: [fieldworkCheck],
};

/**
 * What main is missing from the protection Step 0 asks for, as a phrase such
 * as `a pull request or the "Fieldwork Steps" check`, or undefined when main
 * has it all, from whichever rulesets.
 */
export function missingProtection({ requiresPullRequest, requiredChecks }: BranchProtection): string | undefined {
  const missing = [
    ...(requiresPullRequest ? [] : ["a pull request"]),
    ...(requiredChecks.includes(fieldworkCheck) ? [] : [`the "${fieldworkCheck}" check`]),
  ];
  return missing.length === 0 ? undefined : missing.join(" or ");
}
