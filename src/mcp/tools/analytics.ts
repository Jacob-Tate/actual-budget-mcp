import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { actualClient } from '../../actual/client';

function ok(data: unknown): { content: [{ type: 'text'; text: string }] } {
  return { content: [{ type: 'text', text: JSON.stringify(data) }] };
}

function fail(error: unknown): { content: [{ type: 'text'; text: string }]; isError: true } {
  const msg = error instanceof Error ? error.message : String(error);
  console.error('[analytics tool error]', msg);
  return { content: [{ type: 'text', text: `Error: ${msg}` }], isError: true };
}

/** Budget fields added by getBudgetMonth() on top of the base Category type. */
interface BudgetCategory {
  id: string;
  name: string;
  budgeted: number;
  spent: number;
  balance: number;
}

/** Budget fields added by getBudgetMonth() on top of the base CategoryGroup type. */
interface BudgetCategoryGroup {
  id: string;
  name: string;
  is_income: boolean;
  budgeted: number;
  spent: number;
  balance: number;
  categories: BudgetCategory[];
}

interface BudgetMonthData {
  month: string;
  totalBudgeted: number;
  totalSpent: number;
  categoryGroups: BudgetCategoryGroup[];
}

/** Generate an ordered list of YYYY-MM strings from startMonth to endMonth (inclusive). */
function monthRange(startMonth: string, endMonth: string): string[] {
  const months: string[] = [];
  const [sy, sm] = startMonth.split('-').map(Number);
  const [ey, em] = endMonth.split('-').map(Number);
  let year = sy, month = sm;
  while (year < ey || (year === ey && month <= em)) {
    months.push(`${year}-${String(month).padStart(2, '0')}`);
    month++;
    if (month > 12) { month = 1; year++; }
  }
  return months;
}

/** Generate cutoff date strings at the given interval between startDate and endDate. */
function dateRange(startDate: string, endDate: string, interval: 'daily' | 'weekly' | 'monthly'): string[] {
  const dates: string[] = [];
  const current = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');
  while (current <= end) {
    dates.push(current.toISOString().slice(0, 10));
    if (interval === 'daily') current.setDate(current.getDate() + 1);
    else if (interval === 'weekly') current.setDate(current.getDate() + 7);
    else current.setMonth(current.getMonth() + 1);
  }
  return dates;
}

export function registerAnalyticsTools(server: McpServer): void {
  server.registerTool('monthly-summary', {
    description: 'Aggregate income vs. spending totals per month. Returns budgeted and actual amounts for income and expense groups, plus net. Amounts in milliunits.',
    inputSchema: {
      startMonth: z.string().describe('YYYY-MM'),
      endMonth: z.string().optional().describe('YYYY-MM (inclusive), defaults to startMonth'),
    },
  }, async ({ startMonth, endMonth }) => {
    try {
      actualClient.ensureReady();
      const months = monthRange(startMonth, endMonth ?? startMonth);
      const budgetData = await Promise.all(
        months.map(m => actualClient.api.getBudgetMonth(m) as Promise<BudgetMonthData>)
      );

      const summaries = budgetData.map(data => {
        let incomeBudgeted = 0, incomeActual = 0;
        let expenseBudgeted = 0, expenseActual = 0;

        for (const group of data.categoryGroups) {
          if (group.is_income) {
            incomeBudgeted += group.budgeted;
            incomeActual += group.spent;
          } else {
            expenseBudgeted += group.budgeted;
            expenseActual += group.spent;
          }
        }

        return {
          month: data.month,
          income: { budgeted: incomeBudgeted, actual: incomeActual },
          expenses: { budgeted: expenseBudgeted, actual: expenseActual },
          net: incomeActual + expenseActual, // spent is negative for expenses
        };
      });

      return ok(summaries);
    } catch (e) { return fail(e); }
  });

  server.registerTool('spending-by-category', {
    description: 'Break down spending across categories for a date range. Fetches transactions from all on-budget accounts and groups by category. Amounts in milliunits, negative = expense. Excludes transfers and income by default. Returns {categoryId: total} sorted highest spend first.',
    inputSchema: {
      startDate: z.string().describe('YYYY-MM-DD (inclusive)'),
      endDate: z.string().describe('YYYY-MM-DD (inclusive)'),
      includeIncome: z.boolean().optional().describe('Include income transactions (positive amounts). Default: false.'),
    },
  }, async ({ startDate, endDate, includeIncome = false }) => {
    try {
      actualClient.ensureReady();
      const accounts = await actualClient.api.getAccounts();
      const onBudget = accounts.filter(a => !a.offBudget && !a.closed);

      const txnArrays = await Promise.all(
        onBudget.map(a => actualClient.api.getTransactions(a.id, startDate, endDate))
      );

      const totals = new Map<string, number>();

      for (const txns of txnArrays) {
        for (const t of txns) {
          // Skip parent split transactions (children are counted individually)
          if (t.is_parent) continue;
          // Skip transfers
          if (t.transfer_id) continue;
          // Skip income unless requested
          if (!includeIncome && t.amount > 0) continue;

          const key = t.category ?? '__uncategorized__';
          totals.set(key, (totals.get(key) ?? 0) + t.amount);
        }
      }

      // Return as {categoryId: total} map sorted most negative (highest spend) first
      const sorted = Array.from(totals.entries()).sort((a, b) => a[1] - b[1]);
      return ok(Object.fromEntries(sorted));
    } catch (e) { return fail(e); }
  });

  server.registerTool('budget-vs-actual', {
    description: 'Compare budgeted amounts to actual spending per category for one or more months. Amounts in milliunits, expense actual is negative. Returns {month: {groupId: {name, categories: {catId: {name, budgeted, actual, variance, pct}}}}}.',
    inputSchema: {
      startMonth: z.string().describe('YYYY-MM'),
      endMonth: z.string().optional().describe('YYYY-MM (inclusive), defaults to startMonth'),
      includeIncome: z.boolean().optional().describe('Include income category groups. Default: false.'),
    },
  }, async ({ startMonth, endMonth, includeIncome = false }) => {
    try {
      actualClient.ensureReady();
      const months = monthRange(startMonth, endMonth ?? startMonth);
      const budgetData = await Promise.all(
        months.map(m => actualClient.api.getBudgetMonth(m) as Promise<BudgetMonthData>)
      );

      const result: Record<string, Record<string, {
        name: string;
        categories: Record<string, { name: string; budgeted: number; actual: number; variance: number; pct: number | null }>;
      }>> = {};

      for (const data of budgetData) {
        const groups: typeof result[string] = {};
        for (const group of data.categoryGroups) {
          if (!includeIncome && group.is_income) continue;
          const categories: typeof groups[string]['categories'] = {};
          for (const cat of group.categories) {
            const actual = cat.spent;
            const budgeted = cat.budgeted;
            const variance = budgeted + actual; // actual is negative for expenses
            const pct = budgeted !== 0 ? Math.round((-actual / budgeted) * 10000) / 100 : null;
            categories[cat.id] = { name: cat.name, budgeted, actual, variance, pct };
          }
          groups[group.id] = { name: group.name, categories };
        }
        result[data.month] = groups;
      }

      return ok(result);
    } catch (e) { return fail(e); }
  });

  server.registerTool('balance-history', {
    description: 'Account balance over time, computed from transaction history. Amounts in milliunits. Returns [[date, balance], ...] sorted chronologically.',
    inputSchema: {
      accountId: z.string().describe('Account ID'),
      startDate: z.string().describe('YYYY-MM-DD'),
      endDate: z.string().describe('YYYY-MM-DD'),
      interval: z.enum(['daily', 'weekly', 'monthly']).optional().describe('Sampling interval. Default: monthly.'),
    },
  }, async ({ accountId, startDate, endDate, interval = 'monthly' }) => {
    try {
      actualClient.ensureReady();
      const dates = dateRange(startDate, endDate, interval);

      const balances = await Promise.all(
        dates.map(async d => [
          d,
          await actualClient.api.getAccountBalance(accountId, new Date(d + 'T00:00:00')),
        ] as [string, number])
      );

      return ok(balances);
    } catch (e) { return fail(e); }
  });
}
