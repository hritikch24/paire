import { HttpsError } from "firebase-functions/v2/https";
import {
  ageBandOf,
  assertPin,
  assertWeddingDate,
  closesAtOf,
  generateNickname,
  normalizeFirstName,
  orderKey,
  parseJoinInput,
  sameCouple,
  sameFirstName,
  screenClue,
  sortedNames,
  weddingBucket,
  weddingKeyHash,
  withinOneEdit
} from "../src/lib/wedding";

const NOW = Date.parse("2026-12-10T08:00:00Z");
const fails = (fn: () => unknown, reason?: string) => {
  try { fn(); } catch (error) {
    expect(error).toBeInstanceOf(HttpsError);
    if (reason) expect((error as HttpsError).details).toMatchObject({ reason });
    return;
  }
  throw new Error("Expected an HttpsError");
};

describe("wedding names", () => {
  test("lowercases, strips accents, punctuation and honorifics, keeps one first name", () => {
    expect(normalizeFirstName("  Dr. Riya Sharma ")).toBe("riya");
    expect(normalizeFirstName("Shri Arjun")).toBe("arjun");
    expect(normalizeFirstName("Smt. Priyanka")).toBe("priyanka");
    expect(normalizeFirstName("Zoë")).toBe("zoe");
    expect(normalizeFirstName("MR.")).toBeNull();
    expect(normalizeFirstName("A")).toBeNull();
    expect(normalizeFirstName(42)).toBeNull();
  });

  test("a one-letter typo matches only for names of four or more letters", () => {
    expect(withinOneEdit("priyanka", "priyanca")).toBe(true);
    expect(withinOneEdit("riya", "riyaa")).toBe(true);
    expect(withinOneEdit("riya", "rina")).toBe(true);
    expect(withinOneEdit("riya", "rita")).toBe(true);
    expect(withinOneEdit("riya", "rohan")).toBe(false);
    expect(sameFirstName("riya", "rina")).toBe(true);
    expect(sameFirstName("ria", "rio")).toBe(false);
    expect(sameFirstName("om", "on")).toBe(false);
  });

  test("the two names match in either order; both must match", () => {
    expect(sameCouple(sortedNames("riya", "arjun"), sortedNames("arjun", "riya"))).toBe(true);
    expect(sameCouple(sortedNames("riya", "arjun"), sortedNames("rina", "arjan"))).toBe(true);
    expect(sameCouple(sortedNames("riya", "arjun"), sortedNames("riya", "karan"))).toBe(false);
    expect(sameCouple(sortedNames("riya", "arjun"), sortedNames("meera", "karan"))).toBe(false);
  });

  test("the keys are order-free and depend on date and PIN", () => {
    const [a, b] = sortedNames("riya", "arjun");
    expect(weddingKeyHash(sortedNames("arjun", "riya"), "2026-12-14", "110001")).toBe(weddingKeyHash([a, b], "2026-12-14", "110001"));
    expect(weddingKeyHash([a, b], "2026-12-15", "110001")).not.toBe(weddingKeyHash([a, b], "2026-12-14", "110001"));
    expect(weddingBucket("2026-12-14", "110001")).not.toBe(weddingBucket("2026-12-14", "110002"));
    expect(weddingKeyHash([a, b], "2026-12-14", "110001")).not.toContain("riya");
  });
});

describe("wedding dates and PIN codes", () => {
  test("a wedding closes the end of the 7th day after its date, India time", () => {
    expect(closesAtOf("2026-12-14")).toBe(Date.parse("2026-12-22T00:00:00+05:30"));
  });

  test("accepts upcoming dates and ones still open; refuses closed, impossible and far-off dates", () => {
    expect(assertWeddingDate("2026-12-14", NOW)).toBe("2026-12-14");
    expect(assertWeddingDate("2026-12-05", NOW)).toBe("2026-12-05");
    fails(() => assertWeddingDate("2026-12-01", NOW), "wedding-closed");
    fails(() => assertWeddingDate("2026-02-30", NOW));
    fails(() => assertWeddingDate("14/12/2026", NOW));
    fails(() => assertWeddingDate(undefined, NOW));
    fails(() => assertWeddingDate("2027-12-14", NOW), "wedding-too-far");
  });

  test("PIN codes are six digits and never start with 0", () => {
    expect(assertPin("110001")).toBe("110001");
    fails(() => assertPin("011001"));
    fails(() => assertPin("1100"));
    fails(() => assertPin("11000a"));
  });

  test("age bands", () => {
    expect([18, 24, 25, 29, 30, 34, 35, 60].map(ageBandOf)).toEqual(["18-24", "18-24", "25-29", "25-29", "30-34", "30-34", "35+", "35+"]);
  });
});

describe("spot-me clue screening", () => {
  test("accepts a plain description", () => {
    expect(screenClue("Navy sherwani near the stage", "Arjun Mehta")).toBe("Navy sherwani near the stage");
    expect(screenClue("  green  saree, table 12 ", "Riya")).toBe("green saree, table 12");
    expect(screenClue("pink lehenga, table number 12", "Riya")).toBe("pink lehenga, table number 12");
  });

  test.each([
    ["a phone number", "call me 9876543210"],
    ["a handle", "find me @arjun_m"],
    ["a link", "see www.example.com"],
    ["an app", "my insta is arjun"],
    ["your number", "my number is on the card"],
    ["a room", "room 412 at the hotel"],
    ["a bare number", "9876543210"],
    ["your own name", "I'm Arjun, in the blue kurta"],
    ["money talk", "send money to my account first"]
  ])("refuses %s", (_label, clue) => {
    fails(() => screenClue(clue, "Arjun Mehta"), "clue-refused");
  });

  test("refuses empty and too long clues", () => {
    fails(() => screenClue("  "));
    fails(() => screenClue("x".repeat(61)));
  });
});

describe("join input", () => {
  const good = { brideName: "Dr. Riya", groomName: "Arjun", date: "2026-12-14", pin: "110001", side: "bride", clue: "navy sherwani near the stage" };

  test("parses and sorts names; keeps what the member typed for showing back", () => {
    const input = parseJoinInput(good, "uid1", "Karan", NOW);
    expect(input.names).toEqual(["arjun", "riya"]);
    expect(input.labels).toEqual(["Dr. Riya", "Arjun"]);
    expect(input.invitePath).toBeNull();
  });

  test("only accepts an invitation photo from the member's own folder", () => {
    expect(parseJoinInput({ ...good, invitePath: "wedding-invites/uid1/card.jpg" }, "uid1", "Karan", NOW).invitePath).toBe("wedding-invites/uid1/card.jpg");
    fails(() => parseJoinInput({ ...good, invitePath: "wedding-invites/uid2/card.jpg" }, "uid1", "Karan", NOW));
    fails(() => parseJoinInput({ ...good, invitePath: "user-uploads/uid1/photos/x.jpg" }, "uid1", "Karan", NOW));
    fails(() => parseJoinInput({ ...good, invitePath: "wedding-invites/uid1/../uid2/x.jpg" }, "uid1", "Karan", NOW));
  });

  test("needs two names, a side and a clue", () => {
    fails(() => parseJoinInput({ ...good, groomName: "Mr" }, "uid1", "", NOW));
    fails(() => parseJoinInput({ ...good, side: "friend" }, "uid1", "", NOW));
    fails(() => parseJoinInput({ ...good, clue: "" }, "uid1", "", NOW));
    fails(() => parseJoinInput(null, "uid1", "", NOW));
  });
});

describe("nicknames and ordering", () => {
  test("never reuse a taken nickname, even when most are taken", () => {
    const taken = new Set<string>();
    for (let i = 0; i < 700; i += 1) {
      const name = generateNickname(taken);
      expect(taken.has(name)).toBe(false);
      taken.add(name);
    }
    expect(taken.size).toBe(700);
  });

  test("the card order is stable for one viewer and differs between viewers", () => {
    expect(orderKey("a", "card1")).toBe(orderKey("a", "card1"));
    expect(orderKey("a", "card1")).not.toBe(orderKey("b", "card1"));
  });
});
