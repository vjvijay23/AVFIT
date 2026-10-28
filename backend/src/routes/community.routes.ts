import { FastifyInstance } from 'fastify';
import { pool } from '../db/index.js';
import { AchievementService } from '../services/achievement.service.js';
import { ChallengeService } from '../services/challenge.service.js';
import { authenticatedUserId, requireAuth } from './auth-guard.js';

export async function communityRoutes(app: FastifyInstance) {
  app.get('/users/me/following', { preHandler: requireAuth }, async (request) => {
    const result = await pool.query(`SELECT p.id,p.full_name,p.avatar_url,f.created_at AS followed_at
      FROM profile_follows f JOIN profiles p ON p.id=f.followed_id WHERE f.follower_id=$1 ORDER BY f.created_at DESC LIMIT 200`, [authenticatedUserId(request)]);
    return { success: true, count: result.rows.length, users: result.rows };
  });

  app.post<{ Params: { id: string } }>('/users/:id/follow', { preHandler: requireAuth }, async (request, reply) => {
    const userId = authenticatedUserId(request);
    if (userId === request.params.id) return reply.status(400).send({ error: 'You cannot follow yourself.' });
    const result = await pool.query(`INSERT INTO profile_follows(follower_id,followed_id) SELECT $1,id FROM profiles WHERE id=$2
      ON CONFLICT DO NOTHING RETURNING followed_id`, [userId,request.params.id]);
    if (!result.rows[0]) {
      const exists = await pool.query('SELECT id FROM profiles WHERE id=$1', [request.params.id]);
      if (!exists.rows[0]) return reply.status(404).send({ error: 'Profile not found.' });
    }
    return { success: true, following: true, alreadyFollowing: !result.rows[0] };
  });

  app.get<{ Querystring: { limit?: string; before?: string } }>('/posts', { preHandler: requireAuth }, async (request) => {
    const limit = Math.min(50, Math.max(1, Number.parseInt(request.query.limit || '20',10) || 20));
    const rows = await pool.query(`SELECT p.*, pr.full_name, pr.avatar_url,
      EXISTS(SELECT 1 FROM post_likes l WHERE l.post_id=p.id AND l.user_id=$1) AS has_liked,
      (SELECT COUNT(*)::int FROM post_comments c WHERE c.post_id=p.id) AS comments_count
      FROM posts p JOIN profiles pr ON pr.id=p.user_id
      WHERE (p.visibility='public' OR p.user_id=$1 OR (p.visibility='followers' AND EXISTS(SELECT 1 FROM profile_follows f WHERE f.follower_id=$1 AND f.followed_id=p.user_id)))
        AND ($2::timestamptz IS NULL OR p.created_at<$2::timestamptz)
      ORDER BY p.created_at DESC LIMIT $3`, [authenticatedUserId(request),request.query.before || null,limit]);
    return { success: true, count: rows.rows.length, posts: rows.rows };
  });

  app.post<{ Body: { content: string; imageUrl?: string; postType?: string; visibility?: string; metadata?: Record<string, unknown> } }>('/posts', { preHandler: requireAuth }, async (request, reply) => {
    const userId = authenticatedUserId(request);
    const content = String(request.body?.content || '').trim();
    if (!content || content.length > 2000) return reply.status(400).send({ error: 'Post content must contain 1–2000 characters.' });
    const allowed = ['general','workout_complete','food_scan','step_milestone','trophy_unlock'];
    const postType = request.body.postType || 'general';
    if (!allowed.includes(postType)) return reply.status(400).send({ error: 'Invalid postType.' });
    const visibility = request.body.visibility || 'public';
    if (!['public','followers','private'].includes(visibility)) return reply.status(400).send({ error: 'visibility must be public, followers, or private.' });
    const result = await pool.query(`INSERT INTO posts(user_id,content,image_url,post_type,visibility,metadata) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`, [userId,content,request.body.imageUrl || null,postType,visibility,JSON.stringify(request.body.metadata || {})]);
    const count = await pool.query('SELECT COUNT(*)::int count FROM posts WHERE user_id=$1', [userId]);
    const newlyUnlocked = await AchievementService.updateMetric(userId,'post_count',count.rows[0].count);
    return reply.status(201).send({ success: true, post: result.rows[0], newlyUnlocked });
  });

  app.post<{ Params: { id: string } }>('/posts/:id/likes', { preHandler: requireAuth }, async (request, reply) => {
    const userId = authenticatedUserId(request);
    if (!await canViewPost(userId, request.params.id)) return reply.status(404).send({ error: 'Post not found.' });
    const inserted = await pool.query('INSERT INTO post_likes(post_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING post_id', [request.params.id,userId]);
    if (!inserted.rowCount) {
      const exists = await pool.query('SELECT id FROM posts WHERE id=$1', [request.params.id]);
      if (!exists.rows[0]) return reply.status(404).send({ error: 'Post not found.' });
    } else await pool.query('UPDATE posts SET likes_count=likes_count+1 WHERE id=$1', [request.params.id]);
    const given = await pool.query('SELECT COUNT(*)::int count FROM post_likes WHERE user_id=$1', [userId]);
    await AchievementService.updateMetric(userId,'likes_given',given.rows[0].count);
    const count = await pool.query('SELECT likes_count FROM posts WHERE id=$1', [request.params.id]);
    if (!count.rows[0]) return reply.status(404).send({ error: 'Post not found.' });
    return { success: true, hasLiked: true, likesCount: count.rows[0].likes_count };
  });

  app.get<{ Params: { id: string } }>('/posts/:id/comments', { preHandler: requireAuth }, async (request, reply) => {
    if (!await canViewPost(authenticatedUserId(request), request.params.id)) return reply.status(404).send({ error: 'Post not found.' });
    const result = await pool.query(`SELECT c.*,p.full_name,p.avatar_url FROM post_comments c JOIN profiles p ON p.id=c.user_id WHERE c.post_id=$1 ORDER BY c.created_at ASC LIMIT 100`, [request.params.id]);
    return { success: true, count: result.rows.length, comments: result.rows };
  });

  app.post<{ Params: { id: string }; Body: { content: string } }>('/posts/:id/comments', { preHandler: requireAuth }, async (request, reply) => {
    if (!await canViewPost(authenticatedUserId(request), request.params.id)) return reply.status(404).send({ error: 'Post not found.' });
    const content = String(request.body?.content || '').trim();
    if (!content || content.length > 1000) return reply.status(400).send({ error: 'Comment must contain 1–1000 characters.' });
    const result = await pool.query('INSERT INTO post_comments(post_id,user_id,content) VALUES($1,$2,$3) RETURNING *', [request.params.id,authenticatedUserId(request),content]);
    await pool.query('UPDATE posts SET comments_count=comments_count+1 WHERE id=$1', [request.params.id]);
    return reply.status(201).send({ success: true, comment: result.rows[0] });
  });

  app.get('/challenges', { preHandler: requireAuth }, async (request) => {
    const result = await pool.query(`SELECT c.*,cp.current_value,cp.is_completed,cp.joined_at,
      (cp.user_id IS NOT NULL) AS joined FROM challenges c LEFT JOIN challenge_participants cp ON cp.challenge_id=c.id AND cp.user_id=$1
      WHERE c.end_date >= CURRENT_DATE ORDER BY c.start_date,c.title`, [authenticatedUserId(request)]);
    return { success: true, count: result.rows.length, challenges: result.rows };
  });

  app.post<{ Body: { title: string; description: string; targetMetric: string; targetValue: number; startDate: string; endDate: string; badgeIcon?: string } }>('/challenges', { preHandler: requireAuth }, async (request, reply) => {
    const body = request.body || {};
    if (!body.title?.trim() || !body.description?.trim() || !['steps','distance_km','workout_count'].includes(body.targetMetric) || !Number.isInteger(body.targetValue) || body.targetValue < 1 || !body.startDate || !body.endDate || body.endDate < body.startDate) {
      return reply.status(400).send({ error: 'Provide title, description, valid targetMetric/targetValue, and ordered startDate/endDate.' });
    }
    const result = await pool.query(`INSERT INTO challenges(title,description,target_metric,target_value,start_date,end_date,badge_icon,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [body.title.trim(),body.description.trim(),body.targetMetric,body.targetValue,body.startDate,body.endDate,body.badgeIcon || null,authenticatedUserId(request)]);
    return reply.status(201).send({ success: true, challenge: result.rows[0] });
  });

  app.post<{ Params: { id: string } }>('/challenges/:id/join', { preHandler: requireAuth }, async (request, reply) => {
    const result = await pool.query(`INSERT INTO challenge_participants(challenge_id,user_id) SELECT id,$2 FROM challenges WHERE id=$1 AND end_date>=CURRENT_DATE
      ON CONFLICT DO NOTHING RETURNING *`, [request.params.id,authenticatedUserId(request)]);
    if (!result.rows[0]) {
      const exists = await pool.query('SELECT id FROM challenges WHERE id=$1 AND end_date>=CURRENT_DATE', [request.params.id]);
      if (!exists.rows[0]) return reply.status(404).send({ error: 'Active challenge not found.' });
      return { success: true, joined: true, alreadyJoined: true };
    }
    const joins = await pool.query('SELECT COUNT(*)::int count FROM challenge_participants WHERE user_id=$1', [authenticatedUserId(request)]);
    await AchievementService.updateMetric(authenticatedUserId(request),'challenge_join_count',joins.rows[0].count);
    return reply.status(201).send({ success: true, joined: true, participant: result.rows[0] });
  });

  app.get<{ Params: { id: string } }>('/challenges/:id/leaderboard', { preHandler: requireAuth }, async (request) => {
    await ChallengeService.refreshUser(authenticatedUserId(request));
    const result = await pool.query(`SELECT cp.user_id,p.full_name,p.avatar_url,cp.current_value,cp.is_completed,
      ROW_NUMBER() OVER(ORDER BY cp.current_value DESC,cp.joined_at ASC) AS rank
      FROM challenge_participants cp JOIN profiles p ON p.id=cp.user_id WHERE cp.challenge_id=$1 ORDER BY cp.current_value DESC,cp.joined_at ASC LIMIT 100`, [request.params.id]);
    return { success: true, count: result.rows.length, participants: result.rows };
  });
}

async function canViewPost(userId: string, postId: string) {
  const result = await pool.query(`SELECT 1 FROM posts p WHERE p.id=$2 AND
    (p.visibility='public' OR p.user_id=$1 OR (p.visibility='followers' AND EXISTS(SELECT 1 FROM profile_follows f WHERE f.follower_id=$1 AND f.followed_id=p.user_id)))`, [userId,postId]);
  return Boolean(result.rows[0]);
}
