import { Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Globe, Mail, Shield, Heart } from 'lucide-react-native';

const BRAND_COLOR = '#C9A227';

export default function AboutScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.logoCircle}>
            <Heart size={32} color="#FFFFFF" strokeWidth={2} fill="#FFFFFF" />
          </View>
          <Text style={styles.title}>WeddingWin</Text>
          <Text style={styles.tagline}>Your dream wedding, made possible</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>About the app</Text>
          <Text style={styles.body}>
            WeddingWin brings the full weddingwin.ca experience to your iPhone. Browse,
            sign in, and manage your account on the go with a native-feeling interface.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Links</Text>

          <TouchableOpacity
            style={styles.row}
            onPress={() => Linking.openURL('https://weddingwin.ca')}>
            <View style={styles.iconWrap}>
              <Globe size={20} color={BRAND_COLOR} strokeWidth={2} />
            </View>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>Visit website</Text>
              <Text style={styles.rowSub}>weddingwin.ca</Text>
            </View>
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity
            style={styles.row}
            onPress={() => Linking.openURL('mailto:hello@weddingwin.ca')}>
            <View style={styles.iconWrap}>
              <Mail size={20} color={BRAND_COLOR} strokeWidth={2} />
            </View>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>Contact support</Text>
              <Text style={styles.rowSub}>hello@weddingwin.ca</Text>
            </View>
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity
            style={styles.row}
            onPress={() => Linking.openURL('https://weddingwin.ca/privacy')}>
            <View style={styles.iconWrap}>
              <Shield size={20} color={BRAND_COLOR} strokeWidth={2} />
            </View>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>Privacy policy</Text>
              <Text style={styles.rowSub}>How we handle your data</Text>
            </View>
          </TouchableOpacity>
        </View>

        <Text style={styles.version}>Version 1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F5F0',
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  hero: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: BRAND_COLOR,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: BRAND_COLOR,
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1C1C1E',
    marginTop: 16,
    letterSpacing: 0.3,
  },
  tagline: {
    fontSize: 15,
    color: '#6E6E73',
    marginTop: 6,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginTop: 16,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#8A8A8E',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  body: {
    fontSize: 15,
    lineHeight: 23,
    color: '#3A3A3C',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FAF6E8',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  rowSub: {
    fontSize: 13,
    color: '#8A8A8E',
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: '#F2F2F7',
    marginVertical: 4,
  },
  version: {
    textAlign: 'center',
    color: '#8A8A8E',
    fontSize: 12,
    marginTop: 24,
  },
});
