// Per-weight subpaths on purpose: the package barrel would bundle all 18 fonts.
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { initAnalytics } from '../src/services/analytics';
import { configurePurchases, hasFounderEntitlement } from '../src/services/purchases';
import { useGameStore } from '../src/store/useGameStore';
import { colors } from '../src/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  const hydrated = useGameStore((state) => state.hydrated);
  const setFounder = useGameStore((state) => state.setFounder);
  // Insurance against a permanently black splash if AsyncStorage never answers.
  const [storageTimedOut, setStorageTimedOut] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setStorageTimedOut(true), 3000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    initAnalytics();
    configurePurchases().then(async () => {
      // Trust the store over local state — entitlements survive reinstalls.
      if (await hasFounderEntitlement()) setFounder(true);
    });
  }, [setFounder]);

  const ready = fontsLoaded && (hydrated || storageTimedOut);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) return <View style={styles.boot} />;

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.bg },
            animation: 'fade',
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="paywall" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="reveal" options={{ animation: 'fade', gestureEnabled: false }} />
          <Stack.Screen name="car/[entryId]" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="collection/[brandId]" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="showcase" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  boot: { flex: 1, backgroundColor: colors.bg },
});
