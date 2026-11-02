import { test } from "node:test";
import assert from "node:assert/strict";
import { dueDate, loanStatus } from "./loan-math.ts";

test("prestito a metà: 48 rate, 24 pagate", () => {
  const s = loanStatus({ principal: 10000, installment: 260, count: 48, firstDue: "2024-11-30" }, "2026-11-02");
  assert.equal(s.paid, 24);
  assert.equal(s.nextDue, "2026-11-30");
  assert.equal(s.lastDue, "2028-10-30");
  assert.equal(s.remaining, 24 * 260);
  assert.ok(s.residual > 5500 && s.residual < 24 * 260, `residuo ${s.residual}`);
});

test("rata in scadenza oggi conta come pagata", () => {
  assert.equal(loanStatus({ principal: 1000, installment: 100, count: 12, firstDue: "2026-01-15" }, "2026-03-15").paid, 3);
});

test("tasso zero: residuo uguale alle rate rimaste", () => {
  const s = loanStatus({ principal: 1200, installment: 100, count: 12, firstDue: "2026-01-15" }, "2026-03-20");
  assert.equal(s.residual, 900);
});

test("giorno 31 nei mesi corti", () => {
  assert.equal(dueDate("2025-01-31", 1), "2025-02-28");
  assert.equal(dueDate("2025-01-31", 2), "2025-03-31");
});
