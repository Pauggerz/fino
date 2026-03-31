import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Animated,
  ScrollView,
  TextInput,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { colors, spacing } from '../constants/theme';
import { transitions } from '../constants/transitions';
import { transactionStore } from '../services/balanceCalc';
import {
  createDebouncedAnalyzer,
  type AIAnalysisResult,
  type Category,
} from '../services/aiCategoryMap';

// ─── Data ─────────────────────────────────────────────────────────────────────

const CATEGORIES: {
  id: Category;
  label: string;
  bg: string;
  text: string;
  border: string;
}[] = [
  {
    id: 'food',
    label: '🍔 Food',
    bg: colors.pillFoodBg,
    text: colors.pillFoodText,
    border: colors.pillFoodBorder,
  },
  {
    id: 'transport',
    label: '🚌 Transport',
    bg: colors.pillTransportBg,
    text: colors.pillTransportText,
    border: colors.pillTransportBorder,
  },
  {
    id: 'shopping',
    label: '🛍 Shopping',
    bg: colors.pillShoppingBg,
    text: colors.pillShoppingText,
    border: colors.pillShoppingBorder,
  },
  {
    id: 'bills',
    label: '⚡ Bills',
    bg: colors.pillBillsBg,
    text: colors.pillBillsText,
    border: colors.pillBillsBorder,
  },
  {
    id: 'health',
    label: '❤️ Health',
    bg: colors.pillHealthBg,
    text: colors.pillHealthText,
    border: colors.pillHealthBorder,
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function ScreenshotScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  // ── Image + parse state ──
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [hasParsedData, setHasParsedData] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  // ── Parsed fields (mocked — high vs low confidence) ──
  const [merchant] = useState('Jollibee Drive Thru');
  const [amount] = useState('185.00');
  const [date, setDate] = useState(
    new Date().toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  );

  // ── Low-confidence field tracking ──
  const [isEditingDate, setIsEditingDate] = useState(false);
  const [isDateConfirmed, setIsDateConfirmed] = useState(false);

  // ── Category + AI description ──
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(
    null
  );
  const [aiText, setAiText] = useState('');
  const [aiResult, setAiResult] = useState<AIAnalysisResult | null>(null);
  const [aiInputFocused, setAiInputFocused] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const analyzer = useRef(createDebouncedAnalyzer()).current;

  useEffect(() => () => analyzer.cancel(), [analyzer]);

  // ── Image selection ──
  const handleImageSelection = (uri: string) => {
    setImageUri(uri);
    setIsParsing(true);
    setHasParsedData(false);
    setIsDateConfirmed(false);
    setSelectedCategory(null);
    setAiText('');
    setAiResult(null);
    fadeAnim.setValue(0);

    // Simulate 2200ms OCR delay (matches prototype PARSING_OVERLAY_HIDE)
    setTimeout(() => {
      setIsParsing(false);
      setHasParsedData(true);
      setSelectedCategory('food');

      // Parsed card fades in over 300ms
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: transitions.PARSING_REVEAL.duration, // 300ms
        useNativeDriver: true,
      }).start();
    }, transitions.PARSING_OVERLAY_HIDE); // 2200ms
  };

  const pickImage = async (source: 'camera' | 'upload') => {
    let result;
    if (source === 'camera') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) return;
      result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    } else {
      result = await ImagePicker.launchImageLibraryAsync({ quality: 0.8 });
    }
    if (!result.canceled && result.assets?.length) {
      handleImageSelection(result.assets[0].uri);
    }
  };

  // ── AI description ──
  const handleAiTextChange = (text: string) => {
    setAiText(text);
    setAiResult(null);
    if (text.trim()) {
      analyzer.analyze(text, (result) => {
        setAiResult(result);
        if (result.suggestedCategory) {
          setSelectedCategory(result.suggestedCategory as Category);
        }
      });
    } else {
      analyzer.cancel();
    }
  };

  // ── Low-confidence date confirmation ──
  const confirmDate = () => {
    setIsEditingDate(false);
    setIsDateConfirmed(true);
  };

  // ── Save — disabled until low-conf fields confirmed + category picked ──
  const isFormValid =
    hasParsedData && selectedCategory !== null && isDateConfirmed;

  const handleConfirm = () => {
    if (!isFormValid) return;
    transactionStore.add({
      type: 'exp',
      amount: parseFloat(amount),
      account: 'gcash',
      category: selectedCategory!,
      note: aiText || merchant,
      signal_source: 'ai_description',
    });
    navigation.goBack();
  };

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, 16) }]}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Ionicons name="chevron-back" size={28} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Scan Receipt</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Empty state (no image yet) ── */}
        {!imageUri && (
          <View style={styles.emptyStateContainer}>
            <View style={styles.iconCircle}>
              <Ionicons name="scan" size={32} color={colors.primary} />
            </View>
            <Text style={styles.emptyStateTitle}>Upload a Receipt</Text>
            <Text style={styles.emptyStateSub}>
              Snap a photo or choose from your gallery and let AI do the heavy
              lifting.
            </Text>
            <View style={styles.uploadButtonsRow}>
              <TouchableOpacity
                style={styles.uploadBtn}
                onPress={() => pickImage('camera')}
                activeOpacity={0.8}
              >
                <Ionicons name="camera" size={20} color={colors.white} />
                <Text style={styles.uploadBtnText}>Camera</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.uploadBtnSecondary}
                onPress={() => pickImage('upload')}
                activeOpacity={0.8}
              >
                <Ionicons name="image" size={20} color={colors.primary} />
                <Text style={styles.uploadBtnTextSecondary}>Gallery</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── Receipt preview — 140px, borderRadius:16, gradient bg ── */}
        {!!imageUri && (
          <TouchableOpacity
            style={styles.previewContainer}
            activeOpacity={0.9}
            onPress={() => setIsExpanded(true)}
          >
            <LinearGradient
              colors={['#e0ddd8', '#cccac4']}
              style={StyleSheet.absoluteFill}
            />
            <Image source={{ uri: imageUri }} style={styles.previewImage} />
            <View style={styles.expandOverlay}>
              <Text style={styles.expandText}>⤢ expand</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* ── Parsing overlay ── */}
        {isParsing && (
          <View style={styles.parsingOverlay}>
            <ActivityIndicator
              size="large"
              color={colors.primary}
              style={{ marginBottom: 16 }}
            />
            {/* spec: "Parsing receipt…", colors.primary, 13px Inter 700 */}
            <Text style={styles.parsingTitle}>Parsing receipt…</Text>
            {/* spec: 11px textSecondary */}
            <Text style={styles.parsingSubtitle}>Usually under 3 seconds</Text>
          </View>
        )}

        {/* ── Parsed card ── */}
        {hasParsedData && (
          <Animated.View style={{ opacity: fadeAnim, marginTop: 16 }}>
            {/* Confidence legend */}
            <View style={styles.legendRow}>
              <View style={styles.legendItem}>
                <View
                  style={[styles.legendDot, { backgroundColor: '#A0BCA0' }]}
                />
                <Text style={styles.legendText}>Confirmed</Text>
              </View>
              <View style={styles.legendItem}>
                <View
                  style={[styles.legendDot, { backgroundColor: colors.coral }]}
                />
                <Text style={styles.legendText}>Check</Text>
              </View>
            </View>

            {/* High-confidence: Merchant */}
            <View style={[styles.confField, styles.confHiField]}>
              <Text style={styles.confFieldLabel}>Merchant</Text>
              <Text style={styles.confHiValue}>{merchant}</Text>
            </View>

            {/* High-confidence: Amount */}
            <View
              style={[styles.confField, styles.confHiField, { marginTop: 8 }]}
            >
              <Text style={styles.confFieldLabel}>Amount</Text>
              <Text style={[styles.confHiValue, styles.confHiAmountValue]}>
                ₱{amount}
              </Text>
            </View>

            {/* Low-confidence: Date (requires Fix ›) */}
            <View
              style={[styles.confField, styles.confLoField, { marginTop: 8 }]}
            >
              <Text style={styles.confFieldLabel}>Date & Time</Text>
              {isEditingDate ? (
                <TextInput
                  style={styles.confLoInput}
                  value={date}
                  onChangeText={setDate}
                  onBlur={confirmDate}
                  onSubmitEditing={confirmDate}
                  autoFocus
                  returnKeyType="done"
                />
              ) : (
                <TouchableOpacity
                  style={styles.fixRow}
                  onPress={() => setIsEditingDate(true)}
                >
                  <Text
                    style={[
                      styles.confLoValue,
                      isDateConfirmed && styles.confLoValueConfirmed,
                    ]}
                  >
                    {date}
                  </Text>
                  {!isDateConfirmed && (
                    <Text style={styles.fixChevron}>Fix ›</Text>
                  )}
                </TouchableOpacity>
              )}
            </View>

            {/* ── Category pills ── */}
            <View style={styles.section}>
              <Text style={styles.fieldLabel}>
                CATEGORY <Text style={styles.aiLabel}>✦ AI suggested</Text>
              </Text>
              <View style={styles.pillsRow}>
                {CATEGORIES.map((cat) => {
                  const isSel = selectedCategory === cat.id;
                  return (
                    <TouchableOpacity
                      key={cat.id}
                      onPress={() => setSelectedCategory(cat.id)}
                      style={[
                        styles.catPill,
                        isSel
                          ? {
                              backgroundColor: cat.bg,
                              borderColor: cat.border,
                            }
                          : {},
                      ]}
                    >
                      <Text
                        style={[
                          styles.catPillText,
                          isSel && { color: cat.text },
                        ]}
                      >
                        {cat.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* ── "or describe" divider + AI field ── */}
            <View style={styles.aiFieldWrap}>
              <View style={styles.orDivider}>
                <View style={styles.orLine} />
                <Text style={styles.orText}>or describe</Text>
                <View style={styles.orLine} />
              </View>

              <View
                style={[
                  styles.aiField,
                  aiInputFocused && { borderColor: colors.primary },
                ]}
              >
                <View
                  style={[
                    styles.aiFieldIcon,
                    aiText ? styles.aiFieldIconMapped : {},
                  ]}
                />
                <TextInput
                  style={[
                    styles.aiFieldText,
                    aiText ? styles.aiFieldTextHasText : {},
                  ]}
                  placeholder='e.g. "lunch", "grab ride", "gamot"'
                  placeholderTextColor={colors.textSecondary}
                  value={aiText}
                  onChangeText={handleAiTextChange}
                  onFocus={() => setAiInputFocused(true)}
                  onBlur={() => setAiInputFocused(false)}
                  returnKeyType="done"
                />
              </View>

              {!!aiResult && aiResult.suggestedCategory && (
                <View style={styles.aiConfirm}>
                  <View style={styles.aiConfirmDot} />
                  <Text style={styles.aiConfirmText}>
                    &quot;{aiResult.matchedKeyword}&quot; →{' '}
                    {aiResult.suggestedCategory.charAt(0).toUpperCase() +
                      aiResult.suggestedCategory.slice(1)}{' '}
                    ✓
                  </Text>
                </View>
              )}

              {!!aiText && !!aiResult && !aiResult.suggestedCategory && (
                <View style={styles.aiNudge}>
                  <View style={styles.aiNudgeDot} />
                  <Text style={styles.aiNudgeText}>
                    Not sure about that one — pick a category?
                  </Text>
                </View>
              )}
            </View>
          </Animated.View>
        )}
      </ScrollView>

      {/* ── Footer ── */}
      <View
        style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 24) }]}
      >
        <TouchableOpacity
          activeOpacity={0.8}
          disabled={!isFormValid}
          onPress={handleConfirm}
          style={[
            styles.saveBtnWrap,
            !isFormValid && { opacity: 0.4, shadowOpacity: 0, elevation: 0 },
          ]}
        >
          <LinearGradient
            colors={['#4a7a5e', '#5B8C6E', '#6a9e7f']}
            style={styles.saveBtn}
          >
            <Text style={styles.saveBtnText}>Confirm & save</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* ── Fullscreen image modal ── */}
      <Modal visible={isExpanded} transparent animationType="fade">
        <View style={styles.modalBg}>
          <TouchableOpacity
            style={styles.modalClose}
            onPress={() => setIsExpanded(false)}
          >
            <Ionicons name="close-circle" size={36} color={colors.white} />
          </TouchableOpacity>
          <Image
            source={{ uri: imageUri || undefined }}
            style={styles.modalImage}
            resizeMode="contain"
          />
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // ── Header ──
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.screenPadding,
    paddingBottom: 24,
  },
  headerTitle: {
    fontFamily: 'Nunito_700Bold',
    fontSize: 18,
    color: colors.textPrimary,
  },
  backButton: {
    width: 40,
    alignItems: 'flex-start',
  },

  scrollContent: {
    paddingHorizontal: spacing.screenPadding,
    paddingBottom: 40,
  },

  // ── Empty state ──
  emptyStateContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(45,106,79,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  emptyStateTitle: {
    fontFamily: 'Nunito_700Bold',
    fontSize: 20,
    color: colors.textPrimary,
    marginBottom: 8,
  },
  emptyStateSub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 20,
    paddingHorizontal: 20,
  },
  uploadButtonsRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  uploadBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: 16,
    gap: 8,
  },
  uploadBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: colors.white,
  },
  uploadBtnSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    paddingVertical: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    gap: 8,
  },
  uploadBtnTextSecondary: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: colors.primary,
  },

  // ── Receipt preview — spec: 140px, borderRadius:16, gradient bg ──
  previewContainer: {
    height: 140,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
  },
  previewImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  expandOverlay: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  expandText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: colors.white,
  },

  // ── Parsing overlay — spec: colors.primary 13px 700, subtitle 11px textSecondary ──
  parsingOverlay: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  parsingTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
    color: colors.primary,
    marginBottom: 6,
  },
  parsingSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: colors.textSecondary,
  },

  // ── Confidence legend ──
  legendRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  legendText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: colors.textSecondary,
  },

  // ── Confidence fields ──
  confField: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  // High-confidence: #E8E6E2 bg, #A0BCA0 border
  confHiField: {
    backgroundColor: '#E8E6E2',
    borderColor: '#A0BCA0',
  },
  // Low-confidence: #FBF0EC bg, #C8A09A border
  confLoField: {
    backgroundColor: '#FBF0EC',
    borderColor: '#C8A09A',
  },
  confFieldLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: colors.textSecondary,
  },
  // High-conf value: DM Mono, read-only
  confHiValue: {
    fontFamily: 'DMMono_500Medium',
    fontSize: 13,
    color: colors.textPrimary,
    textAlign: 'right',
    flex: 1,
    marginLeft: 8,
  },
  confHiAmountValue: {
    fontSize: 16,
    color: colors.primary,
  },
  // Low-conf value + Fix › row
  fixRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    justifyContent: 'flex-end',
  },
  confLoValue: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: colors.coralDark,
    textAlign: 'right',
  },
  confLoValueConfirmed: {
    fontFamily: 'DMMono_500Medium',
    color: colors.textPrimary,
  },
  fixChevron: {
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
    color: colors.coralDark,
  },
  confLoInput: {
    fontFamily: 'DMMono_500Medium',
    fontSize: 13,
    color: colors.primary,
    flex: 1,
    textAlign: 'right',
    padding: 0,
  },

  // ── Section + category pills (borderRadius:12 per spec) ──
  section: {
    marginTop: 20,
    marginBottom: 4,
  },
  fieldLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  aiLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    color: colors.lavenderDark,
    textTransform: 'none',
    letterSpacing: 0,
  },
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  catPill: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(30,30,46,0.08)',
    backgroundColor: colors.background,
  },
  catPillText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: colors.textSecondary,
  },

  // ── "or describe" + AI field (identical to AddTransactionSheet) ──
  aiFieldWrap: {
    marginTop: 4,
    marginBottom: 24,
  },
  orDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginVertical: 12,
  },
  orLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(30,30,46,0.08)',
  },
  orText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 9,
    color: colors.textSecondary,
    letterSpacing: 0.5,
  },
  aiField: {
    backgroundColor: colors.lavenderLight,
    borderWidth: 1.5,
    borderColor: colors.lavender,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  aiFieldIcon: {
    width: 10,
    height: 10,
    borderRadius: 3,
    backgroundColor: '#B8B4D8',
  },
  aiFieldIconMapped: {
    backgroundColor: colors.primary,
  },
  aiFieldText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: colors.textSecondary,
    flex: 1,
  },
  aiFieldTextHasText: {
    fontFamily: 'Inter_600SemiBold',
    color: colors.textPrimary,
  },
  aiConfirm: {
    backgroundColor: colors.primaryLight,
    borderWidth: 1,
    borderColor: 'rgba(91,140,110,0.3)',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 7,
    alignSelf: 'flex-start',
  },
  aiConfirmDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  aiConfirmText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
    color: colors.primaryDark,
  },
  aiNudge: {
    backgroundColor: '#FBF0EC',
    borderWidth: 1,
    borderColor: 'rgba(232,133,106,0.4)',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 7,
    alignSelf: 'flex-start',
  },
  aiNudgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.coral,
  },
  aiNudgeText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: colors.coralDark,
  },

  // ── Footer + save button (gradient, opacity:0.4 disabled pattern) ──
  footer: {
    paddingHorizontal: spacing.screenPadding,
    backgroundColor: colors.background,
    paddingTop: 16,
  },
  saveBtnWrap: {
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 4,
  },
  saveBtn: {
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.2)',
  },
  saveBtnText: {
    fontFamily: 'Nunito_700Bold',
    fontSize: 16,
    color: colors.white,
  },

  // ── Fullscreen modal ──
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
  },
  modalClose: {
    position: 'absolute',
    top: 60,
    right: 20,
    zIndex: 10,
  },
  modalImage: {
    width: '100%',
    height: '80%',
  },
});
