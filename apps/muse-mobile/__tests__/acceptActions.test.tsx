import React from "react";
import renderer, { act } from "react-test-renderer";
import { useAcceptActions } from "../src/hooks/useAcceptActions";
import { acceptLike, sendSwipe } from "../src/services/discoveryService";
import { showToast } from "../src/components/Toast";
import type { DiscoverProfile } from "../src/types/models";

const mockNavigate = jest.fn();
const mockInvalidate = jest.fn();
const mockSetData = jest.fn();
jest.mock("@react-navigation/native", () => ({ useNavigation: () => ({ navigate: mockNavigate }) }));
jest.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: mockInvalidate, setQueryData: mockSetData }) }));
jest.mock("expo-haptics", () => ({ notificationAsync: jest.fn().mockResolvedValue(undefined), NotificationFeedbackType: { Success: "success" } }));
jest.mock("../src/components/Toast", () => ({ showToast: jest.fn() }));
jest.mock("../src/store/authStore", () => ({ useAuthStore: (select: (state: unknown) => unknown) => select({ user: { uid: "her" } }) }));
jest.mock("../src/services/notificationService", () => ({ suppressMatchAlert: jest.fn() }));
jest.mock("../src/services/discoveryService", () => ({ acceptLike: jest.fn(), sendSwipe: jest.fn() }));

const him = { uid: "him", displayName: "Arjun Rao", age: 29, photoUrls: ["p.jpg"] } as unknown as DiscoverProfile;
let actions!: ReturnType<typeof useAcceptActions>;
function Probe() { actions = useAcceptActions(); return null; }
const mount = async () => { await act(async () => { renderer.create(<Probe />); }); };
afterEach(() => jest.clearAllMocks());

test("accepting once calls acceptLike once even on a double tap, then opens the new chat", async () => {
  let resolve!: (value: { matched: true; matchId: string }) => void;
  jest.mocked(acceptLike).mockReturnValue(new Promise((done) => { resolve = done; }));
  await mount();
  let first!: Promise<void>, second!: Promise<void>;
  act(() => { first = actions.accept(him); second = actions.accept(him); });
  expect(actions.pendingUid).toBe("him");
  await act(async () => { resolve({ matched: true, matchId: "her_him" }); await Promise.all([first, second]); });
  expect(acceptLike).toHaveBeenCalledTimes(1);
  expect(acceptLike).toHaveBeenCalledWith("him");
  expect(mockNavigate).toHaveBeenCalledWith("Chat", { matchId: "her_him", otherUid: "him", name: "Arjun Rao", photoUrl: "p.jpg" });
  expect(mockSetData).toHaveBeenCalled();
  expect(actions.pendingUid).toBeNull();
});

test("a like that is no longer available shows the server's friendly message and removes the card", async () => {
  const gone = Object.assign(new Error("That like is no longer available."), { code: "functions/not-found" });
  jest.mocked(acceptLike).mockRejectedValue(gone);
  await mount();
  await act(async () => { await actions.accept(him); });
  expect(showToast).toHaveBeenCalledWith("That like is no longer available.", "error");
  expect(mockNavigate).not.toHaveBeenCalled();
  const update = mockSetData.mock.calls[0][1] as (data: unknown) => { profiles: unknown[]; count: number };
  expect(update({ profiles: [{ uid: "him" }, { uid: "other" }], count: 2 })).toMatchObject({ profiles: [{ uid: "other" }], count: 1 });
  expect(mockInvalidate).toHaveBeenCalled();
  expect(actions.pendingUid).toBeNull();
});

test("a network failure keeps the card so she can try again", async () => {
  jest.mocked(acceptLike).mockRejectedValue(Object.assign(new Error("x"), { code: "functions/unavailable" }));
  await mount();
  await act(async () => { await actions.accept(him); });
  expect(showToast).toHaveBeenCalledWith(expect.stringContaining("offline"), "error");
  expect(mockSetData).not.toHaveBeenCalled();
});

test("Not now records an ordinary pass and takes the card off her list", async () => {
  jest.mocked(sendSwipe).mockResolvedValue({ matched: false } as never);
  await mount();
  await act(async () => { await actions.notNow(him); });
  expect(sendSwipe).toHaveBeenCalledTimes(1);
  expect(sendSwipe).toHaveBeenCalledWith("him", "nope");
  expect(acceptLike).not.toHaveBeenCalled();
  expect(mockSetData).toHaveBeenCalled();
  expect(mockInvalidate).toHaveBeenCalled();
});

test("if the pass cannot be recorded the card stays and she is told", async () => {
  jest.mocked(sendSwipe).mockRejectedValue(Object.assign(new Error("You've reached today's pass limit. Come back tomorrow."), { code: "functions/resource-exhausted" }));
  await mount();
  await act(async () => { await actions.notNow(him); });
  expect(showToast).toHaveBeenCalledWith("You've reached today's pass limit. Come back tomorrow.", "error");
  expect(mockSetData).not.toHaveBeenCalled();
});
