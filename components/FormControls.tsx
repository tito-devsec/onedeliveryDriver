import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { COLORS } from '../constants';

export interface PickedFile {
  uri: string;
  name: string;
  type: string;
}

// ── Dropdown select (modal list) ──────────────────────────────────────────────
interface SelectProps {
  label?: string;
  required?: boolean;
  placeholder?: string;
  value?: string;
  options: { label: string; value: string }[];
  onChange: (value: string) => void;
}
export function Select({ label, required, placeholder, value, options, onChange }: SelectProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  return (
    <View style={{ marginBottom: 18 }}>
      {label && (
        <Text style={{ color: COLORS.textPrimary, fontSize: 14, fontWeight: '700', marginBottom: 8 }}>
          {label} {required && <Text style={{ color: COLORS.danger }}>*</Text>}
        </Text>
      )}
      <Pressable
        onPress={() => setOpen(true)}
        style={{
          backgroundColor: COLORS.surface,
          borderRadius: 12,
          paddingHorizontal: 16,
          paddingVertical: 16,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Text style={{ color: selected ? COLORS.textPrimary : COLORS.textDim, fontSize: 15 }}>
          {selected?.label || placeholder || 'Select…'}
        </Text>
        <Ionicons name="chevron-down" size={20} color={COLORS.textMuted} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable
          onPress={() => setOpen(false)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}
        >
          <View style={{ backgroundColor: COLORS.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '60%', paddingVertical: 8 }}>
            {label && (
              <Text style={{ fontWeight: '800', fontSize: 16, padding: 16, color: COLORS.textPrimary }}>
                {label}
              </Text>
            )}
            <ScrollView>
              {options.map((o) => (
                <Pressable
                  key={o.value}
                  onPress={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  style={{ paddingHorizontal: 20, paddingVertical: 16, flexDirection: 'row', justifyContent: 'space-between' }}
                >
                  <Text style={{ fontSize: 16, color: COLORS.textPrimary }}>{o.label}</Text>
                  {value === o.value && <Ionicons name="checkmark" size={20} color={COLORS.primary} />}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

// ── File upload (image) ───────────────────────────────────────────────────────
interface UploadProps {
  label: string;
  required?: boolean;
  hint?: string;
  file: PickedFile | null;
  onPick: (file: PickedFile) => void;
}
export function FileUpload({ label, required, hint, file, onPick }: UploadProps) {
  const pick = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });
    if (!res.canceled && res.assets?.[0]) {
      const a = res.assets[0];
      const name = a.fileName || `upload_${Date.now()}.jpg`;
      onPick({ uri: a.uri, name, type: a.mimeType || 'image/jpeg' });
    }
  };

  return (
    <View style={{ marginBottom: 22 }}>
      <Text style={{ color: COLORS.textPrimary, fontSize: 16, fontWeight: '700' }}>
        {label} {required && <Text style={{ color: COLORS.danger }}>*</Text>}
      </Text>
      {hint && <Text style={{ color: COLORS.textMuted, fontSize: 13, marginTop: 4, marginBottom: 10 }}>{hint}</Text>}
      <Pressable
        onPress={pick}
        style={{
          marginTop: 10,
          backgroundColor: file ? COLORS.successBg : COLORS.surface,
          borderRadius: 24,
          paddingVertical: 12,
          paddingHorizontal: 20,
          alignSelf: 'flex-start',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <Ionicons
          name={file ? 'checkmark-circle' : 'add'}
          size={20}
          color={file ? COLORS.success : COLORS.textPrimary}
        />
        <Text style={{ fontWeight: '700', color: file ? COLORS.success : COLORS.textPrimary }}>
          {file ? 'Uploaded — change' : 'Upload file'}
        </Text>
      </Pressable>
    </View>
  );
}
