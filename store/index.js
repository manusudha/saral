import { configureStore } from '@reduxjs/toolkit';
import journey from './journeySlice';

export const makeStore = () =>
  configureStore({
    reducer: { journey },
    middleware: (gdm) => gdm({ serializableCheck: false }),
  });
