import { createMatchId } from "../src/utils/matchId";

describe("createMatchId", () => {
  it("is deterministic regardless of order", () => {
    expect(createMatchId("b", "a")).toBe("a_b");
    expect(createMatchId("a", "b")).toBe("a_b");
  });
});
