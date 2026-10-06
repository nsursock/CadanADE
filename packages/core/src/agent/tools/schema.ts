import type { ProviderTool } from "../provider.js";

export const TOOL_SCHEMAS: ProviderTool[] = [
  {
    type: "function",
    function: {
      name: "list_files",
      description: "List files and directories under a workspace path.",
      parameters: {
        type: "object",
        properties: {
          dir: { type: "string", description: "Relative directory (default: root)." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description:
        "Read a file. Returns content and hash for later writes. Prefer startLine/endLine for large files. In thrift mode, full reads over the line threshold return an outline instead of body (except files you wrote this turn).",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          startLine: { type: "number" },
          endLine: { type: "number" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_files",
      description: "Search workspace text with an optional glob filter (regex).",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          glob: { type: "string" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Write full file content. Pass expectedHash when overwriting.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          content: { type: "string" },
          expectedHash: { type: "string" },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "edit_file",
      description:
        "Edit a file by replacing a specific string segment. Pass expectedHash from the last read to detect concurrent changes. By default oldString must be unique; set replaceAll to replace every occurrence.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          oldString: { type: "string", description: "The exact text to find (must match verbatim, including whitespace)." },
          newString: { type: "string", description: "The replacement text." },
          expectedHash: { type: "string" },
          replaceAll: { type: "boolean", description: "Replace every occurrence instead of requiring uniqueness." },
        },
        required: ["path", "oldString", "newString"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_file",
      description: "Create a new file. Fails if it already exists.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          content: { type: "string" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_file",
      description: "Delete a file. Requires user approval.",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "execute_command",
      description:
        "Run a shell command. The working directory is already the workspace root — do not cd into it. Deny-listed commands are blocked.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string" },
          timeoutMs: { type: "number" },
        },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_ledger",
      description:
        "Record progress on one line of the requirements ledger. Evidence quotes are matched against real tool output from this turn and rejected if invented. Use status 'deviation' with a reason when a required tool, library or feature cannot work here — never substitute silently.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Ledger id from the checklist, e.g. R3." },
          status: { type: "string", enum: ["done", "deviation", "todo"] },
          note: {
            type: "string",
            description: "Required for 'deviation': what could not work and what you did instead.",
          },
          evidence: {
            type: "object",
            description: "Proof this line holds, copied verbatim from output you produced this turn.",
            properties: {
              command: { type: "string", description: "The command you ran that produced the evidence." },
              quote: {
                type: "string",
                description: "At least 12 characters copied verbatim from that command's output.",
              },
            },
            required: ["quote"],
          },
        },
        required: ["id", "status"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_search",
      description:
        "Search the web using a search engine. Returns a list of results with titles, URLs, and snippets.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query." },
          limit: { type: "number", description: "Maximum number of results (default: 10)." },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_fetch",
      description:
        "Fetch content from a URL. Returns the page content as text, markdown, or HTML.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL to fetch." },
          format: { type: "string", enum: ["text", "markdown", "html"], description: "Output format (default: markdown)." },
          timeout: { type: "number", description: "Timeout in seconds (default: 30, max: 120)." },
        },
        required: ["url"],
      },
    },
  },
];

export const APPROVAL_REQUIRED = new Set(["delete_file"]);

export const LEDGER_TOOL = "update_ledger";

/** Tool list for a turn, minus ledger bookkeeping when there is no ledger. */
export function toolSchemasFor(hasLedger: boolean): ProviderTool[] {
  return hasLedger ? TOOL_SCHEMAS : TOOL_SCHEMAS.filter((t) => t.function.name !== LEDGER_TOOL);
}
