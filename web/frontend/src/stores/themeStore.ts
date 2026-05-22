import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Toggle thème arcade — persiste dans localStorage et applique la classe
// `theme-arcade` sur <body> au mount via subscribe.

interface ThemeStore {
  arcade: boolean
  toggleArcade: () => void
  setArcade: (v: boolean) => void
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set) => ({
      arcade: false,
      toggleArcade: () => set((s) => ({ arcade: !s.arcade })),
      setArcade: (v) => set({ arcade: v }),
    }),
    { name: 'roblaude-theme' },
  ),
)

// Applique la classe sur <body> a chaque changement.
if (typeof document !== 'undefined') {
  const apply = (arcade: boolean): void => {
    document.body.classList.toggle('theme-arcade', arcade)
  }
  // initial
  apply(useThemeStore.getState().arcade)
  useThemeStore.subscribe((state) => apply(state.arcade))
}
