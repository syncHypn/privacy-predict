import { create } from "zustand";

interface AppState {
  depositModalOpen: boolean;
  withdrawModalOpen: boolean;
  searchQuery: string;
  setDepositModalOpen: (open: boolean) => void;
  setWithdrawModalOpen: (open: boolean) => void;
  setSearchQuery: (query: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  depositModalOpen: false,
  withdrawModalOpen: false,
  searchQuery: "",
  setDepositModalOpen: (open) => set({ depositModalOpen: open }),
  setWithdrawModalOpen: (open) => set({ withdrawModalOpen: open }),
  setSearchQuery: (query) => set({ searchQuery: query }),
}));
