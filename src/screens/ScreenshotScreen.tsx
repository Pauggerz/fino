import React, { useState, useRef } from 'react';
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
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, radius, spacing } from '../constants/theme';

const CATEGORIES = [
  {
    id: 'food',
    label: 'Food',
    icon: 'fast-food',
    bg: colors.pillFoodBg,
    text: colors.pillFoodText,
    border: colors.pillFoodBorder,
  },
  {
    id: 'transport',
    label: 'Transport',
    icon: 'car',
    bg: colors.pillTransportBg,
    text: colors.pillTransportText,
    border: colors.pillTransportBorder,
  },
  {
    id: 'shopping',
    label: 'Shopping',
    icon: 'bag-handle',
    bg: colors.pillShoppingBg,
    text: colors.pillShoppingText,
    border: colors.pillShoppingBorder,
  },
];

export default function ScreenshotScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  // State
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  // Parsed Data State
  const [hasParsedData, setHasParsedData] = useState(false);
  const [merchant] = useState('Jollibee Drive Thru');
  const [amount] = useState('185.00');

  // Auto-detect the current date and time as a fallback for the AI
  const [date, setDate] = useState(
    new Date().toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  );

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [isEditingDate, setIsEditingDate] = useState(false);

  // Animation
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const handleImageSelection = (uri: string) => {
    setImageUri(uri);
    setIsParsing(true);
    setHasParsedData(false);
    fadeAnim.setValue(0);

    // Simulate the 2200ms OCR / AI processing delay
    setTimeout(() => {
      setIsParsing(false);
      setHasParsedData(true);

      // Fade in the parsed card
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();

      // Auto-categorize based on simulateAIMap logic
      setSelectedCategory('food');
    }, 2200);
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

    if (!result.canceled && result.assets && result.assets.length > 0) {
      handleImageSelection(result.assets[0].uri);
    }
  };

  // The form is ready to save as soon as we have data and a category!
  const isFormValid = hasParsedData && selectedCategory !== null;

  const handleConfirm = () => {
    if (!isFormValid) return;
    // TODO: Trigger global toast and update Home balance
    navigation.goBack();
  };

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, 16) }]}>
      {/* --- Header --- */}
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
      >
        {/* --- Dynamic Image Source Area --- */}
        {!imageUri ? (
          <View style={styles.uploadPromptContainer}>
            <LinearGradient
              colors={['#e0ddd8', '#cccac4']}
              style={styles.uploadPromptGradient}
            />
            <View style={styles.uploadPromptContent}>
              <View style={styles.iconCircle}>
                <Ionicons name="receipt" size={28} color={colors.primary} />
              </View>
              <Text style={styles.uploadPromptTitle}>Upload Receipt</Text>
              <Text style={styles.uploadPromptSub}>
                Snap a photo or choose from your gallery to auto-fill details.
              </Text>

              <View style={styles.uploadButtonsRow}>
                <TouchableOpacity
                  style={styles.uploadPromptBtn}
                  onPress={() => pickImage('camera')}
                  activeOpacity={0.8}
                >
                  <Ionicons name="camera" size={20} color={colors.white} />
                  <Text style={styles.uploadPromptBtnText}>Camera</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.uploadPromptBtn}
                  onPress={() => pickImage('upload')}
                  activeOpacity={0.8}
                >
                  <Ionicons name="image" size={20} color={colors.white} />
                  <Text style={styles.uploadPromptBtnText}>Gallery</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.previewContainer}
            activeOpacity={0.9}
            onPress={() => setIsExpanded(true)}
          >
            <Image source={{ uri: imageUri }} style={styles.previewImage} />
            <View style={styles.expandOverlay}>
              <Ionicons name="expand" size={16} color={colors.white} />
              <Text style={styles.expandText}>expand</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* --- Parsing Overlay --- */}
        {isParsing && (
          <View style={styles.parsingOverlay}>
            <ActivityIndicator
              size="small"
              color={colors.primary}
              style={{ marginBottom: 12 }}
            />
            <Text style={styles.parsingTitle}>Extracting details...</Text>
            <Text style={styles.parsingSubtitle}>Usually under 3 seconds</Text>
          </View>
        )}

        {/* --- Parsed Card (Animated) --- */}
        {hasParsedData && (
          <Animated.View style={[styles.parsedCard, { opacity: fadeAnim }]}>
            {/* Legend */}
            <View style={styles.legendRow}>
              <View style={styles.legendItem}>
                <View style={[styles.dot, { backgroundColor: '#A0BCA0' }]} />
                <Text style={styles.legendText}>AI Confirmed</Text>
              </View>
            </View>

            {/* High Confidence Field: Merchant */}
            <Text style={styles.fieldLabel}>Merchant</Text>
            <View style={[styles.fieldBox, styles.confHiField]}>
              <Text style={styles.confHiText}>{merchant}</Text>
            </View>

            {/* High Confidence Field: Amount */}
            <Text style={styles.fieldLabel}>Amount</Text>
            <View style={[styles.fieldBox, styles.confHiField]}>
              <Text
                style={[styles.confHiText, { fontSize: 20, fontWeight: '700' }]}
              >
                ₱{amount}
              </Text>
            </View>

            {/* Auto-detected Date Field */}
            <Text style={styles.fieldLabel}>Date & Time</Text>
            <View style={[styles.fieldBox, styles.confHiField]}>
              {isEditingDate ? (
                <TextInput
                  style={styles.inlineInput}
                  value={date}
                  onChangeText={setDate}
                  onBlur={() => setIsEditingDate(false)}
                  onSubmitEditing={() => setIsEditingDate(false)}
                  autoFocus
                />
              ) : (
                <Text style={styles.confHiText}>{date}</Text>
              )}

              {!isEditingDate && (
                <TouchableOpacity
                  onPress={() => setIsEditingDate(true)}
                  style={styles.fixButton}
                >
                  <Text style={styles.editButtonText}>Edit ›</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Category Selection */}
            <Text style={[styles.fieldLabel, { marginTop: 8 }]}>Category</Text>
            <View style={styles.categoriesGrid}>
              {CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat.id}
                  style={[
                    styles.categoryPill,
                    { backgroundColor: cat.bg },
                    selectedCategory === cat.id && {
                      borderColor: cat.border,
                      borderWidth: 2,
                      backgroundColor: colors.white,
                    },
                  ]}
                  onPress={() => setSelectedCategory(cat.id)}
                >
                  <Ionicons name={cat.icon as any} size={16} color={cat.text} />
                  <Text style={[styles.categoryText, { color: cat.text }]}>
                    {cat.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </Animated.View>
        )}
      </ScrollView>

      {/* --- Footer Action --- */}
      <View
        style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 24) }]}
      >
        <TouchableOpacity
          style={[styles.saveButton, !isFormValid && styles.saveButtonDisabled]}
          onPress={handleConfirm}
          disabled={!isFormValid}
          activeOpacity={0.8}
        >
          <Text style={styles.saveButtonText}>Confirm & Save</Text>
        </TouchableOpacity>
      </View>

      {/* --- Fullscreen Image Modal --- */}
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background, // #F7F5F2
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.screenPadding,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
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

  /* --- NEW UPLOAD PROMPT STYLES --- */
  uploadPromptContainer: {
    borderRadius: radius.card,
    overflow: 'hidden',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  uploadPromptGradient: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.5,
  },
  uploadPromptContent: {
    padding: 32,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  uploadPromptTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 8,
  },
  uploadPromptSub: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 18,
  },
  uploadButtonsRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  uploadPromptBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: radius.pill20,
    gap: 8,
  },
  uploadPromptBtnText: {
    color: colors.white,
    fontWeight: '600',
    fontSize: 14,
  },

  /* --- EXISTING STYLES --- */
  previewContainer: {
    height: 140,
    borderRadius: radius.card,
    overflow: 'hidden',
    marginBottom: 24,
    backgroundColor: '#cccac4',
  },
  previewImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  expandOverlay: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    gap: 4,
  },
  expandText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '600',
  },
  parsingOverlay: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  parsingTitle: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 4,
  },
  parsingSubtitle: {
    color: colors.textSecondary,
    fontSize: 11,
  },
  parsedCard: {
    backgroundColor: colors.white,
    borderRadius: radius.card,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  legendRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 20,
    justifyContent: 'flex-end',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 6,
  },
  fieldBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  confHiField: {
    backgroundColor: '#E8E6E2',
    borderColor: '#A0BCA0',
  },
  confHiText: {
    fontSize: 15,
    color: colors.textPrimary,
    fontFamily: 'DMMono_500Medium',
  },
  inlineInput: {
    flex: 1,
    fontSize: 15,
    color: colors.textPrimary,
    fontFamily: 'DMMono_500Medium',
    padding: 0,
  },
  fixButton: {
    paddingLeft: 12,
  },
  editButtonText: {
    color: '#8E8E93',
    fontWeight: '700',
    fontSize: 14,
  },
  categoriesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  categoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.pill20,
    gap: 6,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  categoryText: {
    fontSize: 14,
    fontWeight: '600',
  },
  footer: {
    paddingHorizontal: spacing.screenPadding,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
    paddingTop: 16,
  },
  saveButton: {
    backgroundColor: colors.primary,
    paddingVertical: 18,
    borderRadius: radius.button,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    backgroundColor: '#D1D1D6',
  },
  saveButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
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
