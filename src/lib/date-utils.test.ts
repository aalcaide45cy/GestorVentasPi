import { describe, expect, it } from "vitest";
import { formatDate } from "./date-utils";

describe("formatDate", () => {
  it("formatea ISO como DD/MM/AAAA", () => {
    expect(formatDate("2026-10-15")).toBe("15/10/2026");
    expect(formatDate("2026-01-05T10:00:00.000Z")).toBe("05/01/2026");
  });
  it("devuelve vacío si no hay fecha válida", () => {
    expect(formatDate(null)).toBe("");
    expect(formatDate("x")).toBe("");
  });
});
