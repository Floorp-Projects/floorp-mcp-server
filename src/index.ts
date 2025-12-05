#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { FloorpClient } from "./client.js";

// Initialize client
const client = new FloorpClient();

const server = new McpServer({
  name: "floorp-os",
  version: "1.0.0",
});

// -- Resources --

server.registerResource(
  "floorp-tabs",
  "floorp://tabs",
  { description: "List of open tabs" },
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
  }
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
  }
);

// -- Tools --

server.registerTool(
  "floorp_attach_tab",
  {
    description: "Attach to an existing tab by its ID to enable automation",
    inputSchema: {
      tabId: z
        .number()
        .describe("The numeric ID of the tab (from floorp_list_tabs)"),
    },
  },
  async ({ tabId }) => {
    try {
      const instanceId = await client.attachToTab(tabId);
      return {
        content: [
          {
            type: "text",
            text: `Attached to tab ${tabId}. Use this Instance ID for automation: ${instanceId}`,
          },
        ],
      };
    } catch (e: any) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to attach to tab: ${e.message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "floorp_list_tabs",
  {
    description: "List all open tabs",
    inputSchema: {
      limit: z
        .number()
        .optional()
        .describe("Limit number of tabs to return (default: all)"),
    },
  },
  async ({ limit }) => {
    const tabs = await client.getTabs();
    const result = limit ? tabs.slice(0, limit) : tabs;
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }
);

server.registerTool(
  "floorp_create_tab",
  {
    description: "Create a new tab",
    inputSchema: {
      url: z.string().url(),
      inBackground: z.boolean().optional(),
    },
  },
  async ({ url, inBackground }) => {
    const id = await client.createTab(url, inBackground);
    return {
      content: [{ type: "text", text: `Created tab with ID: ${id}` }],
    };
  }
);

server.registerTool(
  "floorp_get_content",
  {
    description: "Get content from a tab (HTML or text)",
    inputSchema: {
      tabId: z
        .string()
        .describe(
          "Instance ID of the tab (from floorp_attach_tab or floorp_create_tab)."
        ),
      selector: z
        .string()
        .optional()
        .describe(
          "CSS selector to get text content from. If omitted, returns full page HTML."
        ),
    },
  },
  async ({ tabId, selector }) => {
    if (selector) {
      const text = await client.getElementTextContent(tabId, selector);
      return {
        content: [
          {
            type: "text",
            text:
              text ?? "Element found but has no text, or element not found.",
          },
        ],
      };
    } else {
      const html = await client.getHTML(tabId);
      return {
        content: [{ type: "text", text: html ?? "No HTML content found." }],
      };
    }
  }
);

server.registerTool(
  "floorp_navigate",
  {
    description: "Navigate a tab to a URL",
    inputSchema: {
      tabId: z
        .string()
        .describe("Instance ID (from floorp_attach_tab or floorp_create_tab)"),
      url: z.string().url(),
    },
  },
  async ({ tabId, url }) => {
    const ok = await client.navigate(tabId, url);
    return {
      content: [
        {
          type: "text",
          text: ok ? `Navigated tab ${tabId} to ${url}` : "Navigation failed",
        },
      ],
    };
  }
);

server.registerTool(
  "floorp_click",
  {
    description: "Click an element",
    inputSchema: {
      tabId: z
        .string()
        .describe("Instance ID (from floorp_attach_tab or floorp_create_tab)"),
      selector: z.string(),
    },
  },
  async ({ tabId, selector }) => {
    const ok = await client.click(tabId, selector);
    return {
      content: [
        {
          type: "text",
          text: ok ? `Clicked ${selector} in tab ${tabId}` : "Click failed",
        },
      ],
    };
  }
);

server.registerTool(
  "floorp_fill_form",
  {
    description: "Fill a form with multiple values",
    inputSchema: {
      tabId: z.string(),
      formData: z
        .record(z.string())
        .describe("Map of CSS selectors to value strings"),
    },
  },
  async ({ tabId, formData }) => {
    const ok = await client.fillForm(tabId, formData);
    return {
      content: [
        {
          type: "text",
          text: ok ? "Form filled successfully" : "Failed to fill form",
        },
      ],
    };
  }
);

server.registerTool(
  "floorp_screenshot",
  {
    description: "Take a screenshot of the viewport, page, or element",
    inputSchema: {
      tabId: z
        .string()
        .describe("Instance ID (from floorp_attach_tab or floorp_create_tab)"),
      selector: z
        .string()
        .optional()
        .describe(
          "CSS selector for element screenshot. Omit for viewport screenshot."
        ),
      fullPage: z
        .boolean()
        .optional()
        .describe("Take full page screenshot (ignores selector if true)."),
    },
  },
  async ({ tabId, selector, fullPage }) => {
    let image: string | null;
    if (fullPage) {
      image = await client.takeFullPageScreenshot(tabId);
    } else {
      image = await client.takeScreenshot(tabId, selector);
    }

    if (!image) {
      return {
        content: [{ type: "text", text: "Failed to take screenshot" }],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: "image",
          data: image,
          mimeType: "image/png",
        },
      ],
    };
  }
);

server.registerTool(
  "floorp_scroll",
  {
    description: "Scroll an element into view",
    inputSchema: {
      tabId: z.string(),
      selector: z.string().describe("Element to scroll into view"),
    },
  },
  async ({ tabId, selector }) => {
    const ok = await client.scrollTo(tabId, selector);
    return {
      content: [
        { type: "text", text: ok ? "Scrolled to element" : "Failed to scroll" },
      ],
    };
  }
);

server.registerTool(
  "floorp_hover",
  {
    description: "Hover over an element",
    inputSchema: {
      tabId: z.string(),
      selector: z.string(),
    },
  },
  async ({ tabId, selector }) => {
    const ok = await client.hover(tabId, selector);
    return {
      content: [
        { type: "text", text: ok ? "Hovered element" : "Failed to hover" },
      ],
    };
  }
);

server.registerTool(
  "floorp_wait",
  {
    description: "Wait for an element to appear",
    inputSchema: {
      tabId: z.string(),
      selector: z.string(),
      timeout: z.number().optional().describe("Timeout in ms (default 5000)"),
    },
  },
  async ({ tabId, selector, timeout }) => {
    const found = await client.waitForElement(tabId, selector, timeout);
    return {
      content: [
        {
          type: "text",
          text: found ? "Element found" : "Element not found (timeout)",
        },
      ],
    };
  }
);

server.registerTool(
  "floorp_get_value",
  {
    description: "Get the value of an input element",
    inputSchema: {
      tabId: z.string(),
      selector: z.string(),
    },
  },
  async ({ tabId, selector }) => {
    const value = await client.getValue(tabId, selector);
    return {
      content: [{ type: "text", text: value ?? "null" }],
    };
  }
);

server.registerTool(
  "floorp_get_cookies",
  {
    description: "Get cookies for a tab",
    inputSchema: {
      tabId: z.string(),
    },
  },
  async ({ tabId }) => {
    const cookies = await client.getCookies(tabId);
    return {
      content: [{ type: "text", text: JSON.stringify(cookies, null, 2) }],
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
