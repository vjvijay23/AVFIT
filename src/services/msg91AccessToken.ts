type Msg91VerifyResult = {
  type?: string;
  message?: string;
  'access-token'?: string;
};

function isJwt(value: unknown): value is string {
  return typeof value === 'string'
    && value.length <= 5000
    && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value);
}

/** Extract only the JWT produced by MSG91's successful Verify OTP response. */
export function getMsg91AccessToken(result: Msg91VerifyResult): string {
  if (result?.type !== 'success') {
    throw new Error('Invalid or expired verification code. Check the code and try again.');
  }

  // MSG91 normally returns `access-token`. Some SDK versions expose the JWT
  // through `message`; accept that legacy shape only when it is JWT-shaped.
  const token = isJwt(result['access-token'])
    ? result['access-token']
    : isJwt(result.message) ? result.message : undefined;

  if (!token) {
    throw new Error('MSG91 verified the code but did not return a valid access token. Request a fresh code and try again.');
  }

  return token;
}
