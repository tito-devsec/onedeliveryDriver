import { useMemo } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, BRAND } from '../../constants';
import { useEarnings } from '../../hooks/useEarnings';

export default function Earnings() {
  const { data, isLoading } = useEarnings();

  const { today, week } = useMemo(() => {
    const entries = data?.earnings || [];
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfWeek = startOfDay - now.getDay() * 86400000;
    let t = 0;
    let w = 0;
    for (const e of entries) {
      const ts = new Date(e.created_at).getTime();
      const amt = Number(e.amount);
      if (ts >= startOfDay) t += amt;
      if (ts >= startOfWeek) w += amt;
    }
    return { today: t, week: w };
  }, [data]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.surface }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <Text style={{ fontSize: 26, fontWeight: '800', color: COLORS.textPrimary }}>Earnings</Text>
        <Text style={{ color: COLORS.textMuted, marginTop: 2, marginBottom: 20 }}>{BRAND.slogan}</Text>

        {/* Balance card */}
        <View style={{ backgroundColor: COLORS.navy, borderRadius: 20, padding: 22 }}>
          <Text style={{ color: '#C9D2F0', fontSize: 13 }}>Available balance</Text>
          <Text style={{ color: '#fff', fontSize: 34, fontWeight: '800', marginTop: 6 }}>
            TZS {Number(data?.balance || 0).toLocaleString()}
          </Text>
          <View style={{ flexDirection: 'row', gap: 20, marginTop: 18 }}>
            <View>
              <Text style={{ color: '#C9D2F0', fontSize: 12 }}>Total earned</Text>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>
                TZS {Number(data?.totalEarnings || 0).toLocaleString()}
              </Text>
            </View>
            <View>
              <Text style={{ color: '#C9D2F0', fontSize: 12 }}>Total trips</Text>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>{data?.totalTrips ?? 0}</Text>
            </View>
          </View>
        </View>

        {/* Today / week */}
        <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
          <SummaryCard icon="today" label="Today" value={today} />
          <SummaryCard icon="calendar" label="This week" value={week} />
        </View>

        {/* Recent entries */}
        <Text style={{ fontWeight: '800', fontSize: 18, color: COLORS.textPrimary, marginTop: 26, marginBottom: 12 }}>
          Recent payouts
        </Text>
        {isLoading ? (
          <Text style={{ color: COLORS.textMuted }}>Loading…</Text>
        ) : (data?.earnings || []).length === 0 ? (
          <View style={{ alignItems: 'center', marginTop: 30 }}>
            <Ionicons name="wallet-outline" size={48} color={COLORS.textDim} />
            <Text style={{ color: COLORS.textMuted, marginTop: 10 }}>No earnings yet</Text>
          </View>
        ) : (
          (data?.earnings || []).map((e) => (
            <View
              key={e.id}
              style={{ backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', borderWidth: 1, borderColor: COLORS.border }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '600', color: COLORS.textPrimary }}>{e.description || 'Delivery'}</Text>
                <Text style={{ color: COLORS.textDim, fontSize: 12, marginTop: 2 }}>
                  {new Date(e.created_at).toLocaleString()}
                </Text>
              </View>
              <Text style={{ fontWeight: '800', color: COLORS.success }}>
                + TZS {Number(e.amount).toLocaleString()}
              </Text>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function SummaryCard({ icon, label, value }: { icon: any; label: string; value: number }) {
  return (
    <View style={{ flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: COLORS.border }}>
      <Ionicons name={icon} size={22} color={COLORS.primary} />
      <Text style={{ color: COLORS.textMuted, fontSize: 12, marginTop: 8 }}>{label}</Text>
      <Text style={{ fontWeight: '800', fontSize: 18, color: COLORS.textPrimary, marginTop: 2 }}>
        TZS {value.toLocaleString()}
      </Text>
    </View>
  );
}
