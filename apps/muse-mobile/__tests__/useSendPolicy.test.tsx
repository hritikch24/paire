import React from "react";
import renderer, { act } from "react-test-renderer";
import { useSendPolicy } from "../src/hooks/useSendPolicy";
import { fetchSendPolicy } from "../src/services/sendPolicyService";

let mockQuery: { queryKey: unknown[]; queryFn: () => Promise<unknown>; refetchOnWindowFocus?: boolean; staleTime?: number; enabled?: boolean } | undefined;
let mockData: unknown;
let mockStale = true;
const mockRefetch = jest.fn();
jest.mock("@tanstack/react-query", () => ({
  useQuery: (options: NonNullable<typeof mockQuery>) => { mockQuery = options; return { data: mockData, isStale: mockStale, refetch: mockRefetch }; }
}));
jest.mock("@react-navigation/native", () => ({ useFocusEffect: (effect: () => void) => { require("react").useEffect(effect, []); } }));
jest.mock("../src/store/authStore", () => ({ useAuthStore: (select: (state: unknown) => unknown) => select({ user: { uid: "fixture-member" } }) }));
jest.mock("../src/services/sendPolicyService", () => ({ fetchSendPolicy: jest.fn() }));

let seen: unknown = "unset";
function Probe() { seen = useSendPolicy().data; return null; }

afterEach(() => { jest.clearAllMocks(); mockData = undefined; mockStale = true; mockQuery = undefined; seen = "unset"; });

test("the policy data is undefined while loading and the query refetches on focus", async () => {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<Probe />); });
  expect(seen).toBeUndefined();
  expect(mockQuery?.queryKey).toEqual(["send-policy", "fixture-member"]);
  expect(mockQuery?.refetchOnWindowFocus).toBe(true);
  expect(mockQuery?.staleTime).toBeLessThanOrEqual(60_000);
  expect(mockRefetch).toHaveBeenCalled();
  await act(async () => { tree.unmount(); });
});

test("focusing a screen does not refetch a policy that is still fresh", async () => {
  mockStale = false;
  await act(async () => { renderer.create(<Probe />); });
  expect(mockRefetch).not.toHaveBeenCalled();
});

test("the policy the server sent is returned as is", async () => {
  mockData = { acceptFlow: true, womenSendFree: true, giftSales: false, freeSender: true };
  await act(async () => { renderer.create(<Probe />); });
  expect(seen).toEqual(mockData);
});

test("a failing policy call never throws into the UI: the query settles on null", async () => {
  jest.mocked(fetchSendPolicy).mockRejectedValue(new Error("offline"));
  await act(async () => { renderer.create(<Probe />); });
  await expect(mockQuery!.queryFn()).resolves.toBeNull();
  expect(seen).toBeUndefined();
});
