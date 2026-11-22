import { describe, expect, it, vi } from "vitest";
import { handleMessage, PROTOCOL_VERSIONS, validateArgs, type Tool } from "@/lib/mcp";

const echo: Tool = {
  name: "eco",
  title: "Eco",
  description: "Restituisce gli argomenti",
  inputSchema: {
    type: "object",
    properties: {
      testo: { type: "string", description: "t" },
      tipo: { type: "string", description: "t", enum: ["a", "b"] },
      data: { type: "string", description: "d", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      n: { type: "integer", description: "n", minimum: 1, maximum: 5 },
    },
    required: ["testo"],
    additionalProperties: false,
  },
  run: async (args) => ({ ricevuto: args }),
};
const boom: Tool = { ...echo, name: "boom", inputSchema: { type: "object", properties: {}, additionalProperties: false }, run: async () => { throw new Error("rotto"); } };
const tools = [echo, boom];
const call = (method: string, params?: object, id: number | undefined = 1) => handleMessage({ jsonrpc: "2.0", id, method, params }, tools, "istruzioni");

describe("protocollo MCP", () => {
  it("initialize negozia la versione e annuncia gli strumenti", async () => {
    const r = await call("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } });
    expect(r).toMatchObject({ id: 1, result: { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "saldi" }, instructions: "istruzioni" } });
    const other = await call("initialize", { protocolVersion: "1999-01-01" });
    expect(other).toMatchObject({ result: { protocolVersion: PROTOCOL_VERSIONS[0] } });
  });

  it("le notifiche non hanno risposta", async () => {
    expect(await handleMessage({ jsonrpc: "2.0", method: "notifications/initialized" }, tools, "")).toBeNull();
  });

  it("ping e metodi sconosciuti", async () => {
    expect(await call("ping")).toEqual({ jsonrpc: "2.0", id: 1, result: {} });
    expect(await call("sampling/createMessage")).toMatchObject({ error: { code: -32601 } });
  });

  it("richieste malformate", async () => {
    expect(await handleMessage([], tools, "")).toMatchObject({ error: { code: -32600 } });
    expect(await handleMessage({ jsonrpc: "1.0", id: 3, method: "ping" }, tools, "")).toMatchObject({ id: 3, error: { code: -32600 } });
    expect(await handleMessage({ jsonrpc: "2.0", id: 4 }, tools, "")).toMatchObject({ id: 4, error: { code: -32600 } });
  });

  it("tools/list: tutti in sola lettura", async () => {
    const r = (await call("tools/list")) as { result: { tools: { name: string; annotations: { readOnlyHint: boolean; destructiveHint: boolean } }[] } };
    expect(r.result.tools.map((t) => t.name)).toEqual(["eco", "boom"]);
    expect(r.result.tools.every((t) => t.annotations.readOnlyHint && !t.annotations.destructiveHint)).toBe(true);
  });

  it("tools/call: risultato in testo JSON e registro", async () => {
    const onCall = vi.fn();
    const r = await handleMessage({ jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "eco", arguments: { testo: "ciao", n: 2 } } }, tools, "", onCall);
    expect(r).toEqual({ jsonrpc: "2.0", id: 7, result: { content: [{ type: "text", text: JSON.stringify({ ricevuto: { testo: "ciao", n: 2 } }) }] } });
    expect(onCall).toHaveBeenCalledWith("eco", true);
  });

  it("tools/call: argomenti sbagliati ed errori diventano isError, strumento sconosciuto è un errore JSON-RPC", async () => {
    expect(await call("tools/call", { name: "eco", arguments: {} })).toMatchObject({ result: { isError: true, content: [{ text: 'Manca il parametro "testo"' }] } });
    expect(await call("tools/call", { name: "boom" })).toMatchObject({ result: { isError: true, content: [{ text: "Errore: rotto" }] } });
    expect(await call("tools/call", { name: "nessuno" })).toMatchObject({ error: { code: -32602 } });
  });
});

describe("validazione argomenti", () => {
  const s = echo.inputSchema;
  it("tipi, enum, pattern, limiti, extra", () => {
    expect(validateArgs(s, { testo: "x" })).toBeNull();
    expect(validateArgs(s, { testo: "x", tipo: "a", data: "2026-11-22", n: 5 })).toBeNull();
    expect(validateArgs(s, { testo: 3 })).toMatch(/testo/);
    expect(validateArgs(s, { testo: "x", tipo: "c" })).toMatch(/tipo/);
    expect(validateArgs(s, { testo: "x", data: "22/11/2026" })).toMatch(/formato/);
    expect(validateArgs(s, { testo: "x", n: 6 })).toMatch(/al massimo/);
    expect(validateArgs(s, { testo: "x", n: 1.5 })).toMatch(/intero/);
    expect(validateArgs(s, { testo: "x", altro: 1 })).toMatch(/sconosciuto/);
    expect(validateArgs(s, "x")).toMatch(/oggetto/);
    expect(validateArgs(s, { testo: "x".repeat(201) })).toMatch(/lungo/);
  });
});
