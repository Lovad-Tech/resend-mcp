import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Resend } from 'resend';
import packageJson from '../package.json' with { type: 'json' };
import {
  addApiKeyTools,
  addBroadcastTools,
  addContactPropertyTools,
  addContactTools,
  addDomainTools,
  addEmailTools,
  addSegmentTools,
  addTopicTools,
  addWebhookTools,
} from './tools/index.js';
import type { ServerOptions } from './types.js';

export type { ServerOptions } from './types.js';

export function createMcpServer(
  resend: Resend,
  options: ServerOptions,
  apiKey?: string,
): McpServer {
  const { senderEmailAddress, replierEmailAddresses, appBaseUrl } = options;
  const server = new McpServer({
    name: 'resend',
    version: packageJson.version,
  });
  addApiKeyTools(server, resend);
  addBroadcastTools(server, resend, {
    senderEmailAddress,
    replierEmailAddresses,
    appBaseUrl,
    apiKey,
  });
  addContactPropertyTools(server, resend);
  addContactTools(server, resend);
  addDomainTools(server, resend);
  addEmailTools(server, resend, { senderEmailAddress, replierEmailAddresses });
  addSegmentTools(server, resend);
  addTopicTools(server, resend);
  addWebhookTools(server, resend);
  return server;
}
