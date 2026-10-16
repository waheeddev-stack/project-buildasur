import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { setAccessToken } from './api';

// Auth slice: user + accessToken (mirrored to localStorage for api.js), login/logout.
export const useAuth = create(
  persist(
    (set) => ({
      user: null,
      accessToken: '',
      login: (user, accessToken) => {
        setAccessToken(accessToken || '');
        set({ user: user || null, accessToken: accessToken || '' });
      },
      logout: () => {
        setAccessToken('');
        set({ user: null, accessToken: '' });
      }
    }),
    {
      name: 'slotsync-auth',
      partialize: (s) => ({ user: s.user, accessToken: s.accessToken }),
      onRehydrateStorage: () => (state) => {
        if (state) setAccessToken(state.accessToken || '');
      }
    }
  )
);

// Theme slice: dark default + light toggle, persisted, applied to <html data-theme>.
export const useTheme = create(
  persist(
    (set, get) => ({
      theme: 'dark',
      toggle: () => {
        const next = get().theme === 'dark' ? 'light' : 'dark';
        try {
          document.documentElement.setAttribute('data-theme', next);
        } catch {
          /* ssr-safe */
        }
        set({ theme: next });
      },
      apply: () => {
        try {
          document.documentElement.setAttribute('data-theme', get().theme);
        } catch {
          /* ignore */
        }
      }
    }),
    { name: 'slotsync-theme', partialize: (s) => ({ theme: s.theme }) }
  )
);

// Timetable view filters: view mode + selected entity + selected session for click-to-move.
export const useTimetableView = create((set) => ({
  mode: 'batch', // batch | teacher | room
  filterId: '',
  selectedSessionId: null,
  setMode: (mode) => set({ mode }),
  setFilterId: (filterId) => set({ filterId }),
  selectSession: (selectedSessionId) => set({ selectedSessionId })
}));
