import { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Button, Field, StepBar, BrandLogo } from '../../components/ui';
import { Select, FileUpload, PickedFile } from '../../components/FormControls';
import { COLORS, VEHICLE_KIND_OPTIONS, MOBILE_MONEY_NETWORKS } from '../../constants';
import { useAuth } from '../../context/AuthContext';

const YEARS = Array.from({ length: 26 }, (_, i) => {
  const y = String(new Date().getFullYear() - i);
  return { label: y, value: y };
});

export default function Register() {
  const router = useRouter();
  const { user, register, applyAsDriver } = useAuth();

  // If the user already has an account (came back to finish), skip account step
  const startStep = user ? 1 : 0;
  const [step, setStep] = useState(startStep);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Account
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [city] = useState('Dar es Salaam');
  const [agree, setAgree] = useState(false);
  const [vehicleKind, setVehicleKind] = useState('');

  // Driver info
  const [nationalId, setNationalId] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [driverPhoto, setDriverPhoto] = useState<PickedFile | null>(null);
  const [licenseDoc, setLicenseDoc] = useState<PickedFile | null>(null);
  const [idDoc, setIdDoc] = useState<PickedFile | null>(null);

  // Vehicle info
  const [manufacturer, setManufacturer] = useState('');
  const [vehicleYear, setVehicleYear] = useState('');
  const [plate, setPlate] = useState('');
  const [color, setColor] = useState('');
  const [vehiclePhoto, setVehiclePhoto] = useState<PickedFile | null>(null);

  // Payment
  const [mmName, setMmName] = useState('');
  const [address, setAddress] = useState('');
  const [mmNumber, setMmNumber] = useState('');
  const [mmNetwork, setMmNetwork] = useState('');

  const totalSteps = 4;
  const isLastStep = step === totalSteps - 1;

  const titles = ['Personal information', 'Driver information', 'Vehicle information', 'Payment details'];
  const subtitles = [
    'Riders can only see your first name in the app',
    'Pakia nyaraka zako halali',
    'Riders will see your vehicle details in the app',
    'We need your payment details to pay you',
  ];

  const canNext = useMemo(() => {
    if (step === 0)
      return (
        firstName.trim() &&
        lastName.trim() &&
        email.includes('@') &&
        phone.trim().length >= 9 &&
        password.length >= 8 &&
        vehicleKind &&
        agree
      );
    if (step === 1) return nationalId.trim() && licenseNumber.trim() && driverPhoto && licenseDoc && idDoc;
    if (step === 2) return manufacturer.trim() && vehicleYear && plate.trim() && color.trim() && vehiclePhoto;
    if (step === 3) return mmName.trim() && address.trim() && mmNumber.trim() && mmNetwork;
    return false;
  }, [
    step, firstName, lastName, email, phone, password, vehicleKind, agree,
    nationalId, licenseNumber, driverPhoto, licenseDoc, idDoc,
    manufacturer, vehicleYear, plate, color, vehiclePhoto,
    mmName, address, mmNumber, mmNetwork,
  ]);

  const buzz = () =>
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

  const next = async () => {
    setError('');
    if (!canNext) {
      setError('Please complete all required fields.');
      return;
    }
    buzz();

    // Step 0 → create the account first
    if (step === 0) {
      setLoading(true);
      try {
        await register({
          name: `${firstName.trim()} ${lastName.trim()}`.trim(),
          email: email.trim().toLowerCase(),
          password,
          phone: phone.trim(),
        });
        setStep(1);
      } catch (e: any) {
        setError(e.message || 'Could not create account');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (step < totalSteps - 1) {
      setStep(step + 1);
      return;
    }

    // Final step → submit driver application
    await submitApplication();
  };

  const submitApplication = async () => {
    setLoading(true);
    setError('');
    try {
      const form = new FormData();
      // Fields the backend stores
      form.append('vehicle_type', vehicleKind);
      form.append('plate_number', plate.trim().toUpperCase());
      form.append('vehicle_color', color.trim());
      form.append('vehicle_model', `${manufacturer.trim()} ${vehicleYear}`.trim());
      form.append('license_number', licenseNumber.trim());
      // Extra fields (kept for records; ignored if unused server-side)
      form.append('national_id', nationalId.trim());
      form.append('mobile_money_name', mmName.trim());
      form.append('mobile_money_number', mmNumber.trim());
      form.append('mobile_money_network', mmNetwork);
      form.append('address', address.trim());
      form.append('city', city);

      // Files
      if (idDoc) form.append('id_document', { uri: idDoc.uri, name: idDoc.name, type: idDoc.type } as any);
      if (licenseDoc)
        form.append('license_document', { uri: licenseDoc.uri, name: licenseDoc.name, type: licenseDoc.type } as any);
      if (vehiclePhoto)
        form.append('vehicle_photo', { uri: vehiclePhoto.uri, name: vehiclePhoto.name, type: vehiclePhoto.type } as any);
      if (driverPhoto)
        form.append('driver_photo', { uri: driverPhoto.uri, name: driverPhoto.name, type: driverPhoto.type } as any);

      await applyAsDriver(form);
      // Application now pending → guard moves us into (tabs)/home which shows review state
      router.replace('/(tabs)/home');
    } catch (e: any) {
      setError(e.message || 'Application failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Back: previous step, or leave the flow on the first step.
  const back = () => {
    setError('');
    if (loading) return;
    if (step > startStep) {
      buzz();
      setStep(step - 1);
    } else {
      router.replace('/(auth)/welcome');
    }
  };

  const onFirstStep = step === startStep;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.white }} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 10 }}>
        <Pressable onPress={back} hitSlop={10}>
          <Ionicons name={onFirstStep ? 'close' : 'arrow-back'} size={26} color={COLORS.textPrimary} />
        </Pressable>
        <Text style={{ flex: 1, textAlign: 'center', fontWeight: '700', fontSize: 17, color: COLORS.textPrimary }}>
          Register
        </Text>
        {/* Step counter (keeps header balanced) */}
        <Text style={{ width: 56, textAlign: 'right', color: COLORS.textMuted, fontSize: 13, fontWeight: '700' }}>
          {step + 1} / {totalSteps}
        </Text>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <ScrollView
          contentContainerStyle={{ padding: 24, paddingTop: 8, paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={{ alignItems: 'flex-start', marginBottom: 4 }}>
            <BrandLogo size={30} />
          </View>
          <StepBar step={step} total={totalSteps} />

          <Text style={{ fontSize: 24, fontWeight: '800', color: COLORS.textPrimary }}>{titles[step]}</Text>
          <Text style={{ color: COLORS.textMuted, marginTop: 4, marginBottom: 22 }}>{subtitles[step]}</Text>

          {/* STEP 0 — Account / Personal */}
          {step === 0 && (
            <>
              <Field label="First and middle name" required placeholder="First name" value={firstName} onChangeText={setFirstName} />
              <Field label="Last name" required placeholder="Last name" value={lastName} onChangeText={setLastName} />
              <Field
                label="Email address"
                required
                placeholder="you@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                value={email}
                onChangeText={setEmail}
              />
              <Field
                label="Phone number"
                required
                placeholder="+255 7XX XXX XXX"
                keyboardType="phone-pad"
                value={phone}
                onChangeText={setPhone}
                hint="We'll send delivery updates here"
              />
              <Field
                label="Password"
                required
                placeholder="At least 8 characters"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
              />
              <Field label="City" value={city} editable={false} />
              <Select
                label="What kind of vehicle do you have?"
                required
                placeholder="Select vehicle"
                value={vehicleKind}
                options={VEHICLE_KIND_OPTIONS}
                onChange={setVehicleKind}
              />
              <Pressable
                onPress={() => setAgree((a) => !a)}
                style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}
              >
                <Ionicons
                  name={agree ? 'checkbox' : 'square-outline'}
                  size={22}
                  color={agree ? COLORS.primary : COLORS.textMuted}
                />
                <Text style={{ flex: 1, color: COLORS.textMuted, fontSize: 13, lineHeight: 19 }}>
                  By registering, you agree to our Terms of Service and Privacy Policy, and commit to provide only legal
                  services on the One Delivery platform.
                </Text>
              </Pressable>
            </>
          )}

          {/* STEP 1 — Driver information */}
          {step === 1 && (
            <>
              <Field
                label="National ID"
                required
                placeholder="National ID number"
                value={nationalId}
                onChangeText={setNationalId}
                hint="Your NIDA / social security number"
              />
              <Field
                label="Driver license number"
                required
                placeholder="e.g. AB235235"
                value={licenseNumber}
                onChangeText={setLicenseNumber}
                hint="License number on your driver's documents"
              />
              <FileUpload
                label="Picha ya dereva"
                required
                hint="Ionekane vizuri na iwe na background nyeupe"
                file={driverPhoto}
                onPick={setDriverPhoto}
              />
              <FileUpload
                label="Leseni ya dereva"
                required
                hint="Pakia leseni halali — bodaboda: A1 · bajaj: A2 · gari: C2/C3"
                file={licenseDoc}
                onPick={setLicenseDoc}
              />
              <FileUpload
                label="Kitambulisho cha taifa / passport / cheti cha kuzaliwa"
                required
                hint="Pakia kitambulisho cha taifa, passport au TIN"
                file={idDoc}
                onPick={setIdDoc}
              />
            </>
          )}

          {/* STEP 2 — Vehicle information */}
          {step === 2 && (
            <>
              <Field
                label="Vehicle manufacturer and model"
                required
                placeholder="e.g. Toyota Hilux"
                value={manufacturer}
                onChangeText={setManufacturer}
              />
              <Select label="Vehicle year" required placeholder="Select year" value={vehicleYear} options={YEARS} onChange={setVehicleYear} />
              <Field label="Licence plate" required placeholder="T100EAA" autoCapitalize="characters" value={plate} onChangeText={setPlate} />
              <Field label="Vehicle colour" required placeholder="e.g. White" value={color} onChangeText={setColor} />
              <FileUpload
                label="Picha ya chombo (Boda / Bajaji / Gari)"
                required
                hint="Plate number IONEKANE vizuri"
                file={vehiclePhoto}
                onPick={setVehiclePhoto}
              />
            </>
          )}

          {/* STEP 3 — Payment details */}
          {step === 3 && (
            <>
              <Field label="Mobile Money Account Name" required placeholder="Account holder name" value={mmName} onChangeText={setMmName} />
              <Field label="Address" required placeholder="Your home address" value={address} onChangeText={setAddress} />
              <Field
                label="Mobile Money Number"
                required
                placeholder="07XX XXX XXX"
                keyboardType="phone-pad"
                value={mmNumber}
                onChangeText={setMmNumber}
                hint="Your mobile money number"
              />
              <Select
                label="Mobile money network"
                required
                placeholder="Select network"
                value={mmNetwork}
                options={MOBILE_MONEY_NETWORKS.map((n) => ({ label: n, value: n }))}
                onChange={setMmNetwork}
              />
            </>
          )}

          {!!error && (
            <View style={{ backgroundColor: COLORS.dangerBg, padding: 12, borderRadius: 10, marginTop: 4, marginBottom: 4 }}>
              <Text style={{ color: COLORS.danger, fontSize: 13 }}>{error}</Text>
            </View>
          )}
        </ScrollView>

        {/* Pinned Back / Next navigation — shown on EVERY step */}
        <View
          style={{
            flexDirection: 'row',
            gap: 12,
            paddingHorizontal: 24,
            paddingTop: 12,
            paddingBottom: Platform.OS === 'ios' ? 4 : 16,
            borderTopWidth: 1,
            borderTopColor: COLORS.border,
            backgroundColor: COLORS.white,
          }}
        >
          <Button
            title="Back"
            variant="outline"
            icon="chevron-back"
            style={{ flex: 1 }}
            onPress={back}
            disabled={loading}
          />
          <Button
            title={isLastStep ? 'Submit application' : 'Next'}
            variant="primary"
            iconRight={isLastStep ? 'checkmark' : 'chevron-forward'}
            style={{ flex: 1.6 }}
            loading={loading}
            disabled={!canNext}
            onPress={next}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
