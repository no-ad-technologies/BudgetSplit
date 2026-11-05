import { describe, expect, it } from "vitest";
import { colors, netColor } from "./theme";

describe("netColor", () => {
  it("is green when owed, red when owing and gray when settled", () => {
    expect(netColor(1)).toBe(colors.owed);
    expect(netColor(-1)).toBe(colors.owes);
    expect(netColor(0)).toBe(colors.quiet);
  });
});
