type WidgetResult = { type?: string; message?: string; 'access-token'?: string };
type WidgetCallback = (result: WidgetResult) => void;

interface Msg91Window extends Window {
  initSendOTP?: (configuration: Record<string, unknown>) => void;
  sendOtp?: (identifier: string, success: WidgetCallback, failure: (error: unknown) => void) => void;
  retryOtp?: (channel: string | null, success: WidgetCallback, failure: (error: unknown) => void, reqId: string) => void;
  verifyOtp?: (otp: string, success: WidgetCallback, failure: (error: unknown) => void, reqId: string) => void;
}

const widgetId = process.env.EXPO_PUBLIC_MSG91_WIDGET_ID || '';
const tokenAuth = process.env.EXPO_PUBLIC_MSG91_TOKEN_AUTH || '';
const requestIds = new Map<string, string>();
let initializedWindow: Msg91Window | null = null;
let initialization: Promise<Msg91Window> | null = null;

async function getWidget(): Promise<Msg91Window> {
  if (!widgetId || !tokenAuth) {
    throw new Error('MSG91 OTP is not configured in this web build. Set the MSG91 widget ID and token, then rebuild the app.');
  }
  if (initializedWindow) return initializedWindow;
  if (initialization) return initialization;

  initialization = new Promise<Msg91Window>((resolve, reject) => {
    const widgetWindow = window as Msg91Window;
    const initialize = () => {
      if (typeof widgetWindow.initSendOTP !== 'function') {
        reject(new Error('MSG91 widget script loaded without its initialization API.'));
        return;
      }
      widgetWindow.initSendOTP({
        widgetId,
        tokenAuth,
        exposeMethods: true,
        success: () => undefined,
        failure: () => undefined,
      });
      initializedWindow = widgetWindow;
      resolve(widgetWindow);
    };

    const existingScript = document.querySelector<HTMLScriptElement>('script[data-avfit-msg91]');
    if (existingScript) {
      if (typeof widgetWindow.initSendOTP === 'function') initialize();
      else existingScript.addEventListener('load', initialize, { once: true });
      return;
    }

    const urls = [
      'https://verify.msg91.com/otp-provider.js',
      'https://verify.phone91.com/otp-provider.js',
    ];
    let index = 0;
    const attempt = () => {
      const script = document.createElement('script');
      script.src = urls[index];
      script.async = true;
      script.dataset.avfitMsg91 = 'true';
      script.onload = initialize;
      script.onerror = () => {
        script.remove();
        index += 1;
        if (index < urls.length) attempt();
        else reject(new Error('Could not load MSG91 verification. Check your network and try again.'));
      };
      document.head.appendChild(script);
    };
    attempt();
  }).catch((error) => {
    initialization = null;
    throw error;
  });

  return initialization;
}

function phoneIdentifier(phone: string): string {
  const identifier = phone.replace(/\D/g, '');
  if (identifier.length < 8 || identifier.length > 15) throw new Error('Enter a valid phone number with its country code.');
  return identifier;
}

export async function sendOtp(phone: string): Promise<void> {
  const widget = await getWidget();
  const identifier = phoneIdentifier(phone);
  if (!widget.sendOtp) throw new Error('MSG91 OTP widget is missing the send method.');
  const result = await new Promise<WidgetResult>((resolve, reject) => widget.sendOtp!(identifier, resolve, reject));
  if (result?.type !== 'success' || !result.message) {
    throw new Error('MSG91 could not send the code. Check the widget channels, token, and account status.');
  }
  requestIds.set(identifier, result.message);
}

export async function verifyOtp(phone: string, otp: string): Promise<string> {
  const widget = await getWidget();
  const identifier = phoneIdentifier(phone);
  const reqId = requestIds.get(identifier);
  if (!reqId) throw new Error('This verification request expired. Request a new code and try again.');
  if (!widget.verifyOtp) throw new Error('MSG91 OTP widget is missing the verify method.');
  const result = await new Promise<WidgetResult>((resolve, reject) => widget.verifyOtp!(otp, resolve, reject, reqId));
  const accessToken = result?.['access-token'] || result?.message;
  if (result?.type !== 'success' || typeof accessToken !== 'string' || accessToken.length < 20) {
    throw new Error('Invalid or expired verification code. Check the code and try again.');
  }
  requestIds.delete(identifier);
  return accessToken;
}

export async function resendOtp(phone: string): Promise<void> {
  const widget = await getWidget();
  const identifier = phoneIdentifier(phone);
  const reqId = requestIds.get(identifier);
  if (!reqId) throw new Error('This verification request expired. Go back and request a new code.');
  if (!widget.retryOtp) throw new Error('MSG91 OTP widget is missing the resend method.');
  const result = await new Promise<WidgetResult>((resolve, reject) => widget.retryOtp!(null, resolve, reject, reqId));
  if (result?.type !== 'success') throw new Error('MSG91 could not resend the code. Wait a moment and try again.');
}
