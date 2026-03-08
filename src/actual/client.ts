import fs from 'fs';
import { config } from '../config';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require('@actual-app/api') as ActualAPI;

/**
 * Typed interface for the Actual Budget API methods we use.
 * Amounts are integers in milliunits (100 = $1.00).
 */
export interface ActualAPI {
  init(options: { dataDir: string; serverURL: string; password: string }): Promise<void>;
  shutdown(): Promise<void>;
  downloadBudget(syncId: string, options?: { password?: string }): Promise<void>;
  sync(): Promise<void>;
  runBankSync(options?: { accountId?: string }): Promise<void>;

  getAccounts(): Promise<Account[]>;
  createAccount(account: Partial<Account>, initialBalance?: number): Promise<string>;
  updateAccount(id: string, fields: Partial<Account>): Promise<void>;
  closeAccount(id: string, transferAccountId?: string, transferCategoryId?: string): Promise<void>;
  reopenAccount(id: string): Promise<void>;
  deleteAccount(id: string): Promise<void>;
  getAccountBalance(id: string, cutoff?: Date): Promise<number>;

  getTransactions(accountId: string, startDate: string, endDate: string): Promise<Transaction[]>;
  addTransactions(accountId: string, transactions: Partial<Transaction>[], opts?: { runTransfers?: boolean; learnCategories?: boolean }): Promise<string[]>;
  importTransactions(accountId: string, transactions: Partial<Transaction>[]): Promise<{ errors: unknown[]; added: string[]; updated: string[] }>;
  updateTransaction(id: string, fields: Partial<Transaction>): Promise<void>;
  deleteTransaction(id: string): Promise<void>;

  getCategories(): Promise<Category[]>;
  createCategory(category: Partial<Category>): Promise<string>;
  updateCategory(id: string, fields: Partial<Category>): Promise<void>;
  deleteCategory(id: string): Promise<void>;

  getCategoryGroups(): Promise<CategoryGroup[]>;
  createCategoryGroup(group: Partial<CategoryGroup>): Promise<string>;
  updateCategoryGroup(id: string, fields: Partial<CategoryGroup>): Promise<void>;
  deleteCategoryGroup(id: string): Promise<void>;

  getPayees(): Promise<Payee[]>;
  createPayee(payee: Partial<Payee>): Promise<string>;
  updatePayee(id: string, fields: Partial<Payee>): Promise<void>;
  deletePayee(id: string): Promise<void>;
  mergePayees(targetId: string, mergeIds: string[]): Promise<void>;

  getRules(): Promise<Rule[]>;
  createRule(rule: Partial<Rule>): Promise<Rule>;
  updateRule(id: string, fields: Partial<Rule>): Promise<Rule>;
  deleteRule(id: string): Promise<void>;

  runQuery(query: unknown): Promise<{ data: unknown[] }>;

  getBudgetMonths(): Promise<string[]>;
  getBudgetMonth(month: string): Promise<BudgetMonth>;
  setBudgetAmount(month: string, categoryId: string, value: number): Promise<void>;
  setBudgetCarryover(month: string, categoryId: string, flag: boolean): Promise<void>;
}

export interface Account {
  id: string;
  name: string;
  type: 'checking' | 'savings' | 'credit' | 'investment' | 'mortgage' | 'debt' | 'other';
  offBudget: boolean;
  closed: boolean;
}

export interface Subtransaction {
  amount: number;
  category?: string;
  notes?: string;
  payee?: string;
}

export interface Transaction {
  id: string;
  date: string;
  amount: number;
  /** Payee ID. Use payee_name to create/match by name instead. */
  payee?: string;
  payee_name?: string;
  /** Category ID. Omit for split transactions (use subtransactions). */
  category?: string;
  notes?: string;
  imported_id?: string;
  imported_payee?: string;
  cleared?: boolean;
  transfer_id?: string;
  is_parent?: boolean;
  is_child?: boolean;
  parent_id?: string;
  subtransactions?: Subtransaction[];
}

export interface Category {
  id: string;
  name: string;
  group_id: string;
  is_income: boolean;
  hidden: boolean;
}

export interface CategoryGroup {
  id: string;
  name: string;
  is_income: boolean;
  hidden: boolean;
  categories: Category[];
}

export interface Payee {
  id: string;
  name: string;
  category: string;
  transfer_acct: string;
}

export interface Rule {
  id: string;
  stage: string;
  conditionsOp: 'and' | 'or';
  conditions: Record<string, unknown>[];
  actions: Record<string, unknown>[];
}

export interface BudgetMonth {
  month: string;
  incomeAvailable: number;
  lastMonthOverspent: number;
  forNextMonth: number;
  totalBudgeted: number;
  totalSpent: number;
  totalBalance: number;
  categoryGroups: CategoryGroup[];
}

class ActualClient {
  private initialized = false;

  async initialize(): Promise<void> {
    fs.mkdirSync(config.actualDataDir, { recursive: true });

    await api.init({
      dataDir: config.actualDataDir,
      serverURL: config.actualServerUrl,
      password: config.actualServerPassword,
    });

    await api.downloadBudget(config.actualSyncId);
    this.initialized = true;
    console.log('Actual Budget client initialized');
  }

  async shutdown(): Promise<void> {
    if (this.initialized) {
      await api.shutdown();
      this.initialized = false;
      console.log('Actual Budget client shut down');
    }
  }

  ensureReady(): void {
    if (!this.initialized) {
      throw new Error('Actual Budget client is not initialized');
    }
  }

  get api(): ActualAPI {
    return api;
  }
}

export const actualClient = new ActualClient();
