import { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants';
import { get, post } from '../../lib/api';
import { getSocket, connectSocket } from '../../lib/socket';
import { useAuth } from '../../context/AuthContext';
import type { ChatMessage } from '../../types';

export default function Chat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList>(null);

  const load = async () => {
    try {
      const res = await get<{ messages: ChatMessage[] }>(`/chat/conversations/${id}/messages`);
      setMessages(res.messages || []);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    load();
    let socket = getSocket();
    (async () => {
      if (!socket) socket = await connectSocket();
      socket.emit('chat:join', { conversationId: id });
      socket.on('new_message', (msg: ChatMessage) => {
        if (msg.conversation_id === id) {
          setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
        }
      });
    })();
    return () => {
      const s = getSocket();
      s?.emit('chat:leave', { conversationId: id });
      s?.off('new_message');
    };
  }, [id]);

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setText('');
    try {
      const res = await post<{ message: ChatMessage }>(`/chat/conversations/${id}/messages`, { body });
      setMessages((prev) => (prev.some((m) => m.id === res.message.id) ? prev : [...prev, res.message]));
    } catch {
      setText(body);
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.white }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border, gap: 12 }}>
        <Pressable onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
        </Pressable>
        <Text style={{ fontWeight: '800', fontSize: 17, color: COLORS.textPrimary }}>Customer</Text>
      </View>

      {/* Keeps the message box on top of the keyboard */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 16 }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          renderItem={({ item }) => {
            const mine = item.sender_id === user?.id;
            return (
              <View style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '78%', marginBottom: 10 }}>
                <View style={{ backgroundColor: mine ? COLORS.primary : COLORS.surface, padding: 12, borderRadius: 16, borderBottomRightRadius: mine ? 4 : 16, borderBottomLeftRadius: mine ? 16 : 4 }}>
                  <Text style={{ color: mine ? '#fff' : COLORS.textPrimary, fontSize: 15 }}>{item.body}</Text>
                </View>
                <Text style={{ color: COLORS.textDim, fontSize: 11, marginTop: 3, alignSelf: mine ? 'flex-end' : 'flex-start' }}>
                  {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 60 }}>
              <Ionicons name="chatbubbles-outline" size={48} color={COLORS.textDim} />
              <Text style={{ color: COLORS.textMuted, marginTop: 10 }}>Start the conversation</Text>
            </View>
          }
        />

        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 12, borderTopWidth: 1, borderTopColor: COLORS.border, gap: 10 }}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Type a message…"
            placeholderTextColor={COLORS.textDim}
            style={{ flex: 1, backgroundColor: COLORS.surface, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 12, color: COLORS.textPrimary }}
            multiline
          />
          <Pressable onPress={send} disabled={sending || !text.trim()} style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', opacity: sending || !text.trim() ? 0.5 : 1 }}>
            <Ionicons name="send" size={20} color="#fff" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
