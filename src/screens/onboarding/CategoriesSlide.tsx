import React, { useState } from 'react';
import {
  Dimensions,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import {
  STARTER_EXPENSE_CATEGORIES,
  type StarterCategoryDef,
} from '@/constants/categoryMappings';

const { width: W } = Dimensions.get('window');

interface Props {
  isActive: boolean;
  /** Keys of starter categories the user has toggled ON (e.g. 'food'). */
  selectedKeys: Set<string>;
  /** Custom category names added inline. */
  customs: string[];
  onToggleStarter: (key: string) => void;
  onAddCustom: (name: string) => void;
  onRemoveCustom: (name: string) => void;
}

const MAX_CUSTOM_LEN = 20;

export default function CategoriesSlide({
  selectedKeys,
  customs,
  onToggleStarter,
  onAddCustom,
  onRemoveCustom,
}: Props) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');

  const submitCustom = () => {
    const name = draft.trim();
    if (!name) {
      setAdding(false);
      setDraft('');
      return;
    }
    // Reject duplicates (case-insensitive against starters + existing customs).
    const lower = name.toLowerCase();
    const isStarter = STARTER_EXPENSE_CATEGORIES.some(
      (s) => s.name.toLowerCase() === lower
    );
    const isDup = customs.some((c) => c.toLowerCase() === lower);
    if (isStarter || isDup || lower === 'others') {
      // Soft-fail: clear and stop. UX-wise the user sees their input vanish
      // with nothing happening, which is enough hint without a modal.
      setDraft('');
      return;
    }
    onAddCustom(name);
    setDraft('');
    setAdding(false);
    Haptics.selectionAsync();
  };

  return (
    <View style={s.root}>
      {/* ── Header ── */}
      <View style={s.header}>
        <Text style={s.eyebrow}>Your Categories</Text>
        <Text style={s.title}>
          How do you like to{'\n'}
          <Text style={{ color: '#A8D5B5' }}>slice your spending?</Text>
        </Text>
        <Text style={s.subtitle}>
          Tap to toggle. Add your own — you can always change these later.
        </Text>
      </View>

      {/* ── Starter chips ── */}
      <View style={s.grid}>
        {STARTER_EXPENSE_CATEGORIES.map((cat) => (
          <StarterChip
            key={cat.key}
            cat={cat}
            selected={selectedKeys.has(cat.key)}
            onToggle={() => {
              Haptics.selectionAsync();
              onToggleStarter(cat.key);
            }}
          />
        ))}
      </View>

      {/* ── Custom list ── */}
      {customs.length > 0 && (
        <View style={s.customList}>
          {customs.map((name) => (
            <View key={name} style={s.customChip}>
              <Text style={s.customChipText}>{name}</Text>
              <TouchableOpacity
                onPress={() => {
                  Haptics.selectionAsync();
                  onRemoveCustom(name);
                }}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <Ionicons name="close" size={14} color="#A8D5B5" />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {/* ── Add custom inline ── */}
      <View style={s.addRow}>
        {adding ? (
          <View style={s.inputWrap}>
            <TextInput
              autoFocus
              value={draft}
              onChangeText={setDraft}
              onSubmitEditing={submitCustom}
              onBlur={submitCustom}
              maxLength={MAX_CUSTOM_LEN}
              placeholder="e.g. Coffee, Subscriptions"
              placeholderTextColor="rgba(255,255,255,0.3)"
              style={s.input}
              returnKeyType="done"
              autoCapitalize="words"
            />
            <TouchableOpacity onPress={submitCustom} style={s.confirmBtn}>
              <Ionicons name="checkmark" size={18} color="#0e0b18" />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={s.addBtn}
            onPress={() => setAdding(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="add" size={16} color="#A8D5B5" />
            <Text style={s.addBtnText}>Add your own</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Footer note ── */}
      <View style={s.footer}>
        <Text style={s.footerText}>
          “Others” is always created for you as a catch-all.
        </Text>
      </View>
    </View>
  );
}

// ─── Starter chip ───────────────────────────────────────────────────────────

function StarterChip({
  cat,
  selected,
  onToggle,
}: {
  cat: StarterCategoryDef;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onToggle}
      activeOpacity={0.85}
      style={[
        s.chip,
        selected
          ? { backgroundColor: cat.tileBg, borderColor: cat.textColor }
          : { backgroundColor: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.12)' },
      ]}
    >
      <Text
        style={[
          s.chipText,
          { color: selected ? cat.textColor : 'rgba(255,255,255,0.55)' },
        ]}
      >
        {cat.name}
      </Text>
      {selected ? (
        <Ionicons name="checkmark-circle" size={16} color={cat.textColor} />
      ) : null}
    </TouchableOpacity>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0e0b18', paddingHorizontal: 28 },
  header: { paddingTop: 80, paddingBottom: 16 },
  eyebrow: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(168,213,181,0.55)',
    letterSpacing: 2.4,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  title: {
    fontFamily: 'Nunito_900Black',
    fontSize: 28,
    color: 'white',
    lineHeight: 32,
    letterSpacing: -0.8,
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.55)',
    lineHeight: 19,
  },

  // ── Starter grid ──
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 24,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1.2,
  },
  chipText: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },

  // ── Custom list ──
  customList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14,
  },
  customChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 14,
    paddingRight: 10,
    paddingVertical: 9,
    borderRadius: 14,
    backgroundColor: 'rgba(168,213,181,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(168,213,181,0.32)',
  },
  customChipText: {
    fontSize: 13,
    color: '#A8D5B5',
    fontFamily: 'Inter_600SemiBold',
  },

  // ── Add row ──
  addRow: { marginTop: 18 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  addBtnText: {
    fontSize: 13,
    color: '#A8D5B5',
    fontFamily: 'Inter_600SemiBold',
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(168,213,181,0.32)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: 'white',
    fontFamily: 'Inter_500Medium',
    paddingVertical: 6,
  },
  confirmBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#A8D5B5',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Footer ──
  footer: { marginTop: 'auto', paddingBottom: 110 },
  footerText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.32)',
    lineHeight: 15,
    fontFamily: 'Inter_400Regular',
  },
});
