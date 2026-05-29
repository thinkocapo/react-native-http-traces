import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Sentry from '@sentry/react-native';
import { makeNativeHttpRequest } from '../src/NativeHttp';

// ─────────────────────────────────────────────────────────────────────────────
// Child components — each wrapped with Sentry.withProfiler so Sentry emits
// component-level spans (mount / update / unmount) inside the active
// navigation transaction for this screen.
// ─────────────────────────────────────────────────────────────────────────────
function WelcomeCard() {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>👋 Welcome</Text>
      <Text style={styles.cardBody}>Sentry Native HTTP Test App</Text>
    </View>
  );
}

function InfoCard() {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>ℹ️ What this tests</Text>
      <Text style={styles.cardBody}>
        HTTP requests on this screen are made by Android (OkHttp) or iOS
        (URLSession) native code — NOT by JS fetch / XMLHttpRequest.{'\n\n'}
        Each native request starts its own Sentry transaction so the OkHttp /
        URLSession span has a parent and appears in the trace waterfall.
      </Text>
    </View>
  );
}

function StatusCard({ status }: { status: string }) {
  return (
    <View style={[styles.card, styles.statusCard]}>
      <Text style={styles.cardTitle}>📡 Last Native Request</Text>
      <Text style={styles.cardBody}>{status}</Text>
    </View>
  );
}

// Wrap each component with the Sentry Component Profiler.
// This produces spans like: "WelcomeCard > mount", "InfoCard > mount", etc.
const ProfiledWelcomeCard = Sentry.withProfiler(WelcomeCard, { name: 'WelcomeCard' });
const ProfiledInfoCard = Sentry.withProfiler(InfoCard, { name: 'InfoCard' });
const ProfiledStatusCard = Sentry.withProfiler(StatusCard, { name: 'StatusCard' });

// ─────────────────────────────────────────────────────────────────────────────
// Home Screen
// ─────────────────────────────────────────────────────────────────────────────
function HomeScreenContent() {
  const router = useRouter();
  const [status, setStatus] = useState('None yet');
  const [loading, setLoading] = useState(false);

  // Fire a native HTTP request on mount — this happens while the Sentry
  // navigation transaction for "index" route is still open, so there is a
  // chance (not guaranteed) that the native span ends up as a child.
  useEffect(() => {
    triggerNativeRequest('https://jsonplaceholder.typicode.com/posts/1', 'mount');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function triggerNativeRequest(url: string, trigger: string) {
    setLoading(true);
    setStatus(`Requesting (${trigger})…`);
    try {
      const result = await makeNativeHttpRequest(url);
      const preview = result.substring(0, 80).replace(/\n/g, ' ');
      setStatus(`✅ ${trigger}: ${preview}…`);
      console.log(`[NativeHttp][Home][${trigger}]`, preview);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus(`❌ ${trigger}: ${msg}`);
      Sentry.captureException(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ProfiledWelcomeCard />
      <ProfiledInfoCard />
      <ProfiledStatusCard status={status} />

      {loading && <ActivityIndicator style={styles.loader} />}

      <TouchableOpacity
        style={styles.button}
        onPress={() =>
          triggerNativeRequest(
            'https://jsonplaceholder.typicode.com/todos/1',
            'button'
          )
        }
      >
        <Text style={styles.buttonText}>Make Native HTTP Request</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, styles.buttonSecondary]}
        onPress={() => router.push('/next-screen')}
      >
        <Text style={styles.buttonText}>Go to Next Screen →</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// Wrap the whole screen in a Sentry.Profiler — emits a top-level component
// span named "HomeScreen" inside the navigation transaction.
export default function HomeScreen() {
  return (
    <Sentry.Profiler name="HomeScreen">
      <HomeScreenContent />
    </Sentry.Profiler>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    padding: 20,
    gap: 16,
  },
  card: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  statusCard: {
    backgroundColor: '#eef6ff',
    borderColor: '#b3d4ff',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  cardBody: {
    fontSize: 14,
    color: '#444',
    lineHeight: 20,
  },
  loader: {
    marginVertical: 8,
  },
  button: {
    backgroundColor: '#6C47FF',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonSecondary: {
    backgroundColor: '#333',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
});
