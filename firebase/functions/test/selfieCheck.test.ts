import { isDisposableEmail } from "../src/lib/disposableEmail";
import { similarityTransform } from "../src/lib/faces";
import { parseSelfieAiReply, POSES, poseById, randomPose, selfieDecision, SelfieAiVerdict } from "../src/lib/selfieCheck";

const pose = POSES[0];
const passing: SelfieAiVerdict = { poseDone: true, screenOrPrint: false, underage: false, aiPhotos: [] };
const decide = (overrides: Partial<Parameters<typeof selfieDecision>[0]> = {}) =>
  selfieDecision({ pose, selfieFaces: 1, photos: [{ faces: 1, best: 0.8 }], ai: passing, ...overrides });

describe("selfie check decision", () => {
  test("approves a live selfie with the pose that matches the first photo", () => {
    expect(decide()).toEqual({ approved: true });
    // Scenery and group shots are fine as long as a group includes the member.
    expect(decide({ photos: [{ faces: 1, best: 0.7 }, { faces: 0, best: null }, { faces: 4, best: 0.5 }] })).toEqual({ approved: true });
  });

  test("a profile photo sent again as the selfie is refused", () => {
    expect(decide({ photos: [{ faces: 1, best: 0.99 }] })).toMatchObject({ approved: false, code: "reused-photo" });
    expect(decide({ photos: [{ faces: 1, best: 0.8 }, { faces: 1, best: 0.97 }] })).toMatchObject({ approved: false, code: "reused-photo" });
  });

  test("needs exactly one face in the selfie", () => {
    expect(decide({ selfieFaces: 0 })).toMatchObject({ approved: false, code: "no-face" });
    expect(decide({ selfieFaces: 2 })).toMatchObject({ approved: false, code: "several-faces" });
  });

  test("never approves without the AI's live checks", () => {
    expect(decide({ ai: null })).toMatchObject({ approved: false, code: "ai-unavailable" });
    expect(decide({ ai: { ...passing, poseDone: false } })).toMatchObject({ approved: false, code: "pose", reason: expect.stringContaining(pose.label) });
    expect(decide({ ai: { ...passing, screenOrPrint: true } })).toMatchObject({ approved: false, code: "not-live" });
    expect(decide({ ai: { ...passing, underage: true } })).toMatchObject({ approved: false, code: "age" });
  });

  test("the first photo must be the member, and no other photo may be someone else", () => {
    expect(decide({ photos: [{ faces: 0, best: null }] })).toMatchObject({ approved: false, code: "first-photo-face" });
    expect(decide({ photos: [{ faces: 1, best: 0.5 }] })).toMatchObject({ approved: false, code: "first-photo-match" });
    expect(decide({ photos: [{ faces: 1, best: 0.8 }, { faces: 1, best: 0.9 }, { faces: 1, best: 0.2 }] })).toMatchObject({ approved: false, code: "other-photo-match", reason: expect.stringContaining("Photo 3") });
    expect(decide({ ai: { ...passing, aiPhotos: [2] }, photos: [{ faces: 1, best: 0.8 }, { faces: 1, best: 0.8 }] })).toMatchObject({ approved: false, code: "ai-photo", reason: expect.stringContaining("Photo 2") });
  });
});

describe("selfie AI reply", () => {
  test("keeps only well-formed answers", () => {
    expect(parseSelfieAiReply({ selfie: { poseDone: true, photoOfScreenOrPrint: false, looksUnder18: false }, photos: [{ photo: 2, clearlyAiOrEdited: true }, { photo: 9, clearlyAiOrEdited: true }, { photo: 1, clearlyAiOrEdited: false }] }, 3))
      .toEqual({ poseDone: true, screenOrPrint: false, underage: false, aiPhotos: [2] });
    expect(parseSelfieAiReply({ selfie: { poseDone: "yes" } }, 1)).toBeNull();
    expect(parseSelfieAiReply(null, 1)).toBeNull();
  });

  test("poses are looked up by id and picked at random", () => {
    expect(poseById("touch-nose")).toBe(POSES[0]);
    // Poses common in old photos are never asked for.
    expect(poseById("peace")).toBeNull();
    expect(poseById("thumbs-up")).toBeNull();
    expect(randomPose(() => 0.999)).toBe(POSES[POSES.length - 1]);
  });
});

describe("face alignment", () => {
  test("recovers a rotation, scale and shift exactly", () => {
    const from: Array<[number, number]> = [[10, 10], [30, 12], [20, 25], [12, 35], [28, 34]];
    const angle = 0.3, scale = 1.7;
    const to = from.map(([x, y]): [number, number] => [scale * (Math.cos(angle) * x - Math.sin(angle) * y) + 5, scale * (Math.sin(angle) * x + Math.cos(angle) * y) - 3]);
    const t = similarityTransform(from, to);
    expect(t.a).toBeCloseTo(scale * Math.cos(angle), 6);
    expect(t.b).toBeCloseTo(scale * Math.sin(angle), 6);
    expect(t.shiftX).toBeCloseTo(5, 6);
    expect(t.shiftY).toBeCloseTo(-3, 6);
  });
});

describe("throwaway emails", () => {
  test("blocks known throwaway inboxes and their subdomains only", () => {
    expect(isDisposableEmail("someone@mailinator.com")).toBe(true);
    expect(isDisposableEmail(" Someone@YOPMAIL.com ")).toBe(true);
    expect(isDisposableEmail("x@inbox.mailinator.com")).toBe(true);
    expect(isDisposableEmail("riya@gmail.com")).toBe(false);
    expect(isDisposableEmail("riya@notmailinator.com")).toBe(false);
    expect(isDisposableEmail(null)).toBe(false);
  });
});
