import { create } from 'zustand';

/**
 * Zustand Store: Client State Management for SDOQAP Dashboard
 * Controls zero-latency filtering across components without full page reloads.
 */
export const useDashboardStore = create((set) => ({
  // Filter States
  timeRange: '24h',
  selectedAreaFilter: 'All',
  selectedSeverityFilter: 'All',
  selectedSourceFilter: 'All',
  viewMode: 'executive', // 'executive' | 'business' | 'quality' | 'technical'

  // Actions
  setTimeRange: (range) => set({ timeRange: range }),
  setSelectedAreaFilter: (area) => set({ selectedAreaFilter: area }),
  setSelectedSeverityFilter: (severity) => set({ selectedSeverityFilter: severity }),
  setSelectedSourceFilter: (source) => set({ selectedSourceFilter: source }),
  setViewMode: (mode) => set({ viewMode: mode }),
  
  // Bulk Reset
  resetFilters: () => set({
    timeRange: '24h',
    selectedAreaFilter: 'All',
    selectedSeverityFilter: 'All',
    selectedSourceFilter: 'All'
  })
}));
