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

      // Fade in the parsed data
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
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

  const isFormValid = hasParsedData && selectedCategory !== null;

  const handleConfirm = () => {
    if (!isFormValid) return;
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
        ) : (
          <TouchableOpacity
            style={styles.previewContainer}
            activeOpacity={0.9}
            onPress={() => setIsExpanded(true)}
          >
            <Image source={{ uri: imageUri }} style={styles.previewImage} />
            <View style={styles.expandOverlay}>
              <Ionicons name="expand" size={14} color={colors.white} />
              <Text style={styles.expandText}>View</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* --- Parsing Overlay --- */}
        {isParsing && (
          <View style={styles.parsingOverlay}>
            <ActivityIndicator
              size="large"
              color={colors.primary}
              style={{ marginBottom: 16 }}
            />
            <Text style={styles.parsingTitle}>Extracting details...</Text>
            <Text style={styles.parsingSubtitle}>Usually under 3 seconds</Text>
          </View>
        )}

        {/* --- Parsed Data (Animated & Box-less) --- */}
        {hasParsedData && (
          <Animated.View style={{ opacity: fadeAnim, marginTop: 16 }}>
            <View style={styles.aiBadgeRow}>
              <Ionicons name="sparkles" size={14} color="#A0BCA0" />
              <Text style={styles.aiBadgeText}>AI Extracted Details</Text>
            </View>

            {/* Seamless Form Rows */}
            <View style={styles.formSection}>
              <View style={styles.formRow}>
                <Text style={styles.rowLabel}>Merchant</Text>
                <Text style={styles.rowValue}>{merchant}</Text>
              </View>

              <View style={styles.formRow}>
                <Text style={styles.rowLabel}>Amount</Text>
                <Text style={[styles.rowValue, styles.amountValue]}>
                  ₱{amount}
                </Text>
              </View>

              <View style={[styles.formRow, { borderBottomWidth: 0 }]}>
                <Text style={styles.rowLabel}>Date & Time</Text>
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
                  <TouchableOpacity
                    onPress={() => setIsEditingDate(true)}
                    style={styles.dateEditBtn}
                  >
                    <Text style={styles.rowValue}>{date}</Text>
                    <Ionicons
                      name="pencil"
                      size={14}
                      color={colors.textSecondary}
                      style={{ marginLeft: 6 }}
                    />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Category Selection */}
            <Text style={styles.categoryHeader}>Select Category</Text>
            <View style={styles.categoriesGrid}>
              {CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat.id}
                  style={[
                    styles.categoryPill,
                    {
                      backgroundColor:
                        selectedCategory === cat.id ? cat.bg : colors.white,
                    },
                    selectedCategory === cat.id && {
                      borderColor: cat.border,
                      borderWidth: 1,
                    },
                  ]}
                  onPress={() => setSelectedCategory(cat.id)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={cat.icon as any}
                    size={18}
                    color={
                      selectedCategory === cat.id
                        ? cat.text
                        : colors.textSecondary
                    }
                  />
                  <Text
                    style={[
                      styles.categoryText,
                      {
                        color:
                          selectedCategory === cat.id
                            ? cat.text
                            : colors.textSecondary,
                      },
                    ]}
                  >
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
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.screenPadding,
    paddingBottom: 24,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'Nunito_700Bold',
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

  /* --- CLEAN UPLOAD EMPTY STATE --- */
  emptyStateContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(45, 106, 79, 0.08)', // Faint primary color
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontFamily: 'Nunito_700Bold',
    color: colors.textPrimary,
    marginBottom: 8,
  },
  emptyStateSub: {
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
    color: colors.white,
    fontWeight: '600',
    fontSize: 15,
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
    color: colors.primary,
    fontWeight: '600',
    fontSize: 15,
  },

  /* --- IMAGE PREVIEW --- */
  previewContainer: {
    height: 180,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#EAE8E3',
    marginBottom: 16,
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
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  expandText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '600',
  },

  /* --- PARSING STATE --- */
  parsingOverlay: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  parsingTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 6,
  },
  parsingSubtitle: {
    color: colors.textSecondary,
    fontSize: 13,
  },

  /* --- SLEEK FORM SECTION --- */
  aiBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    gap: 6,
  },
  aiBadgeText: {
    fontSize: 13,
    color: '#8CA68C',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  formSection: {
    backgroundColor: colors.white,
    borderRadius: 20,
    paddingHorizontal: 20,
    marginBottom: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 1,
  },
  formRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#F0EFEA',
  },
  rowLabel: {
    fontSize: 15,
    color: colors.textSecondary,
  },
  rowValue: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
    fontFamily: 'Inter_600SemiBold',
    textAlign: 'right',
    maxWidth: '65%',
  },
  amountValue: {
    fontSize: 18,
    fontFamily: 'DMMono_500Medium',
    color: colors.primary,
  },
  dateEditBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  inlineInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: colors.primary,
    textAlign: 'right',
    padding: 0,
  },

  /* --- CATEGORIES --- */
  categoryHeader: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 16,
    marginLeft: 4,
  },
  categoriesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  categoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  categoryText: {
    fontSize: 14,
    fontWeight: '600',
  },

  /* --- FOOTER & MODAL --- */
  footer: {
    paddingHorizontal: spacing.screenPadding,
    backgroundColor: colors.background,
    paddingTop: 16,
  },
  saveButton: {
    backgroundColor: colors.primary,
    paddingVertical: 18,
    borderRadius: 16,
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
