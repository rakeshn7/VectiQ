import { useContext } from 'react';
import { StudioContext, type StudioContextValue } from '@/context/StudioContext';

export function useStudio(): StudioContextValue {
  const ctx = useContext(StudioContext);
  if (!ctx) {
    throw new Error('useStudio must be used within a StudioProvider');
  }
  return ctx;
}
