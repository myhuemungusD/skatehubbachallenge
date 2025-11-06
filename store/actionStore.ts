import { create } from "zustand";

interface ActionState {
  loading: boolean;
  setLoading: (value: boolean) => void;
}

export const useActionStore = create<ActionState>((set) => ({
  loading: false,
  setLoading: (value) => set({ loading: value })
}));
