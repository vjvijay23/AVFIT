import { getMsg91AccessToken } from './msg91AccessToken';

declare const require: (moduleName: string) => unknown;
const { OTPWidget } = require('@msg91comm/sendotp-react-native') as {
  OTPWidget: {
    initializeWidget(widgetId: string, tokenAuth: string): void;
    sendOTP(data: { identifier: string }): Promise<unknown>;
    verifyOTP(data: { reqId: string; otp: string }): Promise<unknown>;
    retryOTP(data: { reqId: string; retryChannel: number }): Promise<unknown>;
  };
};

const widgetId = process.env.EXPO_PUBLIC_MSG91_MOBILE_WIDGET_ID || process.env.EXPO_PUBLIC_MSG91_WIDGET_ID || '';
const tokenAuth = process.env.EXPO_PUBLIC_MSG91_MOBILE_TOKEN_AUTH || process.env.EXPO_PUBLIC_MSG91_TOKEN_AUTH || '';
const requestIds = new Map<string, string>();
let initialized = false;
const MSG91_OPERATION_TIMEOUT_MS = 20000;

export async function prepareWidget(): Promise<void> {
  configureWidget();
}

async function withOperationTimeout<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    operation,
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error('MSG91 did not respond. Check your connection and widget configuration, then try again.')), MSG91_OPERATION_TIMEOUT_MS);
    }),
  ]).finally(() => { if (timer) clearTimeout(timer); });
}

function configureWidget() {
  if (!widgetId || !tokenAuth) {
    throw new Error('MSG91 mobile OTP is not configured in this build. Set EXPO_PUBLIC_MSG91_WIDGET_ID and EXPO_PUBLIC_MSG91_TOKEN_AUTH, then rebuild the app.');
  }
  if (!initialized) {
    OTPWidget.initializeWidget(widgetId, tokenAuth);
    initialized = true;
  }
}

function phoneIdentifier(phone: string) {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) throw new Error('Enter a valid phone number with its country code.');
  return digits;
}

export async function sendOtp(phone: string): Promise<void> {
  configureWidget();
  const identifier = phoneIdentifier(phone);
  const result = await withOperationTimeout(OTPWidget.sendOTP({ identifier })) as { type?: string; message?: string; invisibleVerified?: boolean };
  if (result?.type !== 'success' || !result.message || result.invisibleVerified) {
    throw new Error(result?.invisibleVerified
      ? 'MSG91 invisible OTP is enabled. Turn it off in the widget to use AVFIT’s code-entry screen.'
      : 'MSG91 could not send the code. Check the widget channels, mobile integration, token, and MSG91 account status.');
  }
  requestIds.set(identifier, result.message);
}

export async function verifyOtp(phone: string, otp: string): Promise<string> {
  configureWidget();
  const identifier = phoneIdentifier(phone);
  const reqId = requestIds.get(identifier);
  if (!reqId) throw new Error('This verification request expired. Request a new code and try again.');

  const result = await withOperationTimeout(OTPWidget.verifyOTP({ reqId, otp })) as { type?: string; message?: string; 'access-token'?: string };
  const accessToken = getMsg91AccessToken(result);
  requestIds.delete(identifier);
  return accessToken;
}

export async function resendOtp(phone: string): Promise<void> {
  configureWidget();
  const identifier = phoneIdentifier(phone);
  const reqId = requestIds.get(identifier);
  if (!reqId) throw new Error('This verification request expired. Go back and request a new code.');

  const result = await withOperationTimeout(OTPWidget.retryOTP({ reqId, retryChannel: 11 })) as { type?: string };
  if (result?.type !== 'success') throw new Error('MSG91 could not resend the code. Wait a moment and try again.');
}
