import React from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, BRAND } from '../constants';

// ── Brand logo + wordmark ─────────────────────────────────────────────────────
export function BrandLogo({
  size = 40,
  showSlogan = false,
  dark = false,
  driver = false,
}: {
  size?: number;
  showSlogan?: boolean;
  dark?: boolean;
  driver?: boolean;
}) {
  return (
    <View style={{ alignItems: 'center' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: size * 0.22 }}>
        <Image
          source={require('../assets/icon.png')}
          style={{ width: size, height: size }}
          resizeMode="contain"
        />
        <Text
          style={{
            fontSize: size * 0.62,
            fontWeight: '800',
            letterSpacing: -0.3,
            color: dark ? COLORS.white : COLORS.navy,
          }}
        >
          One <Text style={{ color: COLORS.primary }}>Delivery</Text>
          {driver && (
            <Text style={{ color: dark ? COLORS.white : COLORS.navy, fontWeight: '700' }}> Driver</Text>
          )}
        </Text>
      </View>
      {showSlogan && (
        <Text
          style={{
            color: dark ? '#C9D2F0' : COLORS.textMuted,
            fontSize: size * 0.3,
            fontWeight: '600',
            marginTop: size * 0.18,
          }}
        >
          {BRAND.slogan}
        </Text>
      )}
    </View>
  );
}

// ── Primary / secondary / outline button ─────────────────────────────────────
interface ButtonProps {
  title: string;
  onPress?: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'navy' | 'outline' | 'ghost' | 'danger';
  style?: ViewStyle;
  icon?: keyof typeof Ionicons.glyphMap;
  iconRight?: keyof typeof Ionicons.glyphMap;
}
export function Button({
  title,
  onPress,
  loading,
  disabled,
  variant = 'primary',
  style,
  icon,
  iconRight,
}: ButtonProps) {
  const bg =
    variant === 'primary'
      ? COLORS.primary
      : variant === 'navy'
        ? COLORS.navy
        : variant === 'danger'
          ? COLORS.danger
          : 'transparent';
  const isOutline = variant === 'outline' || variant === 'ghost';
  const txtColor = isOutline ? COLORS.textPrimary : COLORS.white;
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        {
          backgroundColor: bg,
          borderRadius: 30,
          paddingVertical: 16,
          paddingHorizontal: 18,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          opacity: isDisabled ? 0.5 : pressed ? 0.88 : 1,
          borderWidth: variant === 'outline' ? 1.5 : 0,
          borderColor: COLORS.border,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={txtColor} />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={18} color={txtColor} />}
          <Text style={{ color: txtColor, fontSize: 16, fontWeight: '700' }}>{title}</Text>
          {iconRight && <Ionicons name={iconRight} size={18} color={txtColor} />}
        </>
      )}
    </Pressable>
  );
}

// ── Labeled text input ────────────────────────────────────────────────────────
interface FieldProps extends TextInputProps {
  label?: string;
  required?: boolean;
  hint?: string;
  error?: string;
}
export function Field({ label, required, hint, error, style, ...rest }: FieldProps) {
  return (
    <View style={{ marginBottom: 18 }}>
      {label && (
        <Text style={{ color: COLORS.textPrimary, fontSize: 14, fontWeight: '700', marginBottom: 8 }}>
          {label} {required && <Text style={{ color: COLORS.danger }}>*</Text>}
        </Text>
      )}
      <TextInput
        placeholderTextColor={COLORS.textDim}
        style={[
          {
            backgroundColor: COLORS.surface,
            borderRadius: 12,
            paddingHorizontal: 16,
            paddingVertical: 15,
            fontSize: 15,
            color: COLORS.textPrimary,
            borderWidth: 1.5,
            borderColor: error ? COLORS.danger : COLORS.surface,
          },
          style as object,
        ]}
        {...rest}
      />
      {hint && !error && (
        <Text style={{ color: COLORS.textMuted, fontSize: 12, marginTop: 6 }}>{hint}</Text>
      )}
      {error && <Text style={{ color: COLORS.danger, fontSize: 12, marginTop: 6 }}>{error}</Text>}
    </View>
  );
}

// ── Card container ────────────────────────────────────────────────────────────
export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return (
    <View
      style={[
        {
          backgroundColor: COLORS.white,
          borderRadius: 16,
          padding: 16,
          borderWidth: 1,
          borderColor: COLORS.border,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

// ── Step progress bar (registration) ──────────────────────────────────────────
export function StepBar({ step, total }: { step: number; total: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8, marginVertical: 16 }}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            height: 4,
            borderRadius: 2,
            backgroundColor: i <= step ? COLORS.primary : COLORS.border,
          }}
        />
      ))}
    </View>
  );
}

export function Pill({ text, color = COLORS.primary, bg }: { text: string; color?: string; bg?: string }) {
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        backgroundColor: bg || color + '22',
        paddingHorizontal: 12,
        paddingVertical: 5,
        borderRadius: 20,
      }}
    >
      <Text style={{ color, fontSize: 12, fontWeight: '700' }}>{text}</Text>
    </View>
  );
}
