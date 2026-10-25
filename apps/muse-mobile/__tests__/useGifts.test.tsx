import React from "react";
import renderer, { act } from "react-test-renderer";
import { useGifts } from "../src/hooks/useGifts";

const mockUseQuery = jest.fn((_options: unknown) => ({ data: undefined }));
jest.mock("@tanstack/react-query", () => ({ useQuery: (options: unknown) => mockUseQuery(options) }));
jest.mock("../src/services/giftService", () => ({ fetchGifts: jest.fn() }));
jest.mock("../src/store/authStore", () => ({ useAuthStore: (select: (state: unknown) => unknown) => select({ user: { uid: "her" } }) }));

test("gifts are fetched once per few minutes at most: no refetch on window focus, refreshed only by actions", async () => {
  function Probe() { useGifts(); return null; }
  await act(async () => { renderer.create(<Probe />); });
  expect(mockUseQuery).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ["gifts", "her"], enabled: true, staleTime: 5 * 60_000, refetchOnWindowFocus: false }));
});
