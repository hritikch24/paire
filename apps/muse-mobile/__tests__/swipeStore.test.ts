import { useSwipeStore } from "../src/store/swipeStore";

describe("swipeStore", () => {
  it("tracks swipe counts", () => {
    useSwipeStore.getState().reset();
    useSwipeStore.getState().registerSwipe("like");
    useSwipeStore.getState().registerSwipe("nope");
    useSwipeStore.getState().registerSwipe("super");

    const { likes, nopes, supers } = useSwipeStore.getState();
    expect(likes).toBe(1);
    expect(nopes).toBe(1);
    expect(supers).toBe(1);
  });

  it("can undo swipe counts", () => {
    useSwipeStore.getState().reset();
    useSwipeStore.getState().registerSwipe("like");
    useSwipeStore.getState().registerSwipe("super");
    useSwipeStore.getState().undoSwipe("like");
    useSwipeStore.getState().undoSwipe("super");

    const { likes, nopes, supers } = useSwipeStore.getState();
    expect(likes).toBe(0);
    expect(nopes).toBe(0);
    expect(supers).toBe(0);
  });
});
