module.exports = ({ config }) => {
  const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
  const nextConfig = {
    ...config,
    ios: { ...config.ios },
    android: { ...config.android },
  };

  if (apiKey) {
    nextConfig.ios.config = {
      ...nextConfig.ios.config,
      googleMapsApiKey: apiKey,
    };
    nextConfig.android.config = {
      ...nextConfig.android.config,
      googleMaps: {
        ...nextConfig.android.config?.googleMaps,
        apiKey,
      },
    };
  }

  return nextConfig;
};
