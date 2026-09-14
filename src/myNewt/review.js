export function myNewtRequiresPlanApproval(settings = {}) {
  return settings.autoReview !== true && settings.approvePlan !== false;
}

export function myNewtRequiresRunApproval(settings = {}, payload = {}, { uncertain = false } = {}) {
  return uncertain || (settings.autoReview !== true && (settings.approveRuns !== false || payload.force === true));
}

export function myNewtReviewInstructions(settings = {}) {
  const review = settings.autoReview === true
    ? "Auto Review is enabled. Review your own plan against the brief and proceed without asking the user to approve plans, ordinary runs, or user-requested new variants. Use reasonable defaults for optional creative choices within the brief. Continue through execution and verified completion; do not call ask merely to obtain routine confirmation. Every response must include the next project_action; a progress message alone does not advance the task. Published estimated costs are sufficient within the estimated budget: they are not guaranteed final charges and do not require another approval. Recheck current pricing via plan/run preparation rather than treating a historical pricing error as a permanent blocker. On resume, read current outputs and deliverableProgress, including work completed manually, and complete only the remaining deliverables. Budget, permissions, locks, protected work, required assets, and interrupted or uncertain paid requests still apply. Ask only for a genuine blocker or indispensable missing information. This mode never authorizes speculative repeated generations or changing permissions."
    : "Auto Review is disabled. Respect the configured plan and run approval settings. Deliberate repeat runs require explicit approval even when ordinary run approval is off.";
  const pricing = settings.allowUnpricedGenerations === true
    ? "Allow Unpriced Generations is enabled by the user. A missing image/video price estimate is NOT a blocker. Continue the requested generations using the usual run tool and configured approval settings; do not ask for further permission solely because a price is null. Track those charges as unknown, never free. Known costs still count against the budget, but total spend cannot be guaranteed. This does not authorize retrying an interrupted or uncertain paid request."
    : "Allow Unpriced Generations is disabled. Unknown-price media cannot be submitted. Do not repeatedly ask for verbal permission to override this: the user must enable Allow Unpriced Generations in Advanced, change settings, or update pricing. Published non-null estimates remain usable within the estimated budget.";
  return `${review}\n${pricing}`;
}
