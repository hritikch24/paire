import { create } from "zustand";
import { SwipeType } from "../types/models";

type SwipeState = {
  likes: number;
  nopes: number;
  supers: number;
  registerSwipe: (type: SwipeType) => void;
  undoSwipe: (type: SwipeType) => void;
  reset: () => void;
};

export const useSwipeStore = create<SwipeState>((set) => ({
  likes: 0,
  nopes: 0,
  supers: 0,
  registerSwipe: (type) =>
    set((state) => ({
      likes: state.likes + (type === "like" ? 1 : 0),
      nopes: state.nopes + (type === "nope" ? 1 : 0),
      supers: state.supers + (type === "super" ? 1 : 0)
    })),
  undoSwipe: (type) =>
    set((state) => ({
      likes: Math.max(0, state.likes - (type === "like" ? 1 : 0)),
      nopes: Math.max(0, state.nopes - (type === "nope" ? 1 : 0)),
      supers: Math.max(0, state.supers - (type === "super" ? 1 : 0))
    })),
  reset: () => set({ likes: 0, nopes: 0, supers: 0 })
}));
