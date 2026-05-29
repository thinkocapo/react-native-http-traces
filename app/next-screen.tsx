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

export default function NextScreen() {
  const router = useRouter();
  const [status, setStatus] = useState('None yet');
  const [loading, setLoading] = useState(false);

  // Native HTTP request on mount — same pattern as Home screen.
  useEffect(() => {
    triggerNativeRequest('https://jsonplaceholder.typicode.com/posts/2', 'mount');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function triggerNativeRequest(url: string, trigger: string) {
    setLoading(true);
    setStatus(`Requesting (${trigger})…`);
    try {
      const result = await makeNativeHttpRequest(url);
      const preview = result.substring(0, 80).replace(/\n/g, ' ');
      setStatus(`✅ ${trigger}: ${preview}…`);
      console.log(`[NativeHttp][NextScreen][${trigger}]`, preview);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus(`❌ ${trigger}: ${msg}`);
      Sentry.captureException(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Sentry.Profiler name="NextScreen">
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Next Screen</Text>
          <Text style={styles.cardBody}>
            Native HTTP requests fire here too — on mount and via the button.
            Each creates its own Sentry transaction in the native layer.
          </Text>
        </View>

        <View style={[styles.card, styles.statusCard]}>
          <Text style={styles.cardTitle}>📡 Last Native Request</Text>
          <Text style={styles.cardBody}>{status}</Text>
        </View>

        {loading && <ActivityIndicator style={styles.loader} />}

        <TouchableOpacity
          style={styles.button}
          onPress={() =>
            triggerNativeRequest(
              'https://jsonplaceholder.typicode.com/todos/2',
              'button'
            )
          }
        >
          <Text style={styles.buttonText}>Make Native HTTP Request</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.buttonBack]}
          onPress={() => router.back()}
        >
          <Text style={styles.buttonText}>← Go Back</Text>
        </TouchableOpacity>
      </ScrollView>
    </Sentry.Profiler>
  );
}

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
  buttonBack: {
    backgroundColor: '#555',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
});
