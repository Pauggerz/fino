import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  TextInput,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '../services/supabase';
import { useNavigation } from '@react-navigation/native';
import { CATEGORY_EMOJI, CATEGORY_COLOR, CATEGORY_TILE_BG } from '@/constants/categoryMappings';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ParsedField {
  value: string | number | null;
  confidence: number;
  touched: boolean;
}

interface ParsedReceipt {
  merchant: ParsedField;
  amount: ParsedField;
  date: ParsedField;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ScreenshotScreen() {
  const navigation = useNavigation<any>();

  const [selectedSource, setSelectedSource] = useState<string>('upload');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parsedData, setParsedData] = useState<ParsedReceipt | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('food');
  const [descriptionText, setDescriptionText] = useState('');
  const [fixedFields, setFixedFields] = useState<string[]>([]);

  const hasLowConfidenceUnfixed = parsedData && (
    (parsedData.merchant.confidence < 0.85 && !fixedFields.includes('merchant')) ||
    (parsedData.amount.confidence < 0.85 && !fixedFields.includes('amount')) ||
    (parsedData.date.confidence < 0.85 && !fixedFields.includes('date'))
  );

  // ── Pick image from library ──
  const handleUpload = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert('Permission required', 'We need camera roll permissions to read screenshots.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      const uri = result.assets[0].uri;
      setSelectedImage(uri);
      processReceipt(uri);
    }
  };

  // ── Pick image from camera ──
  const handleCamera = async () => {
    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert('Permission required', 'We need camera permissions to take a photo.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      const uri = result.assets[0].uri;
      setSelectedImage(uri);
      processReceipt(uri);
    }
  };

  // ── Expand image (placeholder — full-screen viewer TBD) ──
  const handleExpandImage = () => {
    // Full-screen viewer will be wired in a future update
  };

  // ── Process with Supabase Edge Function ──
  const processReceipt = async (uri: string) => {
    setIsParsing(true);
    setParsedData(null);

    try {
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: 'base64',
      });

      const { data, error } = await supabase.functions.invoke('parse-receipt', {
        body: { imageBase64: base64, mimeType: 'image/jpeg' },
      });

      if (error) throw new Error(error.message);

      // Handle both the new nested structure { value, confidence } 
      // AND fallback to the old flat structure just in case
      setParsedData({
        merchant: { 
          value: data.merchant?.value ?? data.merchant ?? '', 
          confidence: data.merchant?.confidence ?? data.merchant_confidence ?? 0, 
          touched: false 
        },
        amount: { 
          value: data.amount?.value ?? data.amount ?? '', 
          confidence: data.amount?.confidence ?? data.amount_confidence ?? 0, 
          touched: false 
        },
        date: { 
          value: data.date?.value ?? data.date ?? '', 
          confidence: data.date?.confidence ?? data.date_confidence ?? 0, 
          touched: false 
        },
      });
    } catch (err: any) {
      Alert.alert('OCR Error', err.message || 'Failed to parse receipt.');
    } finally {
      setIsParsing(false);
    }
  };

  // ── Mark a field as manually fixed ──
  const markFixed = (field: string) => {
    if (!fixedFields.includes(field)) {
      setFixedFields((prev) => [...prev, field]);
    }
  };

  // ── Save to Supabase ──
  const handleConfirmSave = async () => {
    if (!parsedData) return;
    setIsParsing(true);

    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;

      const { error } = await supabase.from('transactions').insert({
        user_id: userId,
        merchant_name: parsedData.merchant.value,
        amount: Number(parsedData.amount.value),
        date: parsedData.date.value,
        type: 'expense',
        category: selectedCategory,
        signal_source: 'merchant',
        merchant_confidence: parsedData.merchant.confidence,
        amount_confidence: parsedData.amount.confidence,
        date_confidence: parsedData.date.confidence,
        receipt_url: selectedImage,
      });

      if (error) throw error;

      Alert.alert('Success', 'Transaction saved!');
      navigation.goBack();
    } catch (err: any) {
      Alert.alert('Save Error', err.message);
    } finally {
      setIsParsing(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F7F5F2' }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >

        {/* ── HEADER ── */}
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 20,
          paddingTop: 12,
          paddingBottom: 16,
        }}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              backgroundColor: '#FFFFFF',
              borderWidth: 1,
              borderColor: 'rgba(30,30,46,0.1)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontSize: 20, color: '#1E1E2E', lineHeight: 24 }}>‹</Text>
          </TouchableOpacity>
          <Text style={{
            flex: 1,
            textAlign: 'center',
            fontFamily: 'Nunito_800ExtraBold',
            fontSize: 18,
            color: '#1E1E2E',
            marginRight: 36,
          }}>
            Scan receipt
          </Text>
        </View>

        {/* ── SOURCE SELECTOR — 3 buttons ── */}
        <View style={{
          flexDirection: 'row',
          marginHorizontal: 20,
          marginBottom: 16,
          backgroundColor: '#FFFFFF',
          borderRadius: 14,
          padding: 4,
          borderWidth: 1,
          borderColor: 'rgba(30,30,46,0.08)',
        }}>
          {[
            { key: 'share',  label: 'Share sheet', icon: '⬆️' },
            { key: 'camera', label: 'Camera',      icon: '📷' },
            { key: 'upload', label: 'Upload',        icon: '🖼️' },
          ].map(({ key, label, icon }) => (
            <TouchableOpacity
              key={key}
              onPress={() => {
                setSelectedSource(key);
                if (key === 'camera') handleCamera();
                if (key === 'upload') handleUpload();
              }}
              style={{
                flex: 1,
                paddingVertical: 8,
                borderRadius: 10,
                alignItems: 'center',
                backgroundColor: selectedSource === key ? '#5B8C6E' : 'transparent',
              }}
            >
              <Text style={{ fontSize: 16, marginBottom: 2 }}>{icon}</Text>
              <Text style={{
                fontFamily: 'Inter_600SemiBold',
                fontSize: 10,
                color: selectedSource === key ? '#FFFFFF' : '#8A8A9A',
              }}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── RECEIPT PREVIEW ── */}
        <View style={{
          marginHorizontal: 20,
          marginBottom: 16,
          height: 180,
          borderRadius: 16,
          overflow: 'hidden',
          backgroundColor: '#E8E6E2',
          position: 'relative',
        }}>
          {selectedImage ? (
            <Image
              source={{ uri: selectedImage }}
              style={{ width: '100%', height: '100%' }}
              resizeMode="cover"
            />
          ) : (
            <TouchableOpacity
              onPress={handleUpload}
              style={{
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              <Text style={{ fontSize: 32 }}>🧾</Text>
              <Text style={{
                fontFamily: 'Inter_600SemiBold',
                fontSize: 13,
                color: '#8A8A9A',
              }}>
                Tap to select a receipt
              </Text>
              <Text style={{
                fontFamily: 'Inter_400Regular',
                fontSize: 11,
                color: '#B4B2A9',
              }}>
                GCash · Maya · BDO · BPI
              </Text>
            </TouchableOpacity>
          )}

          {selectedImage && (
            <TouchableOpacity
              onPress={handleExpandImage}
              style={{
                position: 'absolute',
                bottom: 10,
                right: 10,
                backgroundColor: 'rgba(0,0,0,0.45)',
                borderRadius: 8,
                paddingHorizontal: 10,
                paddingVertical: 5,
              }}
            >
              <Text style={{
                fontFamily: 'Inter_600SemiBold',
                fontSize: 11,
                color: '#FFFFFF',
              }}>
                ⤢ expand
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── PARSING OVERLAY ── */}
        {isParsing && (
          <View style={{
            marginHorizontal: 20,
            marginBottom: 16,
            backgroundColor: '#FFFFFF',
            borderRadius: 16,
            padding: 24,
            alignItems: 'center',
            gap: 10,
            borderWidth: 1,
            borderColor: 'rgba(30,30,46,0.08)',
          }}>
            <ActivityIndicator size="large" color="#5B8C6E" />
            <Text style={{
              fontFamily: 'Inter_700Bold',
              fontSize: 13,
              color: '#5B8C6E',
            }}>
              Parsing receipt...
            </Text>
            <Text style={{
              fontFamily: 'Inter_400Regular',
              fontSize: 11,
              color: '#8A8A9A',
            }}>
              Usually under 3 seconds
            </Text>
          </View>
        )}

        {/* ── PARSED FIELDS CARD ── */}
        {parsedData && !isParsing && (
          <View style={{
            marginHorizontal: 20,
            marginBottom: 16,
            backgroundColor: '#FFFFFF',
            borderRadius: 16,
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: 'rgba(30,30,46,0.08)',
          }}>

            {/* Card header + legend */}
            <View style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingHorizontal: 16,
              paddingVertical: 12,
              borderBottomWidth: 1,
              borderBottomColor: 'rgba(30,30,46,0.07)',
            }}>
              <Text style={{
                fontFamily: 'Inter_700Bold',
                fontSize: 10,
                color: '#8A8A9A',
                letterSpacing: 0.06,
                textTransform: 'uppercase',
              }}>
                Parsed fields
              </Text>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#5B8C6E' }} />
                  <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 10, color: '#8A8A9A' }}>
                    Confirmed
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#E8856A' }} />
                  <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 10, color: '#8A8A9A' }}>
                    Check
                  </Text>
                </View>
              </View>
            </View>

            {/* Merchant field */}
            <View style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingHorizontal: 16,
              paddingVertical: 12,
              borderBottomWidth: 1,
              borderBottomColor: 'rgba(30,30,46,0.07)',
            }}>
              <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: '#8A8A9A' }}>
                Merchant
              </Text>
              {parsedData.merchant.confidence >= 0.85 ? (
                <View style={{
                  backgroundColor: '#E8E6E2',
                  borderWidth: 1.5,
                  borderColor: '#A0BCA0',
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                }}>
                  <Text style={{ fontFamily: 'DMMonoMedium', fontSize: 13, color: '#1E1E2E' }}>
                    {String(parsedData.merchant.value ?? '—')}
                  </Text>
                </View>
              ) : (
                <TouchableOpacity
                  onPress={() => markFixed('merchant')}
                  style={{
                    backgroundColor: '#FBF0EC',
                    borderWidth: 1.5,
                    borderColor: '#C8A09A',
                    borderRadius: 8,
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <Text style={{ fontFamily: 'DMMonoMedium', fontSize: 13, color: '#B85A30' }}>
                    {String(parsedData.merchant.value ?? '—')}
                  </Text>
                  <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 10, color: '#B85A30' }}>
                    Fix ›
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Amount field */}
            <View style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingHorizontal: 16,
              paddingVertical: 12,
              borderBottomWidth: 1,
              borderBottomColor: 'rgba(30,30,46,0.07)',
            }}>
              <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: '#8A8A9A' }}>
                Amount
              </Text>
              {parsedData.amount.confidence >= 0.85 ? (
                <View style={{
                  backgroundColor: '#E8E6E2',
                  borderWidth: 1.5,
                  borderColor: '#A0BCA0',
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                }}>
                  <Text style={{ fontFamily: 'DMMonoMedium', fontSize: 13, fontWeight: '700', color: '#1E1E2E' }}>
                    ₱{Number(parsedData.amount.value).toLocaleString('en-PH', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </Text>
                </View>
              ) : (
                <TouchableOpacity
                  onPress={() => markFixed('amount')}
                  style={{
                    backgroundColor: '#FBF0EC',
                    borderWidth: 1.5,
                    borderColor: '#C8A09A',
                    borderRadius: 8,
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <Text style={{ fontFamily: 'DMMonoMedium', fontSize: 13, color: '#B85A30' }}>
                    {String(parsedData.amount.value ?? '—')}
                  </Text>
                  <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 10, color: '#B85A30' }}>
                    Fix ›
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Date field */}
            <View style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingHorizontal: 16,
              paddingVertical: 12,
            }}>
              <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: '#8A8A9A' }}>
                Date
              </Text>
              {parsedData.date.confidence >= 0.85 ? (
                <View style={{
                  backgroundColor: '#E8E6E2',
                  borderWidth: 1.5,
                  borderColor: '#A0BCA0',
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                }}>
                  <Text style={{ fontFamily: 'DMMonoMedium', fontSize: 13, color: '#1E1E2E' }}>
                    {String(parsedData.date.value ?? '—')}
                  </Text>
                </View>
              ) : (
                <TouchableOpacity
                  onPress={() => markFixed('date')}
                  style={{
                    backgroundColor: '#FBF0EC',
                    borderWidth: 1.5,
                    borderColor: '#C8A09A',
                    borderRadius: 8,
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <Text style={{ fontFamily: 'DMMonoMedium', fontSize: 13, color: '#B85A30' }}>
                    {String(parsedData.date.value ?? '—')}
                  </Text>
                  <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 10, color: '#B85A30' }}>
                    Fix ›
                  </Text>
                </TouchableOpacity>
              )}
            </View>

          </View>
        )}

        {/* ── CATEGORY SECTION ── */}
        {parsedData && !isParsing && (
          <View style={{ marginHorizontal: 20, marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <Text style={{
                fontFamily: 'Inter_700Bold',
                fontSize: 10,
                color: '#8A8A9A',
                letterSpacing: 0.06,
                textTransform: 'uppercase',
              }}>
                Category
              </Text>
              <Text style={{
                fontFamily: 'Inter_700Bold',
                fontSize: 10,
                color: '#4B2DA3',
              }}>
                ✦ from merchant
              </Text>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {(['food', 'transport', 'shopping', 'bills', 'health'] as const).map((key) => {
                  const isSelected = selectedCategory === key;
                  return (
                    <TouchableOpacity
                      key={key}
                      onPress={() => setSelectedCategory(key)}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                        paddingHorizontal: 14,
                        paddingVertical: 8,
                        borderRadius: 12,
                        borderWidth: isSelected ? 2 : 1,
                        borderColor: isSelected
                          ? CATEGORY_COLOR[key]
                          : 'rgba(30,30,46,0.12)',
                        backgroundColor: isSelected
                          ? CATEGORY_TILE_BG[key]
                          : '#FFFFFF',
                      }}
                    >
                      <Text style={{ fontSize: 15 }}>{CATEGORY_EMOJI[key]}</Text>
                      <Text style={{
                        fontFamily: 'Inter_600SemiBold',
                        fontSize: 13,
                        color: isSelected ? CATEGORY_COLOR[key] : '#8A8A9A',
                      }}>
                        {key.charAt(0).toUpperCase() + key.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              marginVertical: 14,
            }}>
              <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(30,30,46,0.1)' }} />
              <Text style={{
                fontFamily: 'Inter_700Bold',
                fontSize: 9,
                color: '#8A8A9A',
                letterSpacing: 0.05,
                textTransform: 'uppercase',
              }}>
                or describe
              </Text>
              <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(30,30,46,0.1)' }} />
            </View>

            <View style={{
              backgroundColor: '#F0ECFD',
              borderWidth: 1.5,
              borderColor: '#C9B8F5',
              borderRadius: 14,
              paddingHorizontal: 14,
              paddingVertical: 12,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
            }}>
              <Text style={{ fontSize: 14 }}>✦</Text>
              <TextInput
                style={{
                  flex: 1,
                  fontFamily: 'Inter_400Regular',
                  fontSize: 13,
                  color: '#1E1E2E',
                }}
                placeholder='e.g. "hamburger", "load", "tanghalian"'
                placeholderTextColor="#B4B2A9"
                value={descriptionText}
                onChangeText={setDescriptionText}
              />
            </View>
          </View>
        )}

        {/* ── CONFIRM & SAVE BUTTON ── */}
        {parsedData && !isParsing && (
          <View style={{ marginHorizontal: 20 }}>
            <TouchableOpacity
              onPress={handleConfirmSave}
              disabled={!!hasLowConfidenceUnfixed}
              style={{
                backgroundColor: hasLowConfidenceUnfixed ? '#B4D4C4' : '#5B8C6E',
                borderRadius: 16,
                paddingVertical: 18,
                alignItems: 'center',
              }}
            >
              <Text style={{
                fontFamily: 'Nunito_700Bold',
                fontSize: 16,
                color: '#FFFFFF',
              }}>
                Confirm & save
              </Text>
            </TouchableOpacity>
            {hasLowConfidenceUnfixed && (
              <Text style={{
                fontFamily: 'Inter_400Regular',
                fontSize: 11,
                color: '#E8856A',
                textAlign: 'center',
                marginTop: 8,
              }}>
                Fix the highlighted fields first
              </Text>
            )}
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}