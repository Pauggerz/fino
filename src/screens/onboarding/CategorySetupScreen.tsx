import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';

// 👈 IMPORT YOUR ACTUAL APP THEME DICTIONARIES
import {
  CATEGORY_COLOR,
  CATEGORY_TILE_BG,
} from '../../constants/categoryMappings';

const colors = {
  primary: '#2d6a4f',
  primaryLight: '#EFF8F2',
  textPrimary: '#1E1E2E',
  textSecondary: '#888780',
  border: '#e0dfd7',
  white: '#FFFFFF',
  background: '#F7F5F2',
};

// These are STRICTLY for the UI of this specific onboarding screen
const DEFAULT_CATEGORIES = [
  { id: 'food', name: 'Food', emoji: '🍔', setupBg: '#2d6a4f' },
  { id: 'transport', name: 'Transport', emoji: '🚌', setupBg: '#534AB7' },
  { id: 'shopping', name: 'Shopping', emoji: '🛍️', setupBg: '#BA7517' },
  { id: 'bills', name: 'Bills', emoji: '🧾', setupBg: '#1A535C' },
  { id: 'health', name: 'Health', emoji: '❤️', setupBg: '#E56B70' },
];

export default function CategorySetupScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();

  const [selectedCats, setSelectedCats] = useState<string[]>(
    DEFAULT_CATEGORIES.map((c) => c.id)
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const toggleCategory = (id: string) => {
    setSelectedCats((prev) =>
      prev.includes(id) ? prev.filter((catId) => catId !== id) : [...prev, id]
    );
  };

  const saveCategoriesToSupabase = async (categoryIdsToSave: string[]) => {
    setIsSubmitting(true);

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        Alert.alert('Auth Error', 'Could not find a logged in user.');
        setIsSubmitting(false);
        return;
      }

      // 1. Prepare the payload
      const categoriesToCreate = categoryIdsToSave.map((id, index) => {
        const catDef = DEFAULT_CATEGORIES.find((c) => c.id === id)!;
        return {
          user_id: user.id,
          name: catDef.name,

          // 👈 MUST BE THE STRING KEY for CategoryIcon.tsx to render SVGs in FeedScreen
          emoji: catDef.id,

          // 👈 Pulls your actual beautiful theme colors for the FeedScreen!
          tile_bg_colour: CATEGORY_TILE_BG[catDef.id] || '#F7F5F2',
          text_colour: CATEGORY_COLOR[catDef.id] || '#888780',

          is_active: true,
          is_default: true,
          sort_order: index,
        };
      });

      // 2. Wipe existing broken categories
      await supabase.from('categories').delete().eq('user_id', user.id);

      // 3. Bulk insert the corrected categories
      if (categoriesToCreate.length > 0) {
        const { error } = await supabase
          .from('categories')
          .insert(categoriesToCreate);
        if (error) throw error;
      }

      // 4. Success! Navigate to the main app
      navigation.reset({
        index: 0,
        routes: [{ name: 'Tabs' }],
      });
    } catch (error: any) {
      Alert.alert('Error saving categories', error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleContinue = () => {
    if (selectedCats.length === 0) {
      Alert.alert('Hold up!', 'Please select at least one category to track.');
      return;
    }
    saveCategoriesToSupabase(selectedCats);
  };

  const handleUseDefaults = () => {
    const allIds = DEFAULT_CATEGORIES.map((c) => c.id);
    saveCategoriesToSupabase(allIds);
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: Math.max(insets.top, 16) }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.obProgress}>
          <View style={styles.dotInactive} />
          <View style={styles.dotInactive} />
          <View style={styles.dotActive} />
          <View style={styles.dotInactive} />
        </View>

        <LinearGradient colors={['#FFF0E5', '#FCE4D6']} style={styles.obHero}>
          <Text style={styles.heroEmoji}>🗂️</Text>
        </LinearGradient>

        <View style={styles.headerTextContainer}>
          <Text style={styles.title}>Your spending categories</Text>
          <Text style={styles.subtitle}>
            We've pre-selected some common ones to get you started. Tap to
            deselect any you don't need.
          </Text>
        </View>

        <View style={styles.catObGrid}>
          {DEFAULT_CATEGORIES.map((cat) => {
            const isSelected = selectedCats.includes(cat.id);
            return (
              <TouchableOpacity
                key={cat.id}
                activeOpacity={0.7}
                disabled={isSubmitting}
                onPress={() => toggleCategory(cat.id)}
                style={[
                  styles.catTile,
                  isSelected
                    ? { backgroundColor: cat.setupBg, borderColor: cat.setupBg }
                    : styles.catTileUnsel,
                ]}
              >
                <Text style={styles.catEmoji}>{cat.emoji}</Text>
                <Text
                  style={[
                    styles.catName,
                    isSelected ? { color: colors.white } : styles.catNameUnsel,
                  ]}
                >
                  {cat.name}
                </Text>
              </TouchableOpacity>
            );
          })}

          <TouchableOpacity
            activeOpacity={0.7}
            disabled={true} // Disabled during onboarding
            style={[styles.catTile, styles.catTileUnsel, styles.catTileDashed]}
          >
            <View style={styles.addIconCircle}>
              <Ionicons name="add" size={16} color={colors.textSecondary} />
            </View>
            <Text style={[styles.catName, styles.catNameUnsel]}>
              Add Custom
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <View
        style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 24) }]}
      >
        <TouchableOpacity
          style={[styles.continueBtn, isSubmitting && { opacity: 0.7 }]}
          activeOpacity={0.8}
          onPress={handleContinue}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.continueBtnText}>Continue →</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.ghostBtn}
          onPress={handleUseDefaults}
          disabled={isSubmitting}
        >
          <Text style={styles.ghostBtnText}>Use defaults and continue</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: { paddingHorizontal: 24, paddingBottom: 40 },
  obProgress: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 32,
  },
  dotActive: {
    width: 22,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  dotInactive: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#D8D6D0',
  },
  obHero: {
    height: 140,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  heroEmoji: { fontSize: 60 },
  headerTextContainer: { marginBottom: 32 },
  title: {
    fontFamily: 'Nunito_800ExtraBold',
    fontSize: 24,
    color: colors.textPrimary,
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  catObGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },
  catTile: {
    width: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1.5,
    marginBottom: 12,
  },
  catTileUnsel: { backgroundColor: colors.white, borderColor: colors.border },
  catTileDashed: { borderStyle: 'dashed', backgroundColor: 'transparent' },
  catEmoji: { fontSize: 22, marginRight: 10 },
  catName: { fontFamily: 'Inter_600SemiBold', fontSize: 15, flexShrink: 1 },
  catNameUnsel: { color: colors.textSecondary },
  addIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#EAE8E3',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  footer: {
    paddingHorizontal: 24,
    backgroundColor: colors.background,
    paddingTop: 16,
  },
  continueBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  continueBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    color: colors.white,
  },
  ghostBtn: { alignItems: 'center', paddingVertical: 8 },
  ghostBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: colors.textSecondary,
  },
});
