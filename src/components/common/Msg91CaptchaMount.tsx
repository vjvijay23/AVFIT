import React, { useEffect } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import * as Msg91Otp from '../../services/msg91Otp';

export const MSG91_CAPTCHA_ELEMENT_ID = 'avfit-msg91-captcha';

export default function Msg91CaptchaMount() {
  const isFocused = useIsFocused();

  useEffect(() => {
    if (Platform.OS === 'web' && isFocused) {
      void Msg91Otp.prepareWidget().catch(() => undefined);
    }
  }, [isFocused]);

  if (Platform.OS !== 'web' || !isFocused) return null;

  return <View nativeID={MSG91_CAPTCHA_ELEMENT_ID} style={styles.mount} accessibilityLabel="SMS CAPTCHA verification" />;
}

const styles = StyleSheet.create({
  mount: {
    minHeight: 78,
    marginTop: 8,
    marginBottom: 10,
    alignSelf: 'flex-start',
  },
});
