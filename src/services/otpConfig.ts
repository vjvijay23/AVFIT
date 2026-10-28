const configuredMsg91Length = Number(process.env.EXPO_PUBLIC_MSG91_OTP_LENGTH || 6);

/** MSG91 length must match the OTP length configured in the MSG91 widget. */
export const OTP_CODE_LENGTH =
  process.env.EXPO_PUBLIC_OTP_PROVIDER === 'msg91'
    && Number.isInteger(configuredMsg91Length)
    && configuredMsg91Length >= 4
    && configuredMsg91Length <= 8
    ? configuredMsg91Length
    : 6;
