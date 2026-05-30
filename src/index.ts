#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { FloorpClient } from "./client.js";
import type { InstanceType, EvaluateResult } from "./api-types.js";

// -- Shared Zod schemas -------------------------------------------------------

const instanceIdSchema = z
  .string()
  .describe(
    "Instance ID (from floorp_manage_instance). Used to identify an automation session.",
  );

const instanceTypeSchema = z
  .enum(["tab", "scraper"])
  .optional()
  .default("tab")
  .describe(
    'Instance type: "tab" for visible tabs (default), "scraper" for headless instances.',
  );

const selectorSchema = z
  .string()
  .optional()
  .describe("CSS selector to target an element.");

const fingerprintSchema = z
  .string()
  .optional()
  .describe(
    "Element fingerprint from floorp_get_text output. Use instead of selector for stable element targeting. Takes priority over selector if both given.",
  );

// -- Initialize client & server -----------------------------------------------

const client = new FloorpClient();

const server = new McpServer({
  name: "floorp-os",
  version: "0.2.0",
});

// -- Resources ----------------------------------------------------------------

server.registerResource(
  "floorp-tabs",
  "floorp://tabs",
  { description: "List of open browser tabs" },
  async (uri) => {
    const tabs = await client.getTabs();
    return {
      contents: [
        {
          uri: uri.href,
          text: JSON.stringify(tabs, null, 2),
          mimeType: "application/json",
        },
      ],
    };
  },
);

server.registerResource(
  "floorp-history",
  "floorp://history",
  { description: "Browser history" },
  async (uri) => {
    const history = await client.getHistory();
    return {
      contents: [
        {
          uri: uri.href,
          text: JSON.stringify(history, null, 2),
          mimeType: "application/json",
        },
      ],
    };
  },
);

// -- Helpers ------------------------------------------------------------------

function instanceType(val: "tab" | "scraper" | undefined): InstanceType {
  return val ?? "tab";
}

function err(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// ============================================================================
// Tool 1: floorp_list_tabs
// ============================================================================

server.registerTool(
  "floorp_list_tabs",
  {
    description:
      "List all open browser tabs. Optionally include recent history and downloads for context.",
    inputSchema: {
      historyLimit: z
        .number()
        .optional()
        .describe(
          "Include this many recent history items. Omit to list tabs only.",
        ),
      downloadLimit: z
        .number()
        .optional()
        .describe(
          "Include this many recent download items. Omit to list tabs only.",
        ),
    },
  },
  async ({ historyLimit, downloadLimit }) => {
    try {
      if (historyLimit || downloadLimit) {
        const ctx = await client.getBrowserContext(
          historyLimit ?? 0,
          downloadLimit ?? 0,
        );
        return {
          content: [{ type: "text", text: JSON.stringify(ctx, null, 2) }],
        };
      }
      const tabs = await client.getTabs();
      return {
        content: [{ type: "text", text: JSON.stringify(tabs, null, 2) }],
      };
    } catch (e) {
      return {
        content: [{ type: "text", text: `Failed to list tabs: ${err(e)}` }],
        isError: true,
      };
    }
  },
);

// ============================================================================
// Tool 2: floorp_manage_instance
// ============================================================================

server.registerTool(
  "floorp_manage_instance",
  {
    description:
      "Manage browser automation instances. Create a tab or headless scraper instance, attach to an existing tab, inspect, destroy, or close.",
    inputSchema: {
      action: z
        .enum([
          "create_tab",
          "attach_tab",
          "create_scraper",
          "get_info",
          "exists",
          "destroy",
          "close_tab",
        ])
        .describe(
          "Action: create_tab (open URL in new tab), attach_tab (attach to existing tab by numeric ID), create_scraper (headless instance), get_info (instance details), exists (check alive), destroy (release without closing tab), close_tab (release AND close tab).",
        ),
      url: z.string().optional().describe("URL to open (for create_tab)."),
      tabId: z
        .number()
        .optional()
        .describe(
          "Numeric browser tab ID from floorp_list_tabs (for attach_tab).",
        ),
      instanceId: z
        .string()
        .optional()
        .describe("Instance ID (for get_info, exists, destroy, close_tab)."),
      instanceType: instanceTypeSchema,
      inBackground: z
        .boolean()
        .optional()
        .describe("Open tab in background (default: true)."),
      waitForLoad: z
        .boolean()
        .optional()
        .describe("Wait for page load on create (default: true)."),
    },
  },
  async ({
    action,
    url,
    tabId,
    instanceId,
    instanceType: iType,
    inBackground,
    waitForLoad,
  }) => {
    try {
      const type = instanceType(iType);
      switch (action) {
        case "create_tab": {
          if (!url) {
            return {
              content: [{ type: "text", text: "url is required for create_tab" }],
              isError: true,
            };
          }
          const id = await client.createTabInstance(url, {
            inBackground,
            waitForLoad,
          });
          return {
            content: [
              {
                type: "text",
                text: `Created tab instance. Instance ID: ${id}`,
              },
            ],
          };
        }
        case "attach_tab": {
          if (tabId === undefined) {
            return {
              content: [
                { type: "text", text: "tabId is required for attach_tab" },
              ],
              isError: true,
            };
          }
          const id = await client.attachToTab(String(tabId));
          if (!id) {
            return {
              content: [
                { type: "text", text: `Tab ${tabId} not found.` },
              ],
              isError: true,
            };
          }
          return {
            content: [
              {
                type: "text",
                text: `Attached to tab ${tabId}. Instance ID: ${id}`,
              },
            ],
          };
        }
        case "create_scraper": {
          const id = await client.createScraperInstance();
          return {
            content: [
              {
                type: "text",
                text: `Created headless scraper instance. Instance ID: ${id}`,
              },
            ],
          };
        }
        case "get_info": {
          if (!instanceId) {
            return {
              content: [
                { type: "text", text: "instanceId is required for get_info" },
              ],
              isError: true,
            };
          }
          const info = await client.getInstanceInfo(instanceId);
          return {
            content: [
              { type: "text", text: JSON.stringify(info, null, 2) },
            ],
          };
        }
        case "exists": {
          if (!instanceId) {
            return {
              content: [
                { type: "text", text: "instanceId is required for exists" },
              ],
              isError: true,
            };
          }
          const exists = await client.instanceExists(instanceId, type);
          return {
            content: [{ type: "text", text: `Instance ${instanceId} ${exists ? "exists" : "does not exist"}` }],
          };
        }
        case "destroy": {
          if (!instanceId) {
            return {
              content: [
                { type: "text", text: "instanceId is required for destroy" },
              ],
              isError: true,
            };
          }
          await client.destroyInstance(instanceId, type);
          return {
            content: [
              { type: "text", text: `Destroyed instance ${instanceId} (tab remains open).` },
            ],
          };
        }
        case "close_tab": {
          if (!instanceId) {
            return {
              content: [
                { type: "text", text: "instanceId is required for close_tab" },
              ],
              isError: true,
            };
          }
          await client.closeTab(instanceId);
          return {
            content: [
              { type: "text", text: `Closed tab for instance ${instanceId}.` },
            ],
          };
        }
      }
    } catch (e) {
      return {
        content: [{ type: "text", text: `Instance operation failed: ${err(e)}` }],
        isError: true,
      };
    }
  },
);

// ============================================================================
// Tool 3: floorp_get_browser_info
// ============================================================================

server.registerTool(
  "floorp_get_browser_info",
  {
    description: "Retrieve browser history, downloads, or combined context.",
    inputSchema: {
      type: z
        .enum(["history", "downloads", "context"])
        .describe("Type of browser info to retrieve."),
      limit: z
        .number()
        .optional()
        .describe("Number of items (default: 20)."),
    },
  },
  async ({ type: infoType, limit }) => {
    try {
      const n = limit ?? 20;
      let data: unknown;
      switch (infoType) {
        case "history":
          data = await client.getHistory(n);
          break;
        case "downloads":
          data = await client.getDownloads(n);
          break;
        case "context":
          data = await client.getBrowserContext(n, n);
          break;
      }
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    } catch (e) {
      return {
        content: [
          { type: "text", text: `Failed to get browser info: ${err(e)}` },
        ],
        isError: true,
      };
    }
  },
);

// ============================================================================
// Tool 4: floorp_manage_workspaces
// ============================================================================

server.registerTool(
  "floorp_manage_workspaces",
  {
    description: "List, switch between, or check current Floorp workspace.",
    inputSchema: {
      action: z
        .enum(["list", "current", "switch", "next", "previous"])
        .describe("Workspace action."),
      workspaceId: z
        .string()
        .optional()
        .describe("Target workspace ID (for switch)."),
    },
  },
  async ({ action, workspaceId }) => {
    try {
      switch (action) {
        case "list": {
          const workspaces = await client.listWorkspaces();
          return {
            content: [
              { type: "text", text: JSON.stringify(workspaces, null, 2) },
            ],
          };
        }
        case "current": {
          const currentId = await client.getCurrentWorkspace();
          return {
            content: [{ type: "text", text: currentId ?? "No current workspace" }],
          };
        }
        case "switch": {
          if (!workspaceId) {
            return {
              content: [
                { type: "text", text: "workspaceId is required for switch" },
              ],
              isError: true,
            };
          }
          await client.switchWorkspace(workspaceId);
          return {
            content: [
              { type: "text", text: `Switched to workspace ${workspaceId}` },
            ],
          };
        }
        case "next": {
          await client.switchToNextWorkspace();
          return { content: [{ type: "text", text: "Switched to next workspace" }] };
        }
        case "previous": {
          await client.switchToPreviousWorkspace();
          return {
            content: [{ type: "text", text: "Switched to previous workspace" }],
          };
        }
      }
    } catch (e) {
      return {
        content: [
          { type: "text", text: `Workspace operation failed: ${err(e)}` },
        ],
        isError: true,
      };
    }
  },
);

// ============================================================================
// Tool 5: floorp_get_text (PRIMARY tool for AI agents)
// ============================================================================

server.registerTool(
  "floorp_get_text",
  {
    description:
      "Get page content as Markdown with embedded element fingerprints. This is the PRIMARY tool for understanding page content. Fingerprints in the output (short alphanumeric IDs) can be used directly as the 'fingerprint' parameter in other tools (click, hover, type, etc.) to reliably target elements. Always prefer this over raw HTML.",
    inputSchema: {
      instanceId: instanceIdSchema,
      instanceType: instanceTypeSchema,
      mode: z
        .enum(["full", "scoped", "visible"])
        .optional()
        .describe(
          'Text mode: "full" (entire page, default), "scoped" (within selector), "visible" (viewport only).',
        ),
      selector: z
        .string()
        .optional()
        .describe("CSS selector to scope content (for scoped mode)."),
      viewportMargin: z
        .number()
        .optional()
        .describe("Pixel margin around viewport for visible mode."),
      enableFingerprints: z
        .boolean()
        .optional()
        .default(true)
        .describe(
          "Include element fingerprints in output (default: true). Keep enabled for subsequent element targeting.",
        ),
      includeSelectorMap: z
        .boolean()
        .optional()
        .default(true)
        .describe(
          "Include selector map at end of output (default: true).",
        ),
    },
  },
  async ({
    instanceId,
    instanceType: iType,
    mode,
    selector,
    viewportMargin,
    enableFingerprints,
    includeSelectorMap,
  }) => {
    try {
      const text = await client.getText(
        instanceId,
        {
          mode: mode ?? "full",
          selector,
          viewportMargin,
          enableFingerprints: enableFingerprints ?? true,
          includeSelectorMap: includeSelectorMap ?? true,
        },
        instanceType(iType),
      );
      return {
        content: [{ type: "text", text: text ?? "No text content found." }],
      };
    } catch (e) {
      return {
        content: [{ type: "text", text: `Failed to get text: ${err(e)}` }],
        isError: true,
      };
    }
  },
);

// ============================================================================
// Tool 6: floorp_get_page_info
// ============================================================================

server.registerTool(
  "floorp_get_page_info",
  {
    description:
      "Get page metadata: title, URL, raw HTML, article (Readability extraction), or accessibility tree.",
    inputSchema: {
      instanceId: instanceIdSchema,
      instanceType: instanceTypeSchema,
      info: z
        .enum(["title", "uri", "html", "article", "axTree"])
        .describe("Type of page info to retrieve."),
      selector: z
        .string()
        .optional()
        .describe("CSS selector to scope HTML retrieval."),
      interestingOnly: z
        .boolean()
        .optional()
        .describe("For axTree: show only interesting nodes (default: true)."),
    },
  },
  async ({
    instanceId,
    instanceType: iType,
    info,
    selector,
    interestingOnly,
  }) => {
    try {
      const type = instanceType(iType);
      switch (info) {
        case "title": {
          const title = await client.getTitle(instanceId, type);
          return { content: [{ type: "text", text: title ?? "No title" }] };
        }
        case "uri": {
          const uri = await client.getURI(instanceId, type);
          return { content: [{ type: "text", text: uri ?? "No URI" }] };
        }
        case "html": {
          const html = await client.getHTML(instanceId, selector, type);
          return {
            content: [{ type: "text", text: html ?? "No HTML content." }],
          };
        }
        case "article": {
          const article = await client.getArticle(instanceId, type);
          return {
            content: [
              { type: "text", text: article ? JSON.stringify(article, null, 2) : "Could not extract article." },
            ],
          };
        }
        case "axTree": {
          const tree = await client.getAccessibilityTree(
            instanceId,
            { interestingOnly: interestingOnly ?? true },
            type,
          );
          return {
            content: [
              { type: "text", text: JSON.stringify(tree, null, 2) },
            ],
          };
        }
      }
    } catch (e) {
      return {
        content: [
          { type: "text", text: `Failed to get page info: ${err(e)}` },
        ],
        isError: true,
      };
    }
  },
);

// ============================================================================
// Tool 7: floorp_navigate
// ============================================================================

server.registerTool(
  "floorp_navigate",
  {
    description: "Navigate an instance to a URL. Only http/https URLs are allowed.",
    inputSchema: {
      instanceId: instanceIdSchema,
      instanceType: instanceTypeSchema,
      url: z.string().url().describe("Target URL to navigate to."),
    },
  },
  async ({ instanceId, instanceType: iType, url }) => {
    try {
      const ok = await client.navigate(instanceId, url, instanceType(iType));
      return {
        content: [
          {
            type: "text",
            text: ok ? `Navigated to ${url}` : `Navigation failed`,
          },
        ],
      };
    } catch (e) {
      return {
        content: [{ type: "text", text: `Navigation failed: ${err(e)}` }],
        isError: true,
      };
    }
  },
);

// ============================================================================
// Tool 8: floorp_query_elements
// ============================================================================

server.registerTool(
  "floorp_query_elements",
  {
    description:
      "Query elements by selector, fingerprint, or text. Returns element HTML, text, attributes, values, or state (visible/enabled).",
    inputSchema: {
      instanceId: instanceIdSchema,
      instanceType: instanceTypeSchema,
      query: z
        .enum([
          "element",
          "elements",
          "elementText",
          "elementTextContent",
          "elementByText",
          "value",
          "attribute",
          "isVisible",
          "isEnabled",
        ])
        .describe(
          "Query type: element (outer HTML), elements (all matches), elementText/elementTextContent (text of element), elementByText (find by text content), value (input value), attribute (element attribute), isVisible, isEnabled.",
        ),
      selector: selectorSchema,
      fingerprint: fingerprintSchema,
      text: z
        .string()
        .optional()
        .describe("Text to search for (for elementByText query)."),
      name: z
        .string()
        .optional()
        .describe("Attribute name (for attribute query)."),
    },
  },
  async ({
    instanceId,
    instanceType: iType,
    query,
    selector,
    fingerprint,
    text,
    name,
  }) => {
    try {
      const type = instanceType(iType);
      switch (query) {
        case "element": {
          const el = await client.getElement(instanceId, selector, fingerprint, type);
          return {
            content: [{ type: "text", text: el ?? "Element not found." }],
          };
        }
        case "elements": {
          const els = await client.getElements(instanceId, selector, fingerprint, type);
          return {
            content: [{ type: "text", text: JSON.stringify(els, null, 2) }],
          };
        }
        case "elementText": {
          const t = await client.getElementText(instanceId, selector, fingerprint, type);
          return {
            content: [{ type: "text", text: t ?? "No text found." }],
          };
        }
        case "elementTextContent": {
          const t = await client.getElementTextContent(instanceId, selector, fingerprint, type);
          return {
            content: [{ type: "text", text: t ?? "No text content found." }],
          };
        }
        case "elementByText": {
          if (!text) {
            return {
              content: [{ type: "text", text: "text parameter required for elementByText" }],
              isError: true,
            };
          }
          const el = await client.getElementByText(instanceId, text, type);
          return {
            content: [{ type: "text", text: el ?? "Element not found." }],
          };
        }
        case "value": {
          const v = await client.getValue(instanceId, selector, fingerprint, type);
          return { content: [{ type: "text", text: v ?? "null" }] };
        }
        case "attribute": {
          if (!name) {
            return {
              content: [{ type: "text", text: "name parameter required for attribute query" }],
              isError: true,
            };
          }
          const v = await client.getAttribute(instanceId, name, selector, fingerprint, type);
          return { content: [{ type: "text", text: v ?? "null" }] };
        }
        case "isVisible": {
          const v = await client.isVisible(instanceId, selector, fingerprint, type);
          return { content: [{ type: "text", text: `Visible: ${v}` }] };
        }
        case "isEnabled": {
          const v = await client.isEnabled(instanceId, selector, fingerprint, type);
          return { content: [{ type: "text", text: `Enabled: ${v}` }] };
        }
      }
    } catch (e) {
      return {
        content: [{ type: "text", text: `Query failed: ${err(e)}` }],
        isError: true,
      };
    }
  },
);

// ============================================================================
// Tool 9: floorp_click
// ============================================================================

server.registerTool(
  "floorp_click",
  {
    description:
      "Click an element. Supports single (default), double, and right-click via clickType.",
    inputSchema: {
      instanceId: instanceIdSchema,
      instanceType: instanceTypeSchema,
      selector: selectorSchema,
      fingerprint: fingerprintSchema,
      clickType: z
        .enum(["single", "double", "right"])
        .optional()
        .default("single")
        .describe("Click type: single (default), double, or right."),
      button: z
        .enum(["left", "right", "middle"])
        .optional()
        .describe("Override mouse button."),
      clickCount: z
        .number()
        .optional()
        .describe("Number of clicks."),
      force: z
        .boolean()
        .optional()
        .describe("Skip actionability checks."),
      stabilityTimeout: z
        .number()
        .optional()
        .describe("Max ms to wait for element stability."),
    },
  },
  async ({
    instanceId,
    instanceType: iType,
    selector,
    fingerprint,
    clickType,
    button,
    clickCount,
    force,
    stabilityTimeout,
  }) => {
    try {
      const type = instanceType(iType);
      const ct = clickType ?? "single";
      let ok: boolean;

      if (ct === "double") {
        ok = await client.doubleClick(instanceId, selector, fingerprint, type);
      } else if (ct === "right") {
        ok = await client.rightClick(instanceId, selector, fingerprint, type);
      } else {
        ok = await client.click(
          instanceId,
          selector,
          fingerprint,
          { button, clickCount, force, stabilityTimeout },
          type,
        );
      }
      return {
        content: [
          { type: "text", text: ok ? `Clicked element (${ct})` : `Click failed (${ct})` },
        ],
      };
    } catch (e) {
      return {
        content: [{ type: "text", text: `Click failed: ${err(e)}` }],
        isError: true,
      };
    }
  },
);

// ============================================================================
// Tool 10: floorp_hover
// ============================================================================

server.registerTool(
  "floorp_hover",
  {
    description: "Hover over, scroll to, or focus an element.",
    inputSchema: {
      instanceId: instanceIdSchema,
      instanceType: instanceTypeSchema,
      action: z
        .enum(["hover", "scrollTo", "focus"])
        .describe("Action: hover over element, scroll element into view, or focus element."),
      selector: selectorSchema,
      fingerprint: fingerprintSchema,
    },
  },
  async ({ instanceId, instanceType: iType, action, selector, fingerprint }) => {
    try {
      const type = instanceType(iType);
      let ok: boolean;
      switch (action) {
        case "hover":
          ok = await client.hover(instanceId, selector, fingerprint, type);
          break;
        case "scrollTo":
          ok = await client.scrollTo(instanceId, selector, fingerprint, type);
          break;
        case "focus":
          ok = await client.focus(instanceId, selector, fingerprint, type);
          break;
      }
      return {
        content: [
          { type: "text", text: ok ? `${action} succeeded` : `${action} failed` },
        ],
      };
    } catch (e) {
      return {
        content: [{ type: "text", text: `${action} failed: ${err(e)}` }],
        isError: true,
      };
    }
  },
);

// ============================================================================
// Tool 11: floorp_type
// ============================================================================

server.registerTool(
  "floorp_type",
  {
    description:
      "Type text into an element, clear input, press a key, or dispatch a text input event.",
    inputSchema: {
      instanceId: instanceIdSchema,
      instanceType: instanceTypeSchema,
      action: z
        .enum(["input", "clearInput", "pressKey", "dispatchTextInput"])
        .describe(
          "Action: input (type value into element), clearInput (clear field), pressKey (press key like Enter/Tab), dispatchTextInput (trigger input event for rich editors).",
        ),
      selector: selectorSchema,
      fingerprint: fingerprintSchema,
      value: z
        .string()
        .optional()
        .describe("Text value to input (for input action)."),
      key: z
        .string()
        .optional()
        .describe('Key to press, e.g. "Enter", "Tab", "a" (for pressKey).'),
      text: z
        .string()
        .optional()
        .describe("Text for dispatchTextInput action."),
      typingMode: z
        .boolean()
        .optional()
        .describe("Type character-by-character to simulate real typing."),
      typingDelayMs: z
        .number()
        .optional()
        .describe("Delay between keystrokes in typing mode (ms)."),
    },
  },
  async ({
    instanceId,
    instanceType: iType,
    action,
    selector,
    fingerprint,
    value,
    key,
    text,
    typingMode,
    typingDelayMs,
  }) => {
    try {
      const type = instanceType(iType);
      let ok: boolean;
      switch (action) {
        case "input":
          if (value === undefined) {
            return {
              content: [{ type: "text", text: "value is required for input action" }],
              isError: true,
            };
          }
          ok = await client.input(
            instanceId,
            selector ?? "",
            value,
            { typingMode, typingDelayMs },
            type,
          );
          break;
        case "clearInput":
          ok = await client.clearInput(instanceId, selector, fingerprint, type);
          break;
        case "pressKey":
          if (!key) {
            return {
              content: [{ type: "text", text: "key is required for pressKey action" }],
              isError: true,
            };
          }
          ok = await client.pressKey(instanceId, key, type);
          break;
        case "dispatchTextInput":
          if (text === undefined) {
            return {
              content: [
                { type: "text", text: "text is required for dispatchTextInput action" },
              ],
              isError: true,
            };
          }
          ok = await client.dispatchTextInput(
            instanceId,
            text,
            selector,
            fingerprint,
            type,
          );
          break;
      }
      return {
        content: [
          { type: "text", text: ok ? `${action} succeeded` : `${action} failed` },
        ],
      };
    } catch (e) {
      return {
        content: [{ type: "text", text: `${action} failed: ${err(e)}` }],
        isError: true,
      };
    }
  },
);

// ============================================================================
// Tool 12: floorp_fill_form
// ============================================================================

server.registerTool(
  "floorp_fill_form",
  {
    description:
      "Fill multiple form fields at once. Keys in formData can be CSS selectors OR element fingerprints from floorp_get_text output.",
    inputSchema: {
      instanceId: instanceIdSchema,
      instanceType: instanceTypeSchema,
      formData: z
        .record(z.string())
        .describe(
          "Map of CSS selectors or element fingerprints to values. Fingerprint keys (8 or 16 lowercase alphanumeric chars) are auto-resolved.",
        ),
      typingMode: z
        .boolean()
        .optional()
        .describe("Type character-by-character."),
      typingDelayMs: z
        .number()
        .optional()
        .describe("Delay between keystrokes in typing mode (ms)."),
    },
  },
  async ({ instanceId, instanceType: iType, formData, typingMode, typingDelayMs }) => {
    try {
      const ok = await client.fillForm(
        instanceId,
        formData,
        { typingMode, typingDelayMs },
        instanceType(iType),
      );
      return {
        content: [
          { type: "text", text: ok ? "Form filled successfully" : "Failed to fill form" },
        ],
      };
    } catch (e) {
      return {
        content: [{ type: "text", text: `Fill form failed: ${err(e)}` }],
        isError: true,
      };
    }
  },
);

// ============================================================================
// Tool 13: floorp_form_action
// ============================================================================

server.registerTool(
  "floorp_form_action",
  {
    description: "Submit a form, select a dropdown option, or set checkbox/radio state.",
    inputSchema: {
      instanceId: instanceIdSchema,
      instanceType: instanceTypeSchema,
      action: z
        .enum(["submit", "selectOption", "setChecked"])
        .describe("Form action: submit (submit form), selectOption (choose dropdown), setChecked (check/uncheck)."),
      selector: selectorSchema,
      fingerprint: fingerprintSchema,
      value: z
        .string()
        .optional()
        .describe("Option value (for selectOption)."),
      checked: z
        .boolean()
        .optional()
        .describe("Checked state (for setChecked)."),
    },
  },
  async ({
    instanceId,
    instanceType: iType,
    action,
    selector,
    fingerprint,
    value,
    checked,
  }) => {
    try {
      const type = instanceType(iType);
      let ok: boolean;
      switch (action) {
        case "submit":
          ok = await client.submit(instanceId, selector, fingerprint, type);
          break;
        case "selectOption":
          ok = await client.selectOption(
            instanceId,
            value ?? "",
            selector,
            fingerprint,
            type,
          );
          break;
        case "setChecked":
          ok = await client.setChecked(
            instanceId,
            checked ?? false,
            selector,
            fingerprint,
            type,
          );
          break;
      }
      return {
        content: [
          { type: "text", text: ok ? `${action} succeeded` : `${action} failed` },
        ],
      };
    } catch (e) {
      return {
        content: [{ type: "text", text: `${action} failed: ${err(e)}` }],
        isError: true,
      };
    }
  },
);

// ============================================================================
// Tool 14: floorp_drag_and_drop
// ============================================================================

server.registerTool(
  "floorp_drag_and_drop",
  {
    description: "Drag an element and drop it onto another element.",
    inputSchema: {
      instanceId: instanceIdSchema,
      instanceType: instanceTypeSchema,
      sourceSelector: z.string().optional().describe("CSS selector for source element."),
      sourceFingerprint: z.string().optional().describe("Fingerprint for source element."),
      targetSelector: z.string().optional().describe("CSS selector for target element."),
      targetFingerprint: z.string().optional().describe("Fingerprint for target element."),
    },
  },
  async ({
    instanceId,
    instanceType: iType,
    sourceSelector,
    sourceFingerprint,
    targetSelector,
    targetFingerprint,
  }) => {
    try {
      const ok = await client.dragAndDrop(
        instanceId,
        sourceSelector,
        sourceFingerprint,
        targetSelector,
        targetFingerprint,
        instanceType(iType),
      );
      return {
        content: [
          { type: "text", text: ok ? "Drag and drop succeeded" : "Drag and drop failed" },
        ],
      };
    } catch (e) {
      return {
        content: [{ type: "text", text: `Drag and drop failed: ${err(e)}` }],
        isError: true,
      };
    }
  },
);

// ============================================================================
// Tool 15: floorp_wait
// ============================================================================

server.registerTool(
  "floorp_wait",
  {
    description:
      "Wait for an element to appear, page to be ready, or network to become idle.",
    inputSchema: {
      instanceId: instanceIdSchema,
      instanceType: instanceTypeSchema,
      waitType: z
        .enum(["element", "ready", "networkIdle"])
        .optional()
        .default("element")
        .describe("What to wait for: element (default), page ready, or network idle."),
      selector: selectorSchema.describe("CSS selector (for element wait)."),
      fingerprint: fingerprintSchema.describe(
        "Element fingerprint (for element wait, cannot be used with state=attached).",
      ),
      timeout: z
        .number()
        .optional()
        .describe("Timeout in ms (default: 5000 for element, 15000 for ready)."),
      state: z
        .enum(["attached", "visible", "hidden", "detached"])
        .optional()
        .describe("Element state to wait for (default: attached)."),
      maxInflight: z
        .number()
        .optional()
        .describe("For networkIdle: max concurrent requests considered idle (default: 0)."),
      idleDuration: z
        .number()
        .optional()
        .describe("For networkIdle: ms of idle time before resolving (default: 500)."),
      ignorePatterns: z
        .array(z.string())
        .optional()
        .describe("For networkIdle: URL regex patterns to ignore."),
    },
  },
  async ({
    instanceId,
    instanceType: iType,
    waitType,
    selector,
    fingerprint,
    timeout,
    state,
    maxInflight,
    idleDuration,
    ignorePatterns,
  }) => {
    try {
      const type = instanceType(iType);
      const wt = waitType ?? "element";
      let ok: boolean;

      switch (wt) {
        case "element":
          ok = await client.waitForElement(
            instanceId,
            selector,
            fingerprint,
            timeout,
            state as "attached" | "visible" | "hidden" | "detached" | undefined,
            type,
          );
          break;
        case "ready":
          ok = await client.waitForReady(instanceId, timeout, type);
          break;
        case "networkIdle":
          ok = await client.waitForNetworkIdle(
            instanceId,
            { timeout, maxInflight, idleDuration, ignorePatterns },
            type,
          );
          break;
      }

      return {
        content: [
          { type: "text", text: ok ? `${wt} wait succeeded` : `${wt} wait timed out` },
        ],
      };
    } catch (e) {
      return {
        content: [{ type: "text", text: `Wait failed: ${err(e)}` }],
        isError: true,
      };
    }
  },
);

// ============================================================================
// Tool 16: floorp_screenshot
// ============================================================================

server.registerTool(
  "floorp_screenshot",
  {
    description: "Take a screenshot: viewport, full page, element, or arbitrary region.",
    inputSchema: {
      instanceId: instanceIdSchema,
      instanceType: instanceTypeSchema,
      type: z
        .enum(["viewport", "fullPage", "element", "region"])
        .optional()
        .default("viewport")
        .describe("Screenshot type: viewport (default), fullPage, element (needs selector/fingerprint), region (needs rect)."),
      selector: selectorSchema.describe("CSS selector (for element screenshot)."),
      fingerprint: fingerprintSchema.describe("Element fingerprint (for element screenshot)."),
      rect: z
        .object({
          x: z.number().optional(),
          y: z.number().optional(),
          width: z.number().optional(),
          height: z.number().optional(),
        })
        .optional()
        .describe("Region rectangle (for region screenshot)."),
    },
  },
  async ({ instanceId, instanceType: iType, type: ssType, selector, fingerprint, rect }) => {
    try {
      const t = instanceType(iType);
      const st = ssType ?? "viewport";
      let image: string | null;

      switch (st) {
        case "viewport":
          image = await client.takeScreenshot(instanceId, t);
          break;
        case "fullPage":
          image = await client.takeFullPageScreenshot(instanceId, t);
          break;
        case "element":
          image = await client.takeElementScreenshot(instanceId, selector, fingerprint, t);
          break;
        case "region":
          image = await client.takeRegionScreenshot(instanceId, rect, t);
          break;
      }

      if (!image) {
        return {
          content: [{ type: "text", text: "Failed to take screenshot" }],
          isError: true,
        };
      }

      return {
        content: [{ type: "image", data: image, mimeType: "image/png" }],
      };
    } catch (e) {
      return {
        content: [{ type: "text", text: `Screenshot failed: ${err(e)}` }],
        isError: true,
      };
    }
  },
);

// ============================================================================
// Tool 17: floorp_cookies
// ============================================================================

server.registerTool(
  "floorp_cookies",
  {
    description: "Get or set cookies for the instance's current page.",
    inputSchema: {
      instanceId: instanceIdSchema,
      instanceType: instanceTypeSchema,
      action: z
        .enum(["get", "set"])
        .optional()
        .default("get")
        .describe("Cookie action: get (default) or set."),
      name: z.string().optional().describe("Cookie name (for set)."),
      value: z.string().optional().describe("Cookie value (for set)."),
      domain: z.string().optional().describe("Cookie domain (for set)."),
      path: z.string().optional().describe("Cookie path (for set, default /)."),
      secure: z.boolean().optional().describe("Secure flag (for set)."),
      httpOnly: z.boolean().optional().describe("HttpOnly flag (for set)."),
      sameSite: z
        .enum(["Strict", "Lax", "None"])
        .optional()
        .describe("SameSite policy (for set, default Lax)."),
      expirationDate: z
        .number()
        .optional()
        .describe("Expiration as Unix timestamp (for set)."),
    },
  },
  async ({
    instanceId,
    instanceType: iType,
    action,
    name,
    value,
    domain,
    path,
    secure,
    httpOnly,
    sameSite,
    expirationDate,
  }) => {
    try {
      const type = instanceType(iType);
      const act = action ?? "get";

      if (act === "get") {
        const cookies = await client.getCookies(instanceId, type);
        return {
          content: [{ type: "text", text: JSON.stringify(cookies, null, 2) }],
        };
      }

      // set
      if (!name || !value) {
        return {
          content: [
            { type: "text", text: "name and value are required for set action" },
          ],
          isError: true,
        };
      }
      const ok = await client.setCookie(
        instanceId,
        { name, value, domain, path, secure, httpOnly, sameSite, expirationDate },
        type,
      );
      return {
        content: [
          { type: "text", text: ok ? "Cookie set successfully" : "Failed to set cookie" },
        ],
      };
    } catch (e) {
      return {
        content: [{ type: "text", text: `Cookie operation failed: ${err(e)}` }],
        isError: true,
      };
    }
  },
);

// ============================================================================
// Tool 18: floorp_handle_dialog
// ============================================================================

server.registerTool(
  "floorp_handle_dialog",
  {
    description: "Accept or dismiss a browser dialog (alert, confirm, prompt).",
    inputSchema: {
      instanceId: instanceIdSchema,
      instanceType: instanceTypeSchema,
      action: z
        .enum(["accept", "dismiss"])
        .describe("Dialog action: accept (OK) or dismiss (Cancel)."),
    },
  },
  async ({ instanceId, instanceType: iType, action }) => {
    try {
      const type = instanceType(iType);
      const ok =
        action === "accept"
          ? await client.acceptAlert(instanceId, type)
          : await client.dismissAlert(instanceId, type);
      return {
        content: [
          { type: "text", text: ok ? `Dialog ${action}ed` : `Dialog ${action} failed` },
        ],
      };
    } catch (e) {
      return {
        content: [{ type: "text", text: `Dialog handling failed: ${err(e)}` }],
        isError: true,
      };
    }
  },
);

// ============================================================================
// Tool 19: floorp_advanced
// ============================================================================

server.registerTool(
  "floorp_advanced",
  {
    description:
      "Advanced DOM operations: set innerHTML/textContent, dispatch events, upload files, resolve fingerprints, or clear visual effects.",
    inputSchema: {
      instanceId: instanceIdSchema,
      instanceType: instanceTypeSchema,
      action: z
        .enum([
          "setInnerHTML",
          "setTextContent",
          "dispatchEvent",
          "uploadFile",
          "resolveFingerprint",
          "clearEffects",
          "evaluate",
        ])
        .describe(
          "Advanced action: setInnerHTML (set element HTML), setTextContent (set element text), dispatchEvent (fire custom event), uploadFile (upload via input[type=file]), resolveFingerprint (convert fingerprint to CSS selector), clearEffects (remove visual overlays), evaluate (run JavaScript in the page context).",
        ),
      selector: selectorSchema,
      fingerprint: fingerprintSchema,
      html: z.string().optional().describe("HTML content (for setInnerHTML)."),
      text: z.string().optional().describe("Text content (for setTextContent)."),
      eventType: z
        .string()
        .optional()
        .describe("Event type to dispatch, e.g. 'input', 'change' (for dispatchEvent)."),
      eventOptions: z
        .object({ bubbles: z.boolean().optional(), cancelable: z.boolean().optional() })
        .optional()
        .describe("Event options (for dispatchEvent)."),
      filePath: z
        .string()
        .optional()
        .describe("Local file path to upload (for uploadFile)."),
      script: z
        .string()
        .optional()
        .describe(
          "JavaScript code to evaluate in the page context (for evaluate). Supports async/await. Must return a JSON-serializable value. Runs in the page's scope with access to document, window, etc.",
        ),
    },
  },
  async ({
    instanceId,
    instanceType: iType,
    action,
    selector,
    fingerprint,
    html,
    text,
    eventType,
    eventOptions,
    filePath,
    script,
  }) => {
    try {
      const type = instanceType(iType);
      let ok: boolean;

      switch (action) {
        case "setInnerHTML":
          ok = await client.setInnerHTML(
            instanceId,
            html ?? "",
            selector,
            fingerprint,
            type,
          );
          break;
        case "setTextContent":
          ok = await client.setTextContent(
            instanceId,
            text ?? "",
            selector,
            fingerprint,
            type,
          );
          break;
        case "dispatchEvent":
          if (!eventType) {
            return {
              content: [
                { type: "text", text: "eventType is required for dispatchEvent" },
              ],
              isError: true,
            };
          }
          ok = await client.dispatchEvent(
            instanceId,
            eventType,
            selector,
            fingerprint,
            eventOptions,
            type,
          );
          break;
        case "uploadFile":
          if (!filePath) {
            return {
              content: [
                { type: "text", text: "filePath is required for uploadFile" },
              ],
              isError: true,
            };
          }
          ok = await client.uploadFile(
            instanceId,
            filePath,
            selector,
            fingerprint,
            type,
          );
          break;
        case "resolveFingerprint": {
          if (!fingerprint) {
            return {
              content: [
                { type: "text", text: "fingerprint is required for resolveFingerprint" },
              ],
              isError: true,
            };
          }
          const resolved = await client.resolveFingerprint(instanceId, fingerprint, type);
          return {
            content: [
              {
                type: "text",
                text: resolved
                  ? `Resolved fingerprint ${fingerprint} → ${resolved}`
                  : `Fingerprint ${fingerprint} not found`,
              },
            ],
          };
        }
        case "clearEffects":
          ok = await client.clearEffects(instanceId, type);
          break;
        case "evaluate": {
          if (!script) {
            return {
              content: [
                { type: "text", text: "script is required for evaluate action" },
              ],
              isError: true,
            };
          }
          const result: EvaluateResult | null = await client.evaluate(
            instanceId,
            script,
            type,
          );
          if (!result) {
            return {
              content: [{ type: "text", text: "Evaluation returned null" }],
              isError: true,
            };
          }
          if (!result.success) {
            return {
              content: [
                {
                  type: "text",
                  text: `Evaluation error (${result.errorType ?? "Error"}): ${result.error}`,
                },
              ],
              isError: true,
            };
          }
          return {
            content: [
              {
                type: "text",
                text:
                  result.result !== undefined
                    ? JSON.stringify(result.result, null, 2)
                    : `undefined (${result.resultType})`,
              },
            ],
          };
        }
      }

      return {
        content: [
          { type: "text", text: ok ? `${action} succeeded` : `${action} failed` },
        ],
      };
    } catch (e) {
      return {
        content: [{ type: "text", text: `${action} failed: ${err(e)}` }],
        isError: true,
      };
    }
  },
);

// -- Main ---------------------------------------------------------------------

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
