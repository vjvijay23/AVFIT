// Generic fallback used by TypeScript and platforms without the native MSG91 SDK.
export async function prepareWidget(): Promise<void> {}

export async function sendOtp(_phone: string): Promise<void> {
  throw new Error('MSG91 mobile OTP is not available on this platform.');
}

export async function verifyOtp(_phone: string, _otp: string): Promise<string> {
  throw new Error('MSG91 mobile OTP is not available on this platform.');
}

export async function resendOtp(_phone: string): Promise<void> {
  throw new Error('MSG91 mobile OTP is not available on this platform.');
}
