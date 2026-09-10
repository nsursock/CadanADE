import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import type { Extension } from "@codemirror/state";

/** ScifiUI token–driven syntax colors for CodeMirror. */
export const scifiHighlightStyle = HighlightStyle.define([
  { tag: t.keyword, color: "var(--scifi-primary)" },
  { tag: t.operator, color: "var(--scifi-cyan)" },
  { tag: t.special(t.variableName), color: "var(--scifi-cyan)" },
  { tag: t.typeName, color: "var(--scifi-secondary, var(--scifi-cyan))" },
  { tag: t.className, color: "var(--scifi-secondary, var(--scifi-cyan))" },
  { tag: t.namespace, color: "var(--scifi-cyan)" },
  { tag: t.definition(t.variableName), color: "var(--scifi-text)" },
  { tag: t.propertyName, color: "var(--scifi-text)" },
  { tag: t.variableName, color: "var(--scifi-text)" },
  { tag: t.function(t.variableName), color: "var(--scifi-warning)" },
  { tag: t.function(t.propertyName), color: "var(--scifi-warning)" },
  { tag: t.definition(t.propertyName), color: "var(--scifi-warning)" },
  { tag: t.labelName, color: "var(--scifi-warning)" },
  { tag: t.attributeName, color: "var(--scifi-warning)" },
  { tag: t.attributeValue, color: "var(--scifi-success)" },
  { tag: t.string, color: "var(--scifi-success)" },
  { tag: t.character, color: "var(--scifi-success)" },
  { tag: t.number, color: "var(--scifi-warning)" },
  { tag: t.bool, color: "var(--scifi-primary)" },
  { tag: t.null, color: "var(--scifi-primary)" },
  { tag: t.comment, color: "var(--scifi-muted)", fontStyle: "italic" },
  { tag: t.lineComment, color: "var(--scifi-muted)", fontStyle: "italic" },
  { tag: t.blockComment, color: "var(--scifi-muted)", fontStyle: "italic" },
  { tag: t.docComment, color: "var(--scifi-muted)", fontStyle: "italic" },
  { tag: t.meta, color: "var(--scifi-muted)" },
  { tag: t.punctuation, color: "var(--scifi-muted)" },
  { tag: t.bracket, color: "var(--scifi-muted)" },
  { tag: t.paren, color: "var(--scifi-muted)" },
  { tag: t.squareBracket, color: "var(--scifi-muted)" },
  { tag: t.brace, color: "var(--scifi-muted)" },
  { tag: t.tagName, color: "var(--scifi-primary)" },
  { tag: t.angleBracket, color: "var(--scifi-muted)" },
  { tag: t.heading, color: "var(--scifi-primary)", fontWeight: "700" },
  { tag: t.link, color: "var(--scifi-cyan)", textDecoration: "underline" },
  { tag: t.url, color: "var(--scifi-cyan)" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strong, fontWeight: "700" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  { tag: t.invalid, color: "var(--scifi-error)" },
  { tag: t.regexp, color: "var(--scifi-success)" },
  { tag: t.escape, color: "var(--scifi-warning)" },
]);

export const scifiSyntaxHighlighting = syntaxHighlighting(scifiHighlightStyle);

export function languageSupportForPath(path: string | null | undefined): Extension {
  if (!path) return [];
  const name = path.split("/").pop() ?? path;
  const lower = name.toLowerCase();

  if (/\.tsx$/.test(lower)) return javascript({ typescript: true, jsx: true });
  if (/\.jsx$/.test(lower)) return javascript({ jsx: true });
  if (/\.(ts|mts|cts)$/.test(lower)) return javascript({ typescript: true });
  if (/\.(js|mjs|cjs)$/.test(lower)) return javascript();
  if (/\.py$/.test(lower)) return python();
  if (/\.json$/.test(lower)) return json();
  if (/\.(md|mdx)$/.test(lower)) return markdown();
  if (/\.(html|htm|svelte|vue)$/.test(lower)) return html({ selfClosingTags: true });
  if (/\.(css|scss)$/.test(lower)) return css();

  return [];
}
