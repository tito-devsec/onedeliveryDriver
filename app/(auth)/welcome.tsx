import { Image, Text, View, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Button, BrandLogo } from '../../components/ui';
import GoogleButton from '../../components/GoogleButton';
import { COLORS, BRAND } from '../../constants';

const { height } = Dimensions.get('window');

export default function Welcome() {
  const router = useRouter();

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.navy }}>
      <StatusBar style="light" />

      {/* Full-bleed hero image */}
      <Image
        source={require('../../assets/welcome_portrait.png')}
        style={{ width: '100%', height: height * 0.62, position: 'absolute', top: 0, left: 0 }}
        resizeMode="cover"
      />

      {/* Bottom card */}
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <View
          style={{
            backgroundColor: COLORS.navy,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            paddingTop: 34,
            paddingHorizontal: 24,
            shadowColor: '#000',
            shadowOpacity: 0.25,
            shadowRadius: 20,
            shadowOffset: { width: 0, height: -6 },
            elevation: 12,
          }}
        >
          <SafeAreaView edges={['bottom']}>
            <View style={{ alignItems: 'center', marginBottom: 28 }}>
              <BrandLogo size={40} dark driver />
              <Text
                style={{
                  color: '#C9D2F0',
                  fontSize: 15,
                  textAlign: 'center',
                  marginTop: 16,
                  lineHeight: 22,
                }}
              >
                {BRAND.tagline}
                {'\n'}
                {BRAND.slogan}.
              </Text>
            </View>

            <View style={{ gap: 12, paddingBottom: 8 }}>
              <Button title="Sign in" variant="primary" onPress={() => router.push('/(auth)/login')} />
              <Button
                title="Register"
                variant="navy"
                style={{ backgroundColor: '#3A4C8C' }}
                onPress={() => router.push('/register')}
              />
              <GoogleButton style={{ borderColor: 'transparent' }} />
            </View>
          </SafeAreaView>
        </View>
      </View>
    </View>
  );
}
