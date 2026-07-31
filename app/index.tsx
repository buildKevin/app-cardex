import { Redirect } from 'expo-router';

import { useGameStore } from '../src/store/useGameStore';

/** Single routing gate: onboarding once, then straight to the garage. */
export default function Index() {
  const onboarded = useGameStore((state) => state.onboarded);
  return <Redirect href={onboarded ? '/(tabs)' : '/onboarding'} />;
}
