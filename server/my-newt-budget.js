export function reservedTotal(job) {
  return Object.values(job.reservations || {}).reduce((sum, item) => sum + (Number.isFinite(item.amount) ? item.amount : 0), 0);
}

export function reserveMyNewtCost(job, id, amount, label, { allowUnpriced = false } = {}) {
  if (amount == null && allowUnpriced) {
    if (job.spent + reservedTotal(job) >= job.settings.budget) throw new Error("Known task costs have reached the estimated budget. Increase the budget before continuing.");
    job.reservations ||= {};
    job.reservations[id] = { amount: null, label, state: "pending", unpriced: true };
    return;
  }
  if (amount == null || !Number.isFinite(amount) || amount < 0) throw new Error("No reliable price estimate is available for this operation.");
  if (job.spent + reservedTotal(job) + amount > job.settings.budget) throw new Error("Estimated task budget reached. Increase the budget in Settings or stop here.");
  job.reservations ||= {};
  job.reservations[id] = { amount, label, state: "pending" };
}

export function settleMyNewtCost(job, id, amount, { completed = false } = {}) {
  if (!job.reservations?.[id]) return;
  if (amount != null && Number.isFinite(Number(amount)) && Number(amount) >= 0) {
    job.spent += Number(amount);
    delete job.reservations[id];
  } else job.reservations[id].state = completed && job.reservations[id].unpriced ? "unpriced" : "uncertain";
}
