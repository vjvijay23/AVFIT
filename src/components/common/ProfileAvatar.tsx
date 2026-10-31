import React, { useEffect, useState } from 'react';
import { Image, ImageSourcePropType, StyleSheet, Text, View } from 'react-native';
import { BackendApi } from '../../services/backendApi';
import { Colors } from '../../theme/colors';

type Props = { userId?: string; hasPhoto?: boolean; photoUpdatedAt?: string; emoji?: string; size?: number };

export default function ProfileAvatar({ userId, hasPhoto, photoUpdatedAt, emoji = '🏃‍♂️', size = 44 }: Props) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [photoUpdatedAt, hasPhoto]);
  const source = userId && hasPhoto && !failed ? BackendApi.profilePhotoSource(userId, photoUpdatedAt) as ImageSourcePropType : undefined;
  return (
    <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2 }]}>
      {source ? <Image source={source} style={{ width: size - 4, height: size - 4, borderRadius: (size - 4) / 2 }} resizeMode="cover" onError={() => setFailed(true)} />
        : <Text style={{ fontSize: size * 0.48 }}>{emoji}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({ circle: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: Colors.primarySoft, borderWidth: 2, borderColor: Colors.border } });
