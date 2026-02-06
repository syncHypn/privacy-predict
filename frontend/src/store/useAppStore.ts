import { create } from "zustand";

interface AppState {
  depositModalOpen: boolean;
  withdrawModalOpen: boolean;
  searchQuery: string;
  selectedCategory: string | null;
  setDepositModalOpen: (open: boolean) => void;
  setWithdrawModalOpen: (open: boolean) => void;
  setSearchQuery: (query: string) => void;
  setSelectedCategory: (category: string | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  depositModalOpen: false,
  withdrawModalOpen: false,
  searchQuery: "",
  selectedCategory: null,
  setDepositModalOpen: (open) => set({ depositModalOpen: open }),
  setWithdrawModalOpen: (open) => set({ withdrawModalOpen: open }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setSelectedCategory: (category) => set({ selectedCategory: category }),
}));
