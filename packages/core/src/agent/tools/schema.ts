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
      description: "Read a file. Returns content and hash for later writes.",
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
      description: "Run a shell command in the workspace (deny-listed commands blocked).",
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
];

export const APPROVAL_REQUIRED = new Set(["delete_file"]);
