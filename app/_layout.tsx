// Per-weight subpaths on purpose: the package barrel would bundle all 18 fonts.
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { useFonts } from 'expo-font';
import { Stack, useGlobalSearchParams, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import {
  PostHogErrorBoundary,
  PostHogProvider,
  PostHogSurveyProvider,
} from 'posthog-react-native';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Text } from '../src/components/Text';
import { unlockedBadgeCount } from '../src/data/badges';
import {
  events,
  identify,
  initAnalytics,
  posthog,
  screen,
  syncPlayerContext,
  track,
} from '../src/services/analytics';
import {
  configurePurchases,
  getCustomerInfo,
  identifyPurchaser,
  isProActive,
  onCustomerInfo,
} from '../src/services/purchases';
import { useGameStore, useRestylesLeft, useScansLeft, useStats } from '../src/store/useGameStore';
import { colors, gutter, spacing } from '../src/theme';

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

    // Also the only identify a returning player ever gets: onboarding ran on a
    // build where PostHog was not configured yet, and without this they would
    // stay anonymous for the rest of the account's life.
    identify(accountId);

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
        <StatusBar style="dark" />
        {/* Touch autocapture is the point of running the provider at all: the
            events written by hand answer the questions we already thought of,
            and `$autocapture` answers the ones we did not. `captureScreens` is
            off because Expo Router exposes no NavigationContainer for the SDK to
            hook — `<Telemetry>` below does it from the pathname instead. */}
        <PostHogProvider
          client={posthog}
          style={styles.root}
          autocapture={{
            captureTouches: true,
            captureScreens: false,
            maxElementsCaptured: 20,
            propsToCapture: ['testID', 'accessibilityLabel', 'ph-label', 'children'],
          }}
        >
          <PostHogSurveyProvider client={posthog}>
            <PostHogErrorBoundary fallback={Crashed}>
              <Telemetry />
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
                <Stack.Screen name="restyle/[entryId]" options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="collection/[brandId]" options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="showcase" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
                <Stack.Screen name="badges" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
              </Stack>
            </PostHogErrorBoundary>
          </PostHogSurveyProvider>
        </PostHogProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/**
 * Everything measured continuously rather than at a call site: screen views, and
 * the player state that rides along with every other event.
 *
 * Its own component because it subscribes to the garage: leaving these hooks in
 * `RootLayout` would re-render the whole navigator on every scan.
 */
function Telemetry() {
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const previous = useRef<string | null>(null);

  const stats = useStats();
  const isPro = useGameStore((state) => state.isPro);
  const provider = useGameStore((state) => state.profile.provider);
  const accountId = useGameStore((state) => state.profile.accountId);
  const scansLeft = useScansLeft();
  const restylesLeft = useRestylesLeft();
  const knownPro = useRef<boolean | null>(null);

  useEffect(() => {
    if (previous.current === pathname) return;
    screen(pathname, {
      previous_screen: previous.current,
      // The only param worth forwarding: every paywall question starts with
      // "which screen sent them here". Ids are added by the route normaliser.
      context: typeof params.context === 'string' ? params.context : undefined,
    });
    previous.current = pathname;
  }, [pathname, params]);

  useEffect(() => {
    syncPlayerContext({
      isPro,
      level: stats.progress.level,
      xp: stats.xp,
      cars: stats.cars,
      scansUsed: stats.scans,
      scansLeft,
      restylesLeft,
      completedBrands: stats.completedBrands,
      badges: unlockedBadgeCount(stats),
      provider,
      hasAccount: Boolean(accountId),
    });
  }, [isPro, stats, scansLeft, restylesLeft, provider, accountId]);

  // Pro turns on from the paywall, which reports it — and off from a lapsed
  // renewal, which has no call site at all. This is the only place that sees it.
  useEffect(() => {
    if (knownPro.current === null) {
      knownPro.current = isPro;
      return;
    }
    if (knownPro.current === isPro) return;
    knownPro.current = isPro;
    track(events.proStatusChanged, { is_pro: isPro });
  }, [isPro]);

  return null;
}

/**
 * What a render crash looks like. The exception is already on its way to PostHog
 * by the time this draws — all this does is replace the black screen.
 */
function Crashed() {
  return (
    <View style={styles.crashed}>
      <Text variant="title" center>
        Quelque chose a cassé
      </Text>
      <Text variant="body" tone="secondary" center>
        Ferme et relance CarDex. Le problème nous a été signalé.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  boot: { flex: 1, backgroundColor: colors.bg },
  crashed: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: gutter,
    gap: spacing.md,
  },
});
