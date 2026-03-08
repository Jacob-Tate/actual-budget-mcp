import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAccountTools } from './tools/accounts';
import { registerTransactionTools } from './tools/transactions';
import { registerCategoryTools } from './tools/categories';
import { registerPayeeTools } from './tools/payees';
import { registerRuleTools } from './tools/rules';
import { registerBudgetTools } from './tools/budget';
import { registerAnalyticsTools } from './tools/analytics';

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'actual-budget',
    version: '1.0.0',
  });

  registerAccountTools(server);
  registerTransactionTools(server);
  registerCategoryTools(server);
  registerPayeeTools(server);
  registerRuleTools(server);
  registerBudgetTools(server);
  registerAnalyticsTools(server);

  return server;
}
