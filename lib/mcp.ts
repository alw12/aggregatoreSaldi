/**
 * Server MCP (Model Context Protocol) su HTTP "streamable", senza stato: ogni POST porta un messaggio
 * JSON-RPC e riceve la risposta in JSON. Logica pura, testata in mcp.test.ts; gli strumenti veri sono
 * in mcp-tools.ts.
 */

export const PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
export const SERVER_INFO = { name: "saldi", title: "Saldi", version: "1.0.0" };

type Prop =
  | { type: "string"; description: string; enum?: readonly string[]; pattern?: string }
  | { type: "integer"; description: string; minimum?: number; maximum?: number };

export type InputSchema = { type: "object"; properties: Record<string, Prop>; required?: string[]; additionalProperties: false };

export type Tool = {
  name: string;
  title: string;
  description: string;
  inputSchema: InputSchema;
  run: (args: Record<string, unknown>) => Promise<unknown>;
};

type JsonRpcId = string | number;
type Request = { jsonrpc: "2.0"; id?: JsonRpcId | null; method: string; params?: Record<string, unknown> };
export type Response =
  | { jsonrpc: "2.0"; id: JsonRpcId | null; result: unknown }
  | { jsonrpc: "2.0"; id: JsonRpcId | null; error: { code: number; message: string; data?: unknown } };

export const PARSE_ERROR = -32700;
export const INVALID_REQUEST = -32600;
export const METHOD_NOT_FOUND = -32601;
export const INVALID_PARAMS = -32602;
export const INTERNAL_ERROR = -32603;

const err = (id: JsonRpcId | null, code: number, message: string): Response => ({ jsonrpc: "2.0", id, error: { code, message } });

/** Controllo degli argomenti sullo schema dichiarato: tipi, enum, pattern, limiti, obbligatori, extra. */
export function validateArgs(schema: InputSchema, args: unknown): string | null {
  if (args === undefined || args === null) args = {};
  if (typeof args !== "object" || Array.isArray(args)) return "Gli argomenti devono essere un oggetto";
  const a = args as Record<string, unknown>;
  for (const k of schema.required ?? []) if (a[k] === undefined) return `Manca il parametro "${k}"`;
  for (const [k, v] of Object.entries(a)) {
    const p = schema.properties[k];
    if (!p) return `Parametro sconosciuto "${k}"`;
    if (v === undefined || v === null) continue;
    if (p.type === "string") {
      if (typeof v !== "string") return `"${k}" deve essere un testo`;
      if (p.enum && !p.enum.includes(v)) return `"${k}" deve essere uno di: ${p.enum.join(", ")}`;
      if (p.pattern && !new RegExp(p.pattern).test(v)) return `"${k}" non ha il formato giusto`;
      if (v.length > 200) return `"${k}" è troppo lungo`;
    } else {
      if (typeof v !== "number" || !Number.isInteger(v)) return `"${k}" deve essere un numero intero`;
      if (p.minimum !== undefined && v < p.minimum) return `"${k}" deve essere almeno ${p.minimum}`;
      if (p.maximum !== undefined && v > p.maximum) return `"${k}" deve essere al massimo ${p.maximum}`;
    }
  }
  return null;
}

/** Come appaiono gli strumenti al client: tutti in sola lettura, solo sui tuoi dati. */
export function toolList(tools: Tool[]) {
  return tools.map((t) => ({
    name: t.name,
    title: t.title,
    description: t.description,
    inputSchema: t.inputSchema,
    annotations: { title: t.title, readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }));
}

export type CallHook = (tool: string, ok: boolean) => Promise<void> | void;

/**
 * Un messaggio JSON-RPC → la risposta, oppure null per le notifiche (nessuna risposta).
 * Gli errori di uno strumento tornano come risultato con isError, così Claude li legge e si corregge.
 */
export async function handleMessage(msg: unknown, tools: Tool[], instructions: string, onCall?: CallHook): Promise<Response | null> {
  if (!msg || typeof msg !== "object" || Array.isArray(msg)) return err(null, INVALID_REQUEST, "Richiesta non valida");
  const m = msg as Partial<Request> & { result?: unknown; error?: unknown };
  const id = typeof m.id === "string" || typeof m.id === "number" ? m.id : null;
  const isNotification = m.id === undefined;
  if (m.jsonrpc !== "2.0") return isNotification ? null : err(id, INVALID_REQUEST, "jsonrpc deve essere 2.0");
  // Risposte del client a richieste nostre: non ne facciamo, si ignorano
  if (m.method === undefined && ("result" in m || "error" in m)) return null;
  if (typeof m.method !== "string") return isNotification ? null : err(id, INVALID_REQUEST, "Manca method");
  if (isNotification) return null; // notifications/initialized, cancelled…: nulla da fare senza stato

  const params = (m.params ?? {}) as Record<string, unknown>;
  switch (m.method) {
    case "initialize": {
      const asked = typeof params.protocolVersion === "string" ? params.protocolVersion : null;
      const version = asked && PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0];
      return {
        jsonrpc: "2.0",
        id,
        result: { protocolVersion: version, capabilities: { tools: { listChanged: false } }, serverInfo: SERVER_INFO, instructions },
      };
    }
    case "ping":
      return { jsonrpc: "2.0", id, result: {} };
    case "tools/list":
      return { jsonrpc: "2.0", id, result: { tools: toolList(tools) } };
    case "tools/call": {
      const name = params.name;
      const tool = tools.find((t) => t.name === name);
      if (!tool) return err(id, INVALID_PARAMS, `Strumento sconosciuto: ${String(name)}`);
      const args = params.arguments ?? {};
      const invalid = validateArgs(tool.inputSchema, args);
      if (invalid) {
        await onCall?.(tool.name, false);
        return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: invalid }], isError: true } };
      }
      try {
        const data = await tool.run(args as Record<string, unknown>);
        await onCall?.(tool.name, true);
        return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(data) }] } };
      } catch (e) {
        await onCall?.(tool.name, false);
        const text = e instanceof Error ? e.message : String(e);
        return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: `Errore: ${text}` }], isError: true } };
      }
    }
    case "resources/list":
      return { jsonrpc: "2.0", id, result: { resources: [] } };
    case "prompts/list":
      return { jsonrpc: "2.0", id, result: { prompts: [] } };
    default:
      return err(id, METHOD_NOT_FOUND, `Metodo non supportato: ${m.method}`);
  }
}
