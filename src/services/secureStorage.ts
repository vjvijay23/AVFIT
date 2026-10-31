import * as Keychain from 'react-native-keychain';

/** Small key/value facade backed by Android Keystore / iOS Keychain. */
export const SecureStorage = {
  async getItemAsync(key: string): Promise<string | null> {
    const item = await Keychain.getGenericPassword({ service: key });
    return item ? item.password : null;
  },
  async setItemAsync(key: string, value: string): Promise<void> {
    await Keychain.setGenericPassword(key, value, {
      service: key,
      accessible: Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    });
  },
  async deleteItemAsync(key: string): Promise<void> {
    await Keychain.resetGenericPassword({ service: key });
  },
  async setBiometricSecret(key: string, username: string, password: string): Promise<void> {
    const result = await Keychain.setGenericPassword(username, password, {
      service: key,
      accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_CURRENT_SET,
      accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      authenticationType: Keychain.AUTHENTICATION_TYPE.BIOMETRICS,
      authenticationPrompt: { title: 'Enable AVFIT biometric sign-in' },
    });
    if (!result) throw new Error('Could not securely save biometric sign-in on this device.');
  },
  async getBiometricSecret(key: string): Promise<{ username: string; password: string } | null> {
    const item = await Keychain.getGenericPassword({
      service: key,
      accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_CURRENT_SET,
      authenticationType: Keychain.AUTHENTICATION_TYPE.BIOMETRICS,
      authenticationPrompt: { title: 'Sign in to AVFIT' },
    });
    return item ? { username: item.username, password: item.password } : null;
  },
};
