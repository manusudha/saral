'use client';
import { useRef } from 'react';
import { Provider } from 'react-redux';
import { makeStore } from '@/store';

export default function Providers({ children }) {
  const ref = useRef(null);
  if (!ref.current) ref.current = makeStore();
  return <Provider store={ref.current}>{children}</Provider>;
}
