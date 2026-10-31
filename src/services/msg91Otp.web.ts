import { getMsg91AccessToken } from './msg91AccessToken';
import Config from 'react-native-config';

type WidgetResult = { type?: string; message?: string; 'access-token'?: string; code?: string | number };
type WidgetCallback = (result: WidgetResult) => void;

interface Msg91Window extends Window {
  initSendOTP?: (configuration: Record<string, unknown>) => void | Promise<void>;
  sendOtp?: (identifier: string, success: WidgetCallback, failure: (error: unknown) => void) => void;
  retryOtp?: (channel: string | null, success: WidgetCallback, failure: (error: unknown) => void, reqId: string) => void;
  verifyOtp?: (otp: string, success: WidgetCallback, failure: (error: unknown) => void, reqId: string) => void;
  isCaptchaVerified?: () => boolean;
}

const widgetId = Config.AVFIT_MSG91_WEB_WIDGET_ID || Config.AVFIT_MSG91_WIDGET_ID || '';
const tokenAuth = Config.AVFIT_MSG91_WEB_TOKEN_AUTH || Config.AVFIT_MSG91_TOKEN_AUTH || '';
const CAPTCHA_ELEMENT_ID = 'avfit-msg91-captcha';
const requestIds = new Map<string, string>();
let initializedWindow: Msg91Window | null = null;
let initialization: Promise<Msg91Window> | null = null;
const MSG91_CALLBACK_TIMEOUT_MS = 20000;
const MSG91_METHOD_READY_TIMEOUT_MS = 3000;
const requestTransports = new Map<string, 'sdk' | 'api'>();

function withCallbackTimeout<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    operation,
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error('MSG91 did not respond. Check your connection and widget configuration, then try again.')), MSG91_CALLBACK_TIMEOUT_MS);
    }),
  ]).finally(() => { if (timer) clearTimeout(timer); });
}

async function getWidget(): Promise<Msg91Window> {
  if (!widgetId || !tokenAuth) {
    throw new Error('MSG91 OTP is not configured in this web build. Set the web widget ID and token, then rebuild the app.');
  }
  if (initializedWindow) return initializedWindow;
  if (initialization) return initialization;
  if (!document.getElementById(CAPTCHA_ELEMENT_ID)) {
    throw new Error('The MSG91 CAPTCHA area is missing from this screen. Reload the app and try again.');
  }

  initialization = new Promise<Msg91Window>((resolve, reject) => {
    const widgetWindow = window as Msg91Window;
    const initialize = async () => {
      if (typeof widgetWindow.initSendOTP !== 'function') {
        reject(new Error('MSG91 widget script loaded without its initialization API.'));
        return;
      }
      try {
        await widgetWindow.initSendOTP({
          widgetId,
          tokenAuth,
          exposeMethods: true,
          captchaRenderId: CAPTCHA_ELEMENT_ID,
        });
        const readyAt = Date.now();
        while (typeof widgetWindow.sendOtp !== 'function' && Date.now() - readyAt < MSG91_METHOD_READY_TIMEOUT_MS) {
          await new Promise((ready) => setTimeout(ready, 100));
        }
        if (typeof widgetWindow.sendOtp !== 'function') {
          throw new Error('MSG91 did not expose web OTP methods. Configure this widget for Web SDK Custom UI with Invisible OTP and Mobile Integration disabled, then reload the app.');
        }
        initializedWindow = widgetWindow;
        resolve(widgetWindow);
      } catch (error) {
        reject(error);
      }
    };

    const existingScript = document.querySelector<HTMLScriptElement>('script[data-avfit-msg91]');
    if (existingScript) {
      if (typeof widgetWindow.initSendOTP === 'function') void initialize();
      else existingScript.addEventListener('load', () => { void initialize(); }, { once: true });
      return;
    }

    const urls = ['https://verify.msg91.com/otp-provider.js', 'https://verify.phone91.com/otp-provider.js'];
    let index = 0;
    const attempt = () => {
      const script = document.createElement('script');
      script.src = urls[index];
      script.async = true;
      script.dataset.avfitMsg91 = 'true';
      script.onload = () => { void initialize(); };
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

async function widgetApiRequest(path: 'sendOtp' | 'verifyOtp' | 'retryOtp', payload: Record<string, string>): Promise<WidgetResult> {
  if (!widgetId || !tokenAuth) {
    throw new Error('MSG91 OTP is not configured in this web build. Set the web widget ID and token, then rebuild the app.');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MSG91_CALLBACK_TIMEOUT_MS);
  try {
    const response = await fetch(`https://control.msg91.com/api/v5/widget/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ widgetId, tokenAuth, ...payload }),
      signal: controller.signal,
    });
    const result = await response.json().catch(() => ({})) as WidgetResult;
    if (!response.ok || result.type !== 'success') {
      throw new Error(result.message || `MSG91 rejected the request (HTTP ${response.status}). Check widget settings and account status.`);
    }
    return result;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('MSG91 did not respond in time. Check your connection and try again.');
    }
    if (error instanceof TypeError) {
      throw new Error('Could not reach MSG91 from this browser. Check your connection and allow requests to control.msg91.com.');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function prepareWidget(): Promise<void> {
  await getWidget();
}

function phoneIdentifier(phone: string): string {
  const identifier = phone.replace(/\D/g, '');
  if (identifier.length < 8 || identifier.length > 15) throw new Error('Enter a valid phone number with its country code.');
  return identifier;
}

export async function sendOtp(phone: string): Promise<void> {
  const identifier = phoneIdentifier(phone);
  let widget: Msg91Window | null = null;
  try {
    widget = await getWidget();
  } catch {
    // Some MSG91 web widgets omit the custom-window methods. Fall through to
    // the web widget API; CAPTCHA-enabled widgets must use the SDK path above.
  }

  if (widget?.sendOtp) {
    if (widget.isCaptchaVerified && !widget.isCaptchaVerified()) {
      throw new Error('Complete the CAPTCHA verification before requesting an OTP.');
    }
    const result = await withCallbackTimeout(new Promise<WidgetResult>((resolve, reject) => widget!.sendOtp!(identifier, resolve, reject)));
    if (result?.type !== 'success' || !result.message) {
      throw new Error(result?.message || 'MSG91 could not send the code. Check the widget channels and account status.');
    }
    requestIds.set(identifier, result.message);
    requestTransports.set(identifier, 'sdk');
    return;
  }

  const result = await widgetApiRequest('sendOtp', { identifier });
  if (!result.message) throw new Error('MSG91 accepted the request but did not return a verification request ID.');
  requestIds.set(identifier, result.message);
  requestTransports.set(identifier, 'api');
}

export async function verifyOtp(phone: string, otp: string): Promise<string> {
  const identifier = phoneIdentifier(phone);
  const reqId = requestIds.get(identifier);
  if (!reqId) throw new Error('This verification request expired. Request a new code and try again.');
  let result: WidgetResult;
  if (requestTransports.get(identifier) === 'api') {
    result = await widgetApiRequest('verifyOtp', { reqId, otp });
  } else {
    const widget = await getWidget();
    if (!widget.verifyOtp) throw new Error('MSG91 did not initialize its web verify method. Request a new code and try again.');
    result = await withCallbackTimeout(new Promise<WidgetResult>((resolve, reject) => widget.verifyOtp!(otp, resolve, reject, reqId)));
  }
  const accessToken = getMsg91AccessToken(result);
  requestIds.delete(identifier);
  requestTransports.delete(identifier);
  return accessToken;
}

export async function resendOtp(phone: string): Promise<void> {
  const identifier = phoneIdentifier(phone);
  const reqId = requestIds.get(identifier);
  if (!reqId) throw new Error('This verification request expired. Go back and request a new code.');
  if (requestTransports.get(identifier) === 'api') {
    await widgetApiRequest('retryOtp', { reqId, retryChannel: '11' });
  } else {
    const widget = await getWidget();
    if (!widget.retryOtp) throw new Error('MSG91 did not initialize its web resend method. Request a new code and try again.');
    const result = await withCallbackTimeout(new Promise<WidgetResult>((resolve, reject) => widget.retryOtp!('11', resolve, reject, reqId)));
    if (result?.type !== 'success') throw new Error(result?.message || 'MSG91 could not resend the code. Wait a moment and try again.');
  }
}
