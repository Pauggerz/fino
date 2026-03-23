import React, { useCallback } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';

// Pulling in the exact fonts you have installed in package.json
import { Inter_400Regular, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { DMMono_500Medium } from '@expo-google-fonts/dm-mono';
import { Nunito_700Bold, Nunito_800ExtraBold } from '@expo-google-fonts/nunito';

import RootNavigator from './src/navigation/RootNavigator';
import Toast from './src/components/Toast';

// Keep the splash screen visible while we fetch resources (fonts)
SplashScreen.preventAutoHideAsync();

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_600SemiBold,
    Inter_700Bold,
    DMMono_500Medium,
    Nunito_700Bold,
    Nunito_800ExtraBold,
  });

  // Hides the splash screen only after fonts are fully loaded to prevent UI flickering
  const onLayoutRootView = useCallback(async () => {
    if (fontsLoaded || fontError) {
      await SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null; // Render nothing until fonts are ready
  }

  return (
    <SafeAreaProvider onLayout={onLayoutRootView}>
      <NavigationContainer>
        {/* The entire app navigation tree lives here */}
        <RootNavigator />
        
        {/* Global Toast Placeholder. 
          Because it sits outside the navigator, it will smoothly float over 
          modals, tabs, and regular screens without getting cut off. 
        */}
        <Toast 
          visible={false} 
          message="Expense added!" 
          type="success" 
          onHide={() => {}} 
        />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}