# Analytics Tools (Deferred)

These tools are planned but not in the initial release. Add them as additional tool files under `src/mcp/tools/`.

## Planned Tools

### `monthly-summary`
Aggregate income vs. spending totals per month. Uses `getBudgetMonth()` to get budgeted/actual per category, then totals by income/expense group.

### `spending-by-category`
Break down spending across categories for a configurable date range. Uses `getTransactions()` across all accounts + group by `category_id`.

### `balance-history`
Account balance over time, computed from transaction history with `getAccountBalance(id, cutoff)` for multiple cutoff dates.

### `budget-vs-actual`
Compare budgeted amounts to actual spending per category for a given month. Combines `getBudgetMonth()` (budgeted) with `getTransactions()` (actual).

## Notes

- These are all computable from the existing CRUD API — no new Actual Budget API surface needed.
- Consider adding a shared `src/mcp/tools/analytics.ts` file.
- Expose via `registerAnalyticsTools(server)` following the same pattern as other tool files.
