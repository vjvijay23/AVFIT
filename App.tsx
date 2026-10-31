import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StatusBar, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import RootNavigator from './src/navigation/RootNavigator';
import { AuthService } from './src/services/auth';
import { Colors } from './src/theme/colors';

export default function App() {
  const [initialRoute, setInitialRoute] = useState<'AuthWelcome' | 'Main' | null>(null);

  useEffect(() => {
    AuthService.restoreSession()
      .then((signedIn) => setInitialRoute(signedIn ? 'Main' : 'AuthWelcome'))
      .catch(() => setInitialRoute('AuthWelcome'));
  }, []);

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <StatusBar barStyle="light-content" />
        {initialRoute ? <RootNavigator initialRouteName={initialRoute} /> : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background }}>
            <ActivityIndicator color={Colors.primary} />
          </View>
        )}
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
