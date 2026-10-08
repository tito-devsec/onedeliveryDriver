import { ActivityIndicator, Image, Text, View } from 'react-native';
import { COLORS, BRAND } from '../constants';

export default function LoadingScreen({ message }: { message?: string }) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: COLORS.white,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
      }}
    >
      <Image
        source={require('../assets/icon.png')}
        style={{ width: 200, height: 70, marginBottom: 28 }}
        resizeMode="contain"
      />
      <ActivityIndicator size="large" color={COLORS.primary} />
      <Text style={{ color: COLORS.textMuted, marginTop: 16, fontSize: 14 }}>
        {message || BRAND.slogan}
      </Text>
    </View>
  );
}
