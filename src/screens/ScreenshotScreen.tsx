import React, { useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  Image, 
  ActivityIndicator, 
  TextInput,
  ScrollView,
  Alert
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { supabase } from '../services/supabase'; // Adjust path as needed
import { useNavigation } from '@react-navigation/native';

// Define the shape of our parsed data
interface ParsedField {
  value: string | number;
  confidence: number;
  touched: boolean;
}

interface ParsedReceipt {
  merchant: ParsedField;
  amount: ParsedField;
  date: ParsedField;
}

export default function ScreenshotScreen() {
  const navigation = useNavigation();
  
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [receiptData, setReceiptData] = useState<ParsedReceipt | null>(null);

  // 1. Pick Image & Send to Edge Function
  const handleSelectImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert("Permission required", "We need camera roll permissions to read screenshots.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      const uri = result.assets[0].uri;
      setImageUri(uri);
      processReceipt(uri);
    }
  };

  // 2. Process with Supabase Edge Function
  const processReceipt = async (uri: string) => {
    setLoading(true);
    setReceiptData(null); // Reset previous data

    try {
      // Read image as Base64
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: 'base64',
      });

      // Invoke Edge Function
      const { data, error } = await supabase.functions.invoke('parse-receipt', {
        body: { imageBase64: base64, mimeType: 'image/jpeg' },
      });

      if (error) throw new Error(error.message);

      // Map the response to our state (assuming your Edge Function returns this structure)
      // If the function returns slightly different keys, adjust them here.
      setReceiptData({
        merchant: { value: data.merchant || '', confidence: data.merchant_confidence || 0, touched: false },
        amount: { value: data.amount || '', confidence: data.amount_confidence || 0, touched: false },
        date: { value: data.date || '', confidence: data.date_confidence || 0, touched: false },
      });

    } catch (err: any) {
      Alert.alert("OCR Error", err.message || "Failed to parse receipt.");
    } finally {
      setLoading(false);
    }
  };

  // 3. Handle Field Updates (Marks low-confidence fields as "touched")
  const updateField = (field: keyof ParsedReceipt, newValue: string) => {
    if (!receiptData) return;
    setReceiptData({
      ...receiptData,
      [field]: { ...receiptData[field], value: newValue, touched: true }
    });
  };

  // 4. Validation: Check if all low confidence fields have been touched
  const isConfirmDisabled = () => {
    if (!receiptData) return true;
    
    // Check all fields. If confidence < 0.85 AND it hasn't been touched, disable button.
    const fields = Object.values(receiptData);
    const hasUntouchedLowConfidence = fields.some(
      (f) => f.confidence < 0.85 && !f.touched
    );

    return hasUntouchedLowConfidence;
  };

  // 5. Save to Database
  const handleConfirmAndSave = async () => {
    if (!receiptData) return;
    setLoading(true);

    try {
      // Note: If you have an auth flow, grab the user_id here.
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;

      // Insert into transactions table
      const { error } = await supabase.from('transactions').insert({
        user_id: userId, // Ensure your schema allows this or mock it for now
        merchant_name: receiptData.merchant.value,
        amount: Number(receiptData.amount.value),
        date: receiptData.date.value,
        type: 'expense',
        signal_source: 'merchant', // Or however you categorize screenshot imports
        merchant_confidence: receiptData.merchant.confidence,
        amount_confidence: receiptData.amount.confidence,
        date_confidence: receiptData.date.confidence,
        receipt_url: imageUri, // *Optional: upload image to Supabase Storage first if you want a remote URL*
      });

      if (error) throw error;

      Alert.alert("Success", "Transaction saved!");
      navigation.goBack(); // Go back to Feed/Home

    } catch (err: any) {
      Alert.alert("Save Error", err.message);
    } finally {
      setLoading(false);
    }
  };

  // --- UI Helper for Fields ---
  const renderField = (label: string, fieldKey: keyof ParsedReceipt) => {
    if (!receiptData) return null;
    const fieldData = receiptData[fieldKey];
    const isHighConfidence = fieldData.confidence >= 0.85;

    return (
      <View style={styles.fieldContainer}>
        <Text style={styles.label}>{label}</Text>
        <View style={[
          styles.inputWrapper, 
          { borderColor: isHighConfidence ? '#A0BCA0' : '#C8A09A' }
        ]}>
          <TextInput
            style={[styles.input, isHighConfidence && styles.readOnlyText]}
            value={String(fieldData.value)}
            onChangeText={(text) => updateField(fieldKey, text)}
            editable={!isHighConfidence} // Read-only if high confidence
            onFocus={() => {
              // Automatically mark as touched if they tap into it to fix it
              if (!isHighConfidence && !fieldData.touched) {
                updateField(fieldKey, String(fieldData.value));
              }
            }}
          />
          {!isHighConfidence && !fieldData.touched && (
            <Text style={styles.fixPrompt}>Fix ›</Text>
          )}
        </View>
      </View>
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Scan Receipt</Text>

      <TouchableOpacity style={styles.uploadButton} onPress={handleSelectImage}>
        <Text style={styles.uploadText}>
          {imageUri ? "Reselect Image" : "Upload GCash Screenshot"}
        </Text>
      </TouchableOpacity>

      {imageUri && (
        <Image source={{ uri: imageUri }} style={styles.preview} resizeMode="contain" />
      )}

      {loading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4A90E2" />
          <Text style={styles.loadingText}>Processing receipt...</Text>
        </View>
      )}

      {receiptData && !loading && (
        <View style={styles.formContainer}>
          {renderField('Merchant', 'merchant')}
          {renderField('Amount', 'amount')}
          {renderField('Date', 'date')}

          <TouchableOpacity 
            style={[styles.confirmButton, isConfirmDisabled() && styles.disabledButton]} 
            onPress={handleConfirmAndSave}
            disabled={isConfirmDisabled()}
          >
            <Text style={styles.confirmText}>Confirm & Save</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, flexGrow: 1, backgroundColor: '#FAFAFA' },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 20, color: '#333' },
  uploadButton: { backgroundColor: '#E0E0E0', padding: 15, borderRadius: 10, alignItems: 'center', marginBottom: 20 },
  uploadText: { fontSize: 16, fontWeight: '600', color: '#555' },
  preview: { width: '100%', height: 200, borderRadius: 10, marginBottom: 20 },
  loadingContainer: { alignItems: 'center', marginVertical: 20 },
  loadingText: { marginTop: 10, color: '#666' },
  formContainer: { marginTop: 10 },
  fieldContainer: { marginBottom: 15 },
  label: { fontSize: 14, color: '#666', marginBottom: 5 },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderRadius: 8,
    paddingHorizontal: 12,
    backgroundColor: '#FFF',
  },
  input: { flex: 1, paddingVertical: 12, fontSize: 16, color: '#333' },
  readOnlyText: { color: '#777' }, // Slightly faded text for read-only
  fixPrompt: { color: '#C8A09A', fontWeight: 'bold', fontSize: 14, marginLeft: 10 },
  confirmButton: { backgroundColor: '#4A90E2', padding: 16, borderRadius: 10, alignItems: 'center', marginTop: 10 },
  disabledButton: { backgroundColor: '#A5C6EA' },
  confirmText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' }
});