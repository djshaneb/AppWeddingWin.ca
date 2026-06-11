import {
  Alert,
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ChevronRight,
  FileText,
  Mail,
  Shield,
  Trash2,
} from 'lucide-react-native';

const SITE_URL = 'https://www.weddingwin.ca';
const BRAND_COLOR = '#C66A6A';
const LOGO_IMAGE = {
  uri: `${SITE_URL}/images/CoralLogoTransB.png`,
} as const;
const DELETE_ACCOUNT_URL = `${SITE_URL}/account/deleteaccount`;

async function openExternal(url: string) {
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert('Could not open link', 'Please try again in a moment.');
  }
}

function confirmDeleteAccount() {
  Alert.alert(
    'Delete account?',
    'WeddingWin will open the secure account deletion page. You can review the details before confirming deletion.',
    [
      {
        text: 'Cancel',
        style: 'cancel',
      },
      {
        text: 'Open Delete Account',
        style: 'destructive',
        onPress: () => openExternal(DELETE_ACCOUNT_URL),
      },
    ]
  );
}

function LinkRow({
  icon,
  title,
  subtitle,
  url,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  url: string;
}) {
  return (
    <TouchableOpacity
      style={styles.row}
      activeOpacity={0.82}
      onPress={() => openExternal(url)}>
      <View style={styles.iconWrap}>{icon}</View>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowSub}>{subtitle}</Text>
      </View>
      <ChevronRight size={20} color="#D1AAA5" strokeWidth={2} />
    </TouchableOpacity>
  );
}

export default function AboutScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Image
            source={LOGO_IMAGE}
            style={styles.logo}
            resizeMode="contain"
            accessibilityLabel="WeddingWin.ca Canada"
          />
          <Text style={styles.title}>About WeddingWin</Text>
          <Text style={styles.body}>App version 1.0.0</Text>
        </View>

        <View style={styles.linkCard}>
          <Text style={styles.sectionTitle}>Support</Text>
          <LinkRow
            icon={<Mail size={20} color={BRAND_COLOR} strokeWidth={2} />}
            title="Contact WeddingWin"
            subtitle="info@weddingwin.ca"
            url="mailto:info@weddingwin.ca"
          />
        </View>

        <View style={styles.linkCard}>
          <Text style={styles.sectionTitle}>Legal</Text>
          <LinkRow
            icon={<Shield size={20} color={BRAND_COLOR} strokeWidth={2} />}
            title="Privacy Policy"
            subtitle="How WeddingWin handles your data"
            url={`${SITE_URL}/about/privacy`}
          />
          <View style={styles.divider} />
          <LinkRow
            icon={<FileText size={20} color={BRAND_COLOR} strokeWidth={2} />}
            title="Terms of Use"
            subtitle="Rules for using WeddingWin"
            url={`${SITE_URL}/about/terms`}
          />
        </View>

        <View style={styles.linkCard}>
          <Text style={styles.sectionTitle}>Account Management</Text>
          <TouchableOpacity
            style={styles.row}
            activeOpacity={0.82}
            onPress={confirmDeleteAccount}
            accessibilityRole="button"
            accessibilityLabel="Delete account">
            <View style={[styles.iconWrap, styles.deleteIconWrap]}>
              <Trash2 size={20} color="#9B3E36" strokeWidth={2} />
            </View>
            <View style={styles.rowText}>
              <Text style={[styles.rowTitle, styles.deleteTitle]}>Delete Account</Text>
              <Text style={styles.rowSub}>Open the secure account deletion page</Text>
            </View>
            <ChevronRight size={20} color="#D1AAA5" strokeWidth={2} />
          </TouchableOpacity>
        </View>

        <Text style={styles.footerText}>WeddingWin Canada</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF8F5',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 36,
  },
  header: {
    minHeight: 148,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingVertical: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#F0D5D1',
  },
  logo: {
    width: '82%',
    maxWidth: 260,
    height: 70,
  },
  title: {
    color: '#2E2E32',
    fontSize: 21,
    lineHeight: 26,
    fontWeight: '800',
    marginTop: 8,
    textAlign: 'center',
  },
  body: {
    color: '#8E7D7A',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    marginTop: 4,
    textAlign: 'center',
  },
  linkCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#F0D5D1',
  },
  sectionTitle: {
    color: '#2E2E32',
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '800',
    marginBottom: 8,
  },
  row: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#FFF1EF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 13,
  },
  deleteIconWrap: {
    backgroundColor: '#FFF1EE',
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    color: '#2D2827',
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '800',
  },
  rowSub: {
    color: '#8E7D7A',
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '500',
    marginTop: 2,
  },
  deleteTitle: {
    color: '#9B3E36',
  },
  divider: {
    height: 1,
    backgroundColor: '#F4DFDC',
    marginLeft: 55,
  },
  footerText: {
    alignSelf: 'center',
    color: '#9B8583',
    fontSize: 12,
    fontWeight: '700',
    paddingTop: 20,
  },
});
