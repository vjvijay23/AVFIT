-- ====================================================================
-- FitPulse - Production PostgreSQL Schema for Supabase
-- Target: Free-tier optimized with Row Level Security (RLS)
-- ====================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. ENUMS
CREATE TYPE fitness_goal AS ENUM ('weight_loss', 'muscle_gain', 'maintenance', 'endurance');
CREATE TYPE activity_level AS ENUM ('sedentary', 'light', 'moderate', 'very_active');
CREATE TYPE workout_difficulty AS ENUM ('beginner', 'intermediate', 'advanced');
CREATE TYPE meal_type AS ENUM ('breakfast', 'lunch', 'dinner', 'snack');

-- 3. USER PROFILES TABLE
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    avatar_url TEXT,
    age INT CHECK (age >= 13 AND age <= 120),
    gender TEXT CHECK (gender IN ('male', 'female', 'other')),
    height_cm NUMERIC(5, 2) NOT NULL,
    current_weight_kg NUMERIC(5, 2) NOT NULL,
    target_weight_kg NUMERIC(5, 2),
    goal fitness_goal DEFAULT 'weight_loss',
    activity_level activity_level DEFAULT 'moderate',
    daily_step_goal INT DEFAULT 10000,
    daily_calorie_target INT DEFAULT 2000,
    daily_protein_target_g INT DEFAULT 130,
    daily_carbs_target_g INT DEFAULT 220,
    daily_fat_target_g INT DEFAULT 65,
    streak_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. DAILY ACTIVITY LOGS (Steps & Distance)
CREATE TABLE public.activity_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    log_date DATE NOT NULL,
    steps INT DEFAULT 0 CHECK (steps >= 0),
    distance_km NUMERIC(6, 2) DEFAULT 0,
    calories_burned INT DEFAULT 0,
    active_minutes INT DEFAULT 0,
    synced_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, log_date)
);

-- 5. MEALS & NUTRITION LOGS (AI Food Scanner)
CREATE TABLE public.meals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    meal_type meal_type NOT NULL,
    dish_name TEXT NOT NULL,
    photo_url TEXT,
    portion_grams NUMERIC(6, 1) DEFAULT 250.0,
    calories INT NOT NULL CHECK (calories >= 0),
    protein_g NUMERIC(5, 1) DEFAULT 0,
    carbs_g NUMERIC(5, 1) DEFAULT 0,
    fat_g NUMERIC(5, 1) DEFAULT 0,
    fiber_g NUMERIC(5, 1) DEFAULT 0,
    ai_confidence TEXT CHECK (ai_confidence IN ('high', 'medium', 'low', 'manual')),
    raw_ai_payload JSONB,
    consumed_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. HOME WORKOUTS LIBRARY
CREATE TABLE public.workouts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    description TEXT,
    difficulty workout_difficulty DEFAULT 'beginner',
    category TEXT NOT NULL, -- 'HIIT', 'Strength', 'Core', 'Mobility'
    duration_minutes INT NOT NULL,
    est_calories_burned INT NOT NULL,
    thumbnail_url TEXT,
    exercises JSONB NOT NULL, -- Array of {name, reps, sets, rest_sec, media_url}
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. COMPLETED WORKOUT LOGS
CREATE TABLE public.workout_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    workout_id UUID REFERENCES public.workouts(id) ON DELETE SET NULL,
    workout_title TEXT NOT NULL,
    duration_seconds INT NOT NULL,
    calories_burned INT NOT NULL,
    completed_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. COMMUNITY POSTS
CREATE TABLE public.posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    image_url TEXT,
    post_type TEXT CHECK (post_type IN ('general', 'workout_complete', 'food_scan', 'step_milestone')),
    metadata JSONB, -- e.g. { steps: 12500 } or { workout_id: "...", calories: 350 }
    likes_count INT DEFAULT 0,
    comments_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. POST LIKES & COMMENTS
CREATE TABLE public.post_likes (
    post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (post_id, user_id)
);

CREATE TABLE public.post_comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. COMMUNITY CHALLENGES & LEADERBOARDS
CREATE TABLE public.challenges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    target_metric TEXT NOT NULL, -- 'steps', 'workouts_count', 'active_minutes'
    target_value INT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    badge_icon TEXT
);

CREATE TABLE public.challenge_participants (
    challenge_id UUID REFERENCES public.challenges(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    current_value INT DEFAULT 0,
    is_completed BOOLEAN DEFAULT FALSE,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (challenge_id, user_id)
);

-- ====================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ====================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenge_participants ENABLE ROW LEVEL SECURITY;

-- Profiles: Public read, owner update
CREATE POLICY "Public profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Activity Logs & Meals: Private to individual user
CREATE POLICY "Users manage own activity logs" ON public.activity_logs 
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own meals" ON public.meals 
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own workout logs" ON public.workout_logs 
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Workouts: Everyone can read curated workouts
CREATE POLICY "Workouts viewable by authenticated users" ON public.workouts FOR SELECT USING (true);

-- Posts & Comments: Everyone can read, authenticated users can insert/update own
CREATE POLICY "Posts viewable by everyone" ON public.posts FOR SELECT USING (true);
CREATE POLICY "Authenticated users can create posts" ON public.posts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own posts" ON public.posts FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Likes viewable by everyone" ON public.post_likes FOR SELECT USING (true);
CREATE POLICY "Authenticated users can like posts" ON public.post_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can unlike posts" ON public.post_likes FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Comments viewable by everyone" ON public.post_comments FOR SELECT USING (true);
CREATE POLICY "Authenticated users can add comments" ON public.post_comments FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Challenges: Viewable by all
CREATE POLICY "Challenges viewable by all" ON public.challenges FOR SELECT USING (true);
CREATE POLICY "Users can participate in challenges" ON public.challenge_participants FOR ALL USING (auth.uid() = user_id);

-- ====================================================================
-- PERFORMANCE INDEXES
-- ====================================================================
CREATE INDEX idx_activity_logs_user_date ON public.activity_logs(user_id, log_date DESC);
CREATE INDEX idx_meals_user_consumed ON public.meals(user_id, consumed_at DESC);
CREATE INDEX idx_posts_created ON public.posts(created_at DESC);
CREATE INDEX idx_workout_logs_user ON public.workout_logs(user_id, completed_at DESC);
