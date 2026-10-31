import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
  TextInput,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../theme/colors';
import {
  Heart,
  MessageCircle,
  Share2,
  Flame,
  Plus,
  Sparkles,
} from 'lucide-react-native';
import { BackendApi } from '../services/backendApi';
import AppNoticeCard from '../components/common/AppNoticeCard';

export default function CommunityScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const [posts, setPosts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [feedError, setFeedError] = useState('');
  const [challenges, setChallenges] = useState<Array<Record<string, any>>>([]);
  const [showComposer, setShowComposer] = useState(false);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
  const [commentsByPost, setCommentsByPost] = useState<Record<string, Array<Record<string, any>>>>({});
  const [commentDraft, setCommentDraft] = useState('');
  const [postingComment, setPostingComment] = useState(false);
  const [likingPostIds, setLikingPostIds] = useState<Record<string, boolean>>({});

  const loadPosts = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await BackendApi.getCommunityPosts();
      setPosts(response.posts.map((post) => ({
        id: post.id,
        author: post.full_name || 'AVFIT Athlete',
        timeAgo: new Date(post.created_at).toLocaleString(),
        avatarEmoji: post.avatar_url || '🏃‍♂️',
        badge: String(post.post_type || 'general').replaceAll('_', ' '),
        content: post.content,
        stats: '',
        likes: Number(post.likes_count || 0),
        comments: Number(post.comments_count || 0),
        hasLiked: Boolean(post.has_liked),
      })));
      setFeedError('');
    } catch (error: any) {
      setFeedError(error?.message || 'Could not load the community feed.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPosts();
    const unsubscribe = navigation?.addListener?.('focus', loadPosts);
    return unsubscribe;
  }, [loadPosts, navigation]);

  useEffect(() => {
    BackendApi.getChallenges().then((result) => setChallenges(result.challenges)).catch(() => setChallenges([]));
  }, []);

  const publishPost = async () => {
    const content = draft.trim();
    if (!content || posting) return;
    setPosting(true);
    try {
      await BackendApi.createCommunityPost(content);
      setDraft('');
      setShowComposer(false);
      await loadPosts();
    } catch (error: any) {
      Alert.alert('Could not publish post', error?.message || 'Please try again.');
    } finally {
      setPosting(false);
    }
  };

  const joinChallenge = async (challenge: Record<string, any>) => {
    try {
      await BackendApi.joinChallenge(challenge.id);
      setChallenges((items) => items.map((item) => item.id === challenge.id ? { ...item, joined: true } : item));
    } catch (error: any) {
      Alert.alert('Could not join challenge', error?.message || 'Please try again.');
    }
  };

  const toggleComments = async (postId: string) => {
    if (expandedPostId === postId) { setExpandedPostId(null); return; }
    setExpandedPostId(postId);
    try {
      const result = await BackendApi.getPostComments(postId);
      setCommentsByPost((current) => ({ ...current, [postId]: result.comments }));
    } catch (error: any) {
      setFeedError(error?.message || 'Could not load comments.');
    }
  };

  const publishComment = async (postId: string) => {
    const content = commentDraft.trim();
    if (!content || postingComment) return;
    setPostingComment(true);
    try {
      const response: any = await BackendApi.createPostComment(postId, content);
      if (response?.comment) {
        setCommentsByPost((current) => ({
          ...current,
          [postId]: [...(current[postId] || []), response.comment],
        }));
      }
      setCommentDraft('');
      setPosts((items) => items.map((item) => item.id === postId ? { ...item, comments: item.comments + 1 } : item));
      setFeedError('');
    } catch (error: any) {
      const message = error?.message || 'Please try again.';
      setFeedError(message);
      Alert.alert('Could not add comment', message);
    } finally {
      setPostingComment(false);
    }
  };

  const toggleLike = async (id: string) => {
    const post = posts.find((item) => item.id === id);
    if (!post || post.hasLiked || likingPostIds[id]) return;
    setLikingPostIds((current) => ({ ...current, [id]: true }));
    try {
      const result = await BackendApi.likeCommunityPost(id);
      setPosts((prev) => prev.map((item) => item.id === id ? { ...item, hasLiked: true, likes: result.likesCount } : item));
    } catch (error: any) {
      setFeedError(error?.message || 'Could not send high-five.');
    } finally {
      setLikingPostIds((current) => ({ ...current, [id]: false }));
    }
  };

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, 16) }]}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 130 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        
        {/* Top Header */}
        <View style={styles.topHeader}>
          <Text style={styles.screenTitle}>Fitness Community</Text>
          <TouchableOpacity style={styles.shareBtn} onPress={() => setShowComposer((value) => !value)}>
            <Plus size={14} color="#FFFFFF" />
            <Text style={styles.shareBtnText}>Share</Text>
          </TouchableOpacity>
        </View>

        {showComposer && <View style={styles.composer}>
          <TextInput value={draft} onChangeText={setDraft} placeholder="Share an update with the community" multiline maxLength={2000} style={styles.composerInput} />
          <TouchableOpacity style={styles.publishButton} onPress={publishPost} disabled={posting || !draft.trim()}>
            <Text style={styles.publishButtonText}>{posting ? 'Posting…' : 'Publish'}</Text>
          </TouchableOpacity>
        </View>}

        {/* Challenge Announcement Banner */}
        <View style={styles.announcementBanner}>
          <View style={styles.bannerIconCircle}>
            <Sparkles size={18} color={Colors.primary} />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.bannerTitle}>{challenges[0]?.title || 'Community Challenges'}</Text>
            <Text style={styles.bannerSubtitle}>{challenges[0] ? `${challenges[0].target_value} ${challenges[0].target_metric} · ends ${new Date(challenges[0].end_date).toLocaleDateString()}` : 'Join a challenge and track progress together.'}</Text>
          </View>
        </View>

        {challenges.map((challenge) => <View key={challenge.id} style={styles.challengeCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.authorName}>{challenge.title}</Text>
            <Text style={styles.postTime}>{challenge.description}</Text>
          </View>
          <TouchableOpacity style={styles.challengeButton} onPress={() => joinChallenge(challenge)} disabled={Boolean(challenge.joined)}>
            <Text style={styles.challengeButtonText}>{challenge.joined ? 'Joined' : 'Join'}</Text>
          </TouchableOpacity>
        </View>)}

        {/* Post Stream */}
        {isLoading && <ActivityIndicator color={Colors.primary} style={{ marginVertical: 24 }} />}
        {!isLoading && feedError !== '' && <>
          <AppNoticeCard message={feedError} tone="error" compact />
          {!BackendApi.hasAuthToken() && <TouchableOpacity style={styles.publishButton} onPress={() => navigation?.navigate?.('Login')}>
            <Text style={styles.publishButtonText}>Sign in to use the community</Text>
          </TouchableOpacity>}
        </>}
        {!isLoading && !feedError && posts.length === 0 && <Text style={styles.postBody}>No community posts yet. Sign in and share your first update.</Text>}
        {posts.map((post) => (
          <View key={post.id} style={styles.postCard}>
            <View style={styles.postAuthorRow}>
              <View style={styles.avatarPill}>
                <Text style={{ fontSize: 18 }}>{post.avatarEmoji}</Text>
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.authorName}>{post.author}</Text>
                <Text style={styles.postTime}>{post.timeAgo}</Text>
              </View>
              <View style={styles.achievementBadge}>
                <Text style={styles.achievementText}>{post.badge}</Text>
              </View>
            </View>

            <Text style={styles.postBody}>{post.content}</Text>

            <View style={styles.statsPill}>
              <Flame size={12} color={Colors.accentOrange} fill={Colors.accentOrange} />
              <Text style={styles.statsText}>{post.stats}</Text>
            </View>

            <View style={styles.actionsBar}>
              <TouchableOpacity
                style={styles.actionItem}
                onPress={() => toggleLike(post.id)}
                disabled={Boolean(likingPostIds[post.id]) || post.hasLiked}
                accessibilityRole="button"
                accessibilityLabel={post.hasLiked ? `You high-fived this post. ${post.likes} high-fives` : `High-five post. ${post.likes} high-fives`}
              >
                <Heart
                  size={16}
                  color={post.hasLiked ? Colors.accentOrange : Colors.textSecondary}
                  fill={post.hasLiked ? Colors.accentOrange : 'transparent'}
                />
                <Text
                  style={[
                    styles.actionText,
                    post.hasLiked && { color: Colors.accentOrange, fontWeight: '800' },
                  ]}
                >
                  {likingPostIds[post.id] ? 'Sending…' : `${post.likes} High-Fives`}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionItem} onPress={() => toggleComments(post.id)}>
                <MessageCircle size={16} color={Colors.textSecondary} />
                <Text style={styles.actionText}>{post.comments} Comments</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionItem}>
                <Share2 size={16} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
            {expandedPostId === post.id && <View style={styles.commentsBox}>
              {(commentsByPost[post.id] || []).map((comment) => <Text key={comment.id} style={styles.postTime}><Text style={styles.authorName}>{comment.full_name || 'Athlete'}: </Text>{comment.content}</Text>)}
              <View style={styles.commentComposer}>
                <TextInput value={commentDraft} onChangeText={setCommentDraft} placeholder="Write a comment" maxLength={1000} style={styles.commentInput} />
                <TouchableOpacity onPress={() => publishComment(post.id)} disabled={postingComment || !commentDraft.trim()}>
                  <Text style={styles.publishButtonText}>{postingComment ? '…' : 'Send'}</Text>
                </TouchableOpacity>
              </View>
            </View>}
          </View>
        ))}

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  commentsBox: { borderTopWidth: 1, borderTopColor: Colors.borderSubtle, marginTop: 10, paddingTop: 10 },
  commentComposer: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 },
  commentInput: { flex: 1, backgroundColor: Colors.background, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, color: Colors.textPrimary, fontSize: 12 },
  composer: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 12, marginBottom: 14, borderWidth: 1, borderColor: Colors.borderSubtle },
  composerInput: { minHeight: 72, color: Colors.textPrimary, textAlignVertical: 'top', fontSize: 14 },
  publishButton: { alignSelf: 'flex-end', backgroundColor: Colors.primary, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 8, marginTop: 8 },
  publishButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  challengeCard: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: Colors.borderSubtle, flexDirection: 'row', alignItems: 'center', gap: 10 },
  challengeButton: { backgroundColor: Colors.primary, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 8 },
  challengeButtonText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 90,
  },
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  screenTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: -0.5,
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 20,
    gap: 4,
  },
  shareBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  announcementBanner: {
    backgroundColor: '#F3EDE2',
    borderRadius: 22,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  bannerIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  bannerSubtitle: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  postCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 4,
  },
  postAuthorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  avatarPill: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F7F0E4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  authorName: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  postTime: {
    fontSize: 10,
    color: Colors.textMuted,
  },
  achievementBadge: {
    backgroundColor: '#E8F1EC',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  achievementText: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.primary,
  },
  postBody: {
    fontSize: 13,
    color: Colors.textPrimary,
    lineHeight: 19,
    marginBottom: 10,
  },
  statsPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FAF5EE',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    gap: 4,
    marginBottom: 12,
  },
  statsText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  actionsBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#F5EFEB',
    paddingTop: 10,
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  actionText: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
});
