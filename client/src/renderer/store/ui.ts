import { create } from 'zustand'

interface UiState {
  sidebarOpen: boolean
  activeModal: string | null

  setSidebarOpen: (open: boolean) => void
  openModal: (id: string) => void
  closeModal: () => void
}

export const useUiStore = create<UiState>((set) => ({
  sidebarOpen: true,
  activeModal: null,

  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  openModal: (id) => set({ activeModal: id }),
  closeModal: () => set({ activeModal: null }),
}))
