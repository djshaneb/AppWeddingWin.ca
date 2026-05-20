import { Tabs } from 'expo-router';
import { Heart, Info } from 'lucide-react-native';
import { Platform } from 'react-native';

const BRAND_COLOR = '#C66A6A';
const INACTIVE_COLOR = '#9B8583';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: BRAND_COLOR,
        tabBarInactiveTintColor: INACTIVE_COLOR,
        tabBarStyle: {
          backgroundColor: '#FFF8F5',
          borderTopWidth: 0.5,
          borderTopColor: '#F0D5D1',
          height: Platform.OS === 'ios' ? 88 : 64,
          paddingTop: 8,
          paddingBottom: Platform.OS === 'ios' ? 28 : 8,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'WeddingWin',
          tabBarIcon: ({ size, color }) => (
            <Heart size={size} color={color} strokeWidth={2} />
          ),
        }}
      />
      <Tabs.Screen
        name="about"
        options={{
          title: 'About',
          tabBarIcon: ({ size, color }) => (
            <Info size={size} color={color} strokeWidth={2} />
          ),
        }}
      />
    </Tabs>
  );
}
