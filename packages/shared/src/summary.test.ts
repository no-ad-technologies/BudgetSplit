import { describe, expect, it } from "vitest";
import { memberAlias, withMemberNames } from "./summary";

describe("memberAlias", () => {
  it("counts A to Z, then AA, AB …", () => {
    expect([0, 1, 25, 26, 27, 49].map(memberAlias)).toEqual([
      "Member A",
      "Member B",
      "Member Z",
      "Member AA",
      "Member AB",
      "Member AX",
    ]);
  });

  it("gives all 50 members of a full group a different alias", () => {
    expect(new Set(Array.from({ length: 50 }, (_, i) => memberAlias(i))).size).toBe(50);
  });
});

describe("withMemberNames", () => {
  const members = [
    { alias: "Member A", displayName: "Maya" },
    { alias: "Member B", displayName: "Josh" },
    { alias: "Member AB", displayName: "Priya" },
  ];

  it("replaces every alias with the member's name", () => {
    expect(withMemberNames("Member A paid $60.00; Member B paid $45.10. Member A paid the most.", members)).toBe(
      "Maya paid $60.00; Josh paid $45.10. Maya paid the most.",
    );
  });

  it("matches whole aliases only", () => {
    expect(withMemberNames("Member AB and Member A.", members)).toBe("Priya and Maya.");
  });

  it("leaves an alias it doesn't know untouched", () => {
    expect(withMemberNames("Member C paid nothing.", members)).toBe("Member C paid nothing.");
  });

  it("treats a name as plain text, even one that looks like a replacement pattern", () => {
    expect(withMemberNames("Member A paid.", [{ alias: "Member A", displayName: "$& $1" }])).toBe("$& $1 paid.");
  });
});
