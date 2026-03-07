import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Resend } from 'resend';
import { z } from 'zod';

export function addBroadcastTools(
  server: McpServer,
  resend: Resend,
  {
    senderEmailAddress,
    replierEmailAddresses,
    appBaseUrl,
    apiKey,
  }: {
    senderEmailAddress?: string;
    replierEmailAddresses: string[];
    appBaseUrl?: string;
    apiKey?: string;
  },
) {
  server.registerTool(
    'create-broadcast',
    {
      title: 'Create Broadcast',
      description: `**Purpose:** Create a broadcast campaign (one email sent to an entire audience). Defines subject, body, and audience; does NOT send yet. Use send-broadcast to send it.

**NOT for:** Sending a one-off email to specific people (use send-email). Not for adding contacts (use create-contact).

**Returns:** Broadcast ID. Use this ID with send-broadcast to send, or get-broadcast/update-broadcast to manage.

**When to use:**
- User wants to "email my list", "send a newsletter", "broadcast to my audience", "email all contacts in X"
- Newsletter, announcement, or bulk message to one audience
- Supports personalization: {{{FIRST_NAME}}}, {{{LAST_NAME}}}, {{{EMAIL}}}, {{{RESEND_UNSUBSCRIBE_URL}}}

**Workflow:** list-audiences (if needed) → create-broadcast → send-broadcast( id ). Optionally update-broadcast before sending.`,
      inputSchema: {
        name: z
          .string()
          .nonempty()
          .describe(
            'Name for the broadcast. If the user does not provide a name, go ahead and create a descriptive name for them, based on the email subject/content and the context of your conversation.',
          ),
        audienceId: z.string().nonempty().describe('Audience ID to send to'),
        subject: z.string().nonempty().describe('Email subject'),
        text: z
          .string()
          .nonempty()
          .describe(
            'Plain text version of the email content. The following placeholders may be used to personalize the email content: {{{FIRST_NAME|fallback}}}, {{{LAST_NAME|fallback}}}, {{{EMAIL}}}, {{{RESEND_UNSUBSCRIBE_URL}}}',
          ),
        html: z
          .string()
          .optional()
          .describe(
            'HTML version of the email content. The following placeholders may be used to personalize the email content: {{{FIRST_NAME|fallback}}}, {{{LAST_NAME|fallback}}}, {{{EMAIL}}}, {{{RESEND_UNSUBSCRIBE_URL}}}',
          ),
        previewText: z
          .string()
          .optional()
          .describe('Preview text for the email'),
        ...(!senderEmailAddress
          ? {
              from: z.email().nonempty().describe('From email address'),
            }
          : {}),
        ...(replierEmailAddresses.length === 0
          ? {
              replyTo: z
                .array(z.email())
                .optional()
                .describe('Reply-to email address(es)'),
            }
          : {}),
      },
    },
    async ({
      name,
      audienceId,
      subject,
      text,
      html,
      previewText,
      from,
      replyTo,
    }) => {
      const fromEmailAddress = from ?? senderEmailAddress;
      const replyToEmailAddresses = replyTo ?? replierEmailAddresses;

      // Type check on from, since "from" is optionally included in the arguments schema
      // This should never happen.
      if (typeof fromEmailAddress !== 'string') {
        throw new Error('from argument must be provided.');
      }

      // Similar type check for "reply-to" email addresses.
      if (
        typeof replyToEmailAddresses !== 'string' &&
        !Array.isArray(replyToEmailAddresses)
      ) {
        throw new Error('replyTo argument must be provided.');
      }

      const response = await resend.broadcasts.create({
        name,
        audienceId,
        subject,
        text,
        html,
        previewText,
        from: fromEmailAddress,
        replyTo: replyToEmailAddresses,
      });

      if (response.error) {
        throw new Error(
          `Failed to create broadcast: ${JSON.stringify(response.error)}`,
        );
      }

      return {
        content: [
          { type: 'text', text: 'Broadcast created successfully.' },
          { type: 'text', text: `ID: ${response.data.id}` },
        ],
      };
    },
  );

  server.registerTool(
    'send-broadcast',
    {
      title: 'Send Broadcast',
      description: `**Purpose:** Send (or schedule) an existing broadcast by ID. The broadcast must have been created with create-broadcast first.

**NOT for:** Sending a new one-off email (use send-email). Not for creating the broadcast content (use create-broadcast).

**Returns:** Send confirmation and broadcast ID.

**When to use:**
- User has created a broadcast and says "send it", "go ahead and send", "schedule this for tomorrow"
- After create-broadcast; call send-broadcast with the returned ID to deliver to the audience
- Optional scheduledAt: natural language or ISO 8601 for scheduled send

**Workflow:** create-broadcast → send-broadcast( id ). Use list-broadcasts to find existing draft/sent broadcasts.`,
      inputSchema: {
        id: z.string().nonempty().describe('Broadcast ID'),
        scheduledAt: z
          .string()
          .optional()
          .describe(
            'When to send the broadcast. Value may be in ISO 8601 format (e.g., 2024-08-05T11:52:01.858Z) or in natural language (e.g., "tomorrow at 10am", "in 2 hours", "next day at 9am PST", "Friday at 3pm ET"). If not provided, the broadcast will be sent immediately.',
          ),
      },
    },
    async ({ id, scheduledAt }) => {
      const response = await resend.broadcasts.send(id, { scheduledAt });

      if (response.error) {
        throw new Error(
          `Failed to send broadcast: ${JSON.stringify(response.error)}`,
        );
      }

      return {
        content: [
          { type: 'text', text: 'Broadcast sent successfully.' },
          { type: 'text', text: `ID: ${response.data.id}` },
        ],
      };
    },
  );

  server.registerTool(
    'list-broadcasts',
    {
      title: 'List Broadcasts',
      description: `**Purpose:** List all broadcast campaigns (newsletters/bulk emails to audiences) with ID, name, audience, status, timestamps.

**NOT for:** Listing transactional emails (use list-emails). Not for listing audiences or contacts (use list-audiences, list-contacts).

**Returns:** For each broadcast: id, name, audience_id, status, created_at, scheduled_at, sent_at.

**When to use:** User asks "show my broadcasts", "what newsletters did I send?", "list campaigns". Use get-broadcast for full details of one.`,
      inputSchema: {},
    },
    async () => {
      const response = await resend.broadcasts.list();

      if (response.error) {
        throw new Error(
          `Failed to list broadcasts: ${JSON.stringify(response.error)}`,
        );
      }

      const broadcasts = response.data.data;
      return {
        content: [
          {
            type: 'text',
            text: `Found ${broadcasts.length} broadcast${broadcasts.length === 1 ? '' : 's'}${broadcasts.length === 0 ? '.' : ':'}`,
          },
          ...broadcasts.map(
            ({
              name,
              id,
              audience_id,
              status,
              created_at,
              scheduled_at,
              sent_at,
            }) => ({
              type: 'text' as const,
              text: [
                `ID: ${id}`,
                `Name: ${name}`,
                audience_id !== null && `Audience ID: ${audience_id}`,
                `Status: ${status}`,
                `Created at: ${created_at}`,
                scheduled_at !== null && `Scheduled at: ${scheduled_at}`,
                sent_at !== null && `Sent at: ${sent_at}`,
              ]
                .filter(Boolean)
                .join('\n'),
            }),
          ),
        ],
      };
    },
  );

  server.registerTool(
    'get-broadcast',
    {
      title: 'Get Broadcast',
      description:
        'Retrieve full details of a specific broadcast by ID, including HTML and plain text content.',
      inputSchema: {
        id: z.string().nonempty().describe('Broadcast ID'),
      },
    },
    async ({ id }) => {
      const response = await resend.broadcasts.get(id);

      if (response.error) {
        throw new Error(
          `Failed to get broadcast: ${JSON.stringify(response.error)}`,
        );
      }

      const {
        id: broadcastId,
        name,
        audience_id,
        from,
        subject,
        reply_to,
        preview_text,
        status,
        created_at,
        scheduled_at,
        sent_at,
        html,
        text,
      } = response.data;

      let details = [
        `ID: ${broadcastId}`,
        `Name: ${name}`,
        audience_id !== null && `Audience ID: ${audience_id}`,
        from !== null && `From: ${from}`,
        subject !== null && `Subject: ${subject}`,
        reply_to !== null && `Reply-to: ${reply_to.join(', ')}`,
        preview_text !== null && `Preview text: ${preview_text}`,
        `Status: ${status}`,
        `Created at: ${created_at}`,
        scheduled_at !== null && `Scheduled at: ${scheduled_at}`,
        sent_at !== null && `Sent at: ${sent_at}`,
      ]
        .filter(Boolean)
        .join('\n');

      details += `\n\n--- Plain Text Content ---\n${text || '(none)'}`;
      if (html) {
        details += `\n\n--- HTML Content ---\n${html}`;
      }

      return {
        content: [
          {
            type: 'text',
            text: details,
          },
        ],
      };
    },
  );

  server.registerTool(
    'remove-broadcast',
    {
      title: 'Remove Broadcast',
      description:
        'Remove a broadcast by ID. Before using this tool, you MUST double-check with the user that they want to remove this broadcast. Reference the NAME of the broadcast when double-checking, and warn the user that removing a broadcast is irreversible. You may only use this tool if the user explicitly confirms they want to remove the broadcast after you double-check.',
      inputSchema: {
        id: z.string().nonempty().describe('Broadcast ID'),
      },
    },
    async ({ id }) => {
      const response = await resend.broadcasts.remove(id);

      if (response.error) {
        throw new Error(
          `Failed to remove broadcast: ${JSON.stringify(response.error)}`,
        );
      }

      return {
        content: [
          { type: 'text', text: 'Broadcast removed successfully.' },
          { type: 'text', text: `ID: ${response.data.id}` },
        ],
      };
    },
  );

  server.registerTool(
    'update-broadcast',
    {
      title: 'Update Broadcast',
      description: 'Update a broadcast by ID.',
      inputSchema: {
        id: z.string().nonempty().describe('Broadcast ID'),
        name: z.string().optional().describe('Name for the broadcast'),
        audienceId: z.string().optional().describe('Audience ID to send to'),
        from: z.email().optional().describe('From email address'),
        html: z.string().optional().describe('HTML content of the email'),
        text: z.string().optional().describe('Plain text content of the email'),
        subject: z.string().optional().describe('Email subject'),
        replyTo: z
          .array(z.email())
          .optional()
          .describe('Reply-to email address(es)'),
        previewText: z
          .string()
          .optional()
          .describe('Preview text for the email'),
      },
    },
    async ({
      id,
      name,
      audienceId,
      from,
      html,
      text,
      subject,
      replyTo,
      previewText,
    }) => {
      const response = await resend.broadcasts.update(id, {
        name,
        audienceId,
        from,
        html,
        text,
        subject,
        replyTo,
        previewText,
      });

      if (response.error) {
        throw new Error(
          `Failed to update broadcast: ${JSON.stringify(response.error)}`,
        );
      }

      return {
        content: [
          { type: 'text', text: 'Broadcast updated successfully.' },
          { type: 'text', text: `ID: ${response.data.id}` },
        ],
      };
    },
  );

  if (appBaseUrl && apiKey) {
    server.registerTool(
      'write-to-broadcast-editor',
      {
        title: 'Write to Broadcast Editor (Live)',
        description: `**Purpose:** Push Tiptap JSON content directly into a broadcast's live editor session. The content appears in real-time to all users who have the broadcast open in the editor.

**NOT for:** Creating or sending broadcasts (use create-broadcast/send-broadcast). Not for updating broadcast metadata.

**Returns:** Confirmation that content was pushed to the live editor.

**When to use:**
- User wants to collaboratively edit a broadcast in the live editor
- User wants to see AI-generated content appear in real-time in their editor
- User says "write this in the editor", "update the editor", "push this to the broadcast editor"

**Content format:** Tiptap JSON document format. The content must be a valid Tiptap JSON document with a top-level "doc" type and an array of content nodes (paragraphs, headings, etc).

**Example content:**
{
  "type": "doc",
  "content": [
    { "type": "heading", "attrs": { "level": 1 }, "content": [{ "type": "text", "text": "Hello" }] },
    { "type": "paragraph", "content": [{ "type": "text", "text": "Welcome to our newsletter." }] }
  ]
}

**Supported node types:** doc, paragraph, heading (levels 1-6), text (with marks: bold, italic, underline, link, code), bulletList, orderedList, listItem, blockquote, codeBlock, horizontalRule, image, hardBreak.

**Workflow:** The user must have the broadcast open in the editor-v2 at resend.com. Get the broadcast ID first (use list-broadcasts), then push content with this tool.`,
        inputSchema: {
          broadcastId: z
            .string()
            .nonempty()
            .describe('Broadcast ID (must be a draft broadcast with the editor open)'),
          content: z
            .record(z.string(), z.unknown())
            .describe(
              'Tiptap JSON content to set in the editor. Must have a top-level "type": "doc" with a "content" array.',
            ),
          sessionName: z
            .string()
            .optional()
            .describe(
              'Display name for the AI avatar shown in the editor (default: "Claude")',
            ),
        },
      },
      async ({ broadcastId, content, sessionName }) => {
        const url = `${appBaseUrl}/api/broadcasts/${broadcastId}/live-edit`;
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ content, sessionName }),
        });

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(
            `Failed to write to broadcast editor (${response.status}): ${errorBody}`,
          );
        }

        return {
          content: [
            {
              type: 'text',
              text: 'Content pushed to broadcast editor successfully. The changes are now visible in real-time to anyone with the editor open.',
            },
            { type: 'text', text: `Broadcast ID: ${broadcastId}` },
          ],
        };
      },
    );

    server.registerTool(
      'end-live-session',
      {
        title: 'End Live Editor Session',
        description:
          'End the AI live editing session for a broadcast. This hides the AI avatar from the editor and signals to collaborators that the AI is no longer actively editing.',
        inputSchema: {
          broadcastId: z
            .string()
            .nonempty()
            .describe('Broadcast ID to end the session for'),
        },
      },
      async ({ broadcastId }) => {
        const url = `${appBaseUrl}/api/broadcasts/${broadcastId}/live-edit`;
        const response = await fetch(url, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        });

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(
            `Failed to end live session (${response.status}): ${errorBody}`,
          );
        }

        return {
          content: [
            {
              type: 'text',
              text: 'Live editor session ended. The AI avatar has been removed from the editor.',
            },
          ],
        };
      },
    );
  }
}
