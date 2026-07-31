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
import {
  configurePurchases,
  getCustomerInfo,
  identifyPurchaser,
  isProActive,
  onCustomerInfo,
} from '../src/services/purchases';
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
  const setPro = useGameStore((state) => state.setPro);
  const accountId = useGameStore((state) => state.profile.accountId);
  // Insurance against a permanently black splash if AsyncStorage never answers.
  const [storageTimedOut, setStorageTimedOut] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setStorageTimedOut(true), 3000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    initAnalytics();

    // configurePurchases is synchronous and reports whether it actually ran.
    if (!configurePurchases()) return;

    // RevenueCat is the source of truth, not the persisted flag: entitlements
    // survive a reinstall, and a subscription can lapse while the flag says
    // otherwise. A null answer means "we could not ask" — never a downgrade, or
    // one failed call would lock a paying player out of the app.
    getCustomerInfo().then((info) => {
      if (info) setPro(isProActive(info));
    });

    // RevenueCat pushes fresh info on purchase, restore, renewal and expiry, so
    // Pro also turns itself off when a subscription ends. Polling would not.
    return onCustomerInfo((info) => setPro(isProActive(info)));
  }, [setPro]);

  // Ties purchases to the Supabase user, which is what lets the RevenueCat
  // webhook flip `is_pro` on the right row — without it the server-side scan
  // limit keeps blocking a paying customer.
  useEffect(() => {
    if (!accountId) return;
    identifyPurchaser(accountId).then((info) => {
      if (info) setPro(isProActive(info));
    });
  }, [accountId, setPro]);

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
          <Stack.Screen name="badges" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  boot: { flex: 1, backgroundColor: colors.bg },
});
