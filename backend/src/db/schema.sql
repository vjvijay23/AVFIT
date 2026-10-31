-- PostGIS Extension
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. PROFILES TABLE
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL DEFAULT '',
    avatar_url TEXT,
    gender TEXT DEFAULT 'prefer_not_to_say',
    streak_count INT DEFAULT 0,
    total_trophy_points INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS date_of_birth DATE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS country TEXT NOT NULL DEFAULT 'US';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS preferred_units TEXT NOT NULL DEFAULT 'metric';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_onboarded BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pin_hash TEXT;

-- Private profile photos are stored separately so the public avatar_url can
-- continue to hold the existing community emoji/avatar value.
CREATE TABLE IF NOT EXISTS profile_photos (
    user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
    image_data BYTEA NOT NULL,
    mime_type TEXT NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. RECORDED ACTIVITIES (Strava-style with PostGIS LineString)
CREATE TABLE IF NOT EXISTS recorded_activities (
    id TEXT PRIMARY KEY,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    sport_type TEXT NOT NULL DEFAULT 'walking',
    title TEXT DEFAULT 'Morning Walk',
    duration_sec INT NOT NULL DEFAULT 0,
    distance_km NUMERIC(8, 3) NOT NULL DEFAULT 0,
    calories INT NOT NULL DEFAULT 0,
    avg_pace TEXT DEFAULT '--:--',
    avg_speed_kmh NUMERIC(5, 2) DEFAULT 0,
    max_speed_kmh NUMERIC(5, 2) DEFAULT 0,
    elevation_gain_m NUMERIC(6, 1) DEFAULT 0,
    start_time TIMESTAMPTZ DEFAULT NOW(),
    end_time TIMESTAMPTZ DEFAULT NOW(),
    -- Spatial geometry for GIS queries, segments, distance computation
    route_geom GEOMETRY(LineString, 4326),
    -- GeoJSON / raw GPS points with timestamps and elevations
    route_coordinates JSONB NOT NULL DEFAULT '[]'::jsonb,
    encoded_polyline TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Spatial index for high performance geo-queries
CREATE INDEX IF NOT EXISTS idx_activities_route_geom ON recorded_activities USING GIST (route_geom);
CREATE INDEX IF NOT EXISTS idx_activities_user_id ON recorded_activities(user_id);
CREATE INDEX IF NOT EXISTS idx_activities_created_at ON recorded_activities(created_at DESC);

-- 3. MEALS TABLE (AI Food Vision & Macro Scanner)
CREATE TABLE IF NOT EXISTS meals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    dish_name TEXT NOT NULL,
    photo_url TEXT,
    portion_grams NUMERIC(6, 1) DEFAULT 250.0,
    calories INT NOT NULL DEFAULT 0,
    protein_g NUMERIC(6, 1) NOT NULL DEFAULT 0,
    carbs_g NUMERIC(6, 1) NOT NULL DEFAULT 0,
    fat_g NUMERIC(6, 1) NOT NULL DEFAULT 0,
    fiber_g NUMERIC(6, 1) NOT NULL DEFAULT 0,
    sugars_g NUMERIC(6, 1) NOT NULL DEFAULT 0,
    saturated_fat_g NUMERIC(6, 1) NOT NULL DEFAULT 0,
    sodium_mg NUMERIC(8, 1) NOT NULL DEFAULT 0,
    cholesterol_mg NUMERIC(8, 1) NOT NULL DEFAULT 0,
    confidence TEXT DEFAULT 'high',
    health_tips TEXT,
    ingredients JSONB DEFAULT '[]'::jsonb,
    meal_type TEXT DEFAULT 'lunch',
    logged_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meals_user_id ON meals(user_id);
CREATE INDEX IF NOT EXISTS idx_meals_logged_at ON meals(logged_at DESC);

ALTER TABLE meals ADD COLUMN IF NOT EXISTS sugars_g NUMERIC(6, 1) NOT NULL DEFAULT 0;
ALTER TABLE meals ADD COLUMN IF NOT EXISTS saturated_fat_g NUMERIC(6, 1) NOT NULL DEFAULT 0;
ALTER TABLE meals ADD COLUMN IF NOT EXISTS sodium_mg NUMERIC(8, 1) NOT NULL DEFAULT 0;
ALTER TABLE meals ADD COLUMN IF NOT EXISTS cholesterol_mg NUMERIC(8, 1) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS diet_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    plan JSONB NOT NULL,
    model TEXT NOT NULL,
    context_sources TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_diet_plans_user_created ON diet_plans(user_id, created_at DESC);

-- 4. DAILY AGGREGATES & STEPS
CREATE TABLE IF NOT EXISTS daily_activity_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    log_date DATE NOT NULL,
    steps INT DEFAULT 0,
    distance_km NUMERIC(6, 2) DEFAULT 0,
    calories_burned INT DEFAULT 0,
    active_minutes INT DEFAULT 0,
    synced_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, log_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_logs_user_date ON daily_activity_logs(user_id, log_date);

-- Fitness profile/onboarding (health and body metrics are private to the owner).
CREATE TABLE IF NOT EXISTS fitness_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
    height_cm NUMERIC(5,2) NOT NULL CHECK (height_cm > 50 AND height_cm < 300),
    weight_kg NUMERIC(5,2) NOT NULL CHECK (weight_kg > 20 AND weight_kg < 400),
    target_weight_kg NUMERIC(5,2),
    fitness_goal TEXT NOT NULL DEFAULT 'general_fitness' CHECK (fitness_goal IN ('weight_loss','muscle_gain','general_fitness','endurance','maintenance')),
    fitness_level TEXT NOT NULL DEFAULT 'beginner' CHECK (fitness_level IN ('beginner','intermediate','advanced')),
    activity_level TEXT NOT NULL DEFAULT 'moderately_active' CHECK (activity_level IN ('sedentary','lightly_active','moderately_active','very_active')),
    workout_preference TEXT NOT NULL DEFAULT 'home' CHECK (workout_preference IN ('home','gym','outdoor','combination')),
    available_equipment TEXT[] NOT NULL DEFAULT ARRAY['bodyweight'],
    preferred_workout_duration_min INT NOT NULL DEFAULT 30 CHECK (preferred_workout_duration_min BETWEEN 10 AND 180),
    weekly_workout_frequency_days INT NOT NULL DEFAULT 4 CHECK (weekly_workout_frequency_days BETWEEN 1 AND 7),
    dietary_preference TEXT NOT NULL DEFAULT 'non_vegetarian' CHECK (dietary_preference IN ('non_vegetarian','vegetarian','vegan','pescatarian','keto','halal','other')),
    dietary_preference_other TEXT NOT NULL DEFAULT '',
    allergies_and_restrictions TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    custom_allergies_and_restrictions TEXT NOT NULL DEFAULT '',
    bmr NUMERIC(7,1) NOT NULL,
    tdee NUMERIC(7,1) NOT NULL,
    daily_calorie_target INT NOT NULL,
    daily_protein_g INT NOT NULL,
    daily_carbs_g INT NOT NULL,
    daily_fat_g INT NOT NULL,
    daily_step_goal INT NOT NULL DEFAULT 10000 CHECK (daily_step_goal >= 1000),
    daily_water_ml INT NOT NULL DEFAULT 2500,
    is_private BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE fitness_profiles ADD COLUMN IF NOT EXISTS dietary_preference_other TEXT NOT NULL DEFAULT '';
ALTER TABLE fitness_profiles ADD COLUMN IF NOT EXISTS custom_allergies_and_restrictions TEXT NOT NULL DEFAULT '';

-- Curated workout catalog and completion history.
CREATE TABLE IF NOT EXISTS workouts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    description TEXT,
    difficulty TEXT NOT NULL DEFAULT 'beginner' CHECK (difficulty IN ('beginner','intermediate','advanced')),
    category TEXT NOT NULL CHECK (category IN ('HIIT','Strength','Core','Mobility')),
    duration_minutes INT NOT NULL CHECK (duration_minutes > 0),
    est_calories_burned INT NOT NULL DEFAULT 0 CHECK (est_calories_burned >= 0),
    thumbnail_url TEXT,
    exercises JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS workout_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    workout_id UUID REFERENCES workouts(id) ON DELETE SET NULL,
    workout_title TEXT NOT NULL,
    duration_seconds INT NOT NULL CHECK (duration_seconds > 0),
    calories_burned INT NOT NULL DEFAULT 0 CHECK (calories_burned >= 0),
    completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_workout_logs_user_date ON workout_logs(user_id, completed_at DESC);

-- Achievement catalog and per-user progress. Progress is only written by backend services.
CREATE TABLE IF NOT EXISTS achievement_definitions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('step_activity','workout','nutrition','community','personal_progress')),
    tier TEXT NOT NULL CHECK (tier IN ('bronze','silver','gold','platinum','diamond')),
    icon_name TEXT NOT NULL,
    metric_type TEXT NOT NULL,
    target_value INT NOT NULL CHECK (target_value > 0),
    points INT NOT NULL CHECK (points > 0)
);
CREATE TABLE IF NOT EXISTS user_achievements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    achievement_id UUID NOT NULL REFERENCES achievement_definitions(id) ON DELETE CASCADE,
    current_value INT NOT NULL DEFAULT 0,
    target_value INT NOT NULL,
    is_unlocked BOOLEAN NOT NULL DEFAULT FALSE,
    unlocked_at TIMESTAMPTZ,
    is_shared BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, achievement_id)
);

INSERT INTO achievement_definitions (code,title,description,category,tier,icon_name,metric_type,target_value,points) VALUES
 ('STEPS_1K','First Strides','Reach 1,000 steps in one day.','step_activity','bronze','Footprints','steps',1000,20),
 ('STEPS_5K','On The Move','Reach 5,000 steps in one day.','step_activity','bronze','Footprints','steps',5000,30),
 ('STEPS_10K','Ten Thousand Club','Reach 10,000 steps in one day.','step_activity','silver','Award','steps',10000,50),
 ('DISTANCE_50KM','Marathon Explorer','Accumulate 50 kilometers.','step_activity','gold','MapPin','distance_km',50,150),
 ('WORKOUT_FIRST','Day One, Done','Complete your first workout.','workout','bronze','Dumbbell','workout_count',1,20),
 ('WORKOUTS_5','Building Momentum','Complete five workouts.','workout','bronze','Dumbbell','workout_count',5,40),
 ('WORKOUTS_25','Fitness Devotee','Complete 25 workouts.','workout','silver','Dumbbell','workout_count',25,100),
 ('WORKOUTS_100','Century Performer','Complete 100 workouts.','workout','platinum','Award','workout_count',100,350),
 ('FOOD_FIRST','Mindful Eater','Log your first meal.','nutrition','bronze','Camera','meal_count',1,20),
 ('FOOD_30','Nutrition Mastery','Log 30 meals.','nutrition','gold','CheckCircle','meal_count',30,150),
 ('COMMUNITY_FIRST_POST','Community Welcome','Publish your first post.','community','bronze','Users','post_count',1,25),
 ('COMMUNITY_10_POSTS','Community Regular','Publish 10 posts.','community','silver','Users','post_count',10,75),
 ('PROGRESS_ONBOARDING_DONE','Journey Initiated','Complete your fitness profile.','personal_progress','bronze','Compass','onboarding',1,25),
 ('STREAK_7','Weekly Consistency','Stay active for seven consecutive days.','step_activity','silver','Flame','streak_days',7,75),
 ('STREAK_30','Unstoppable Habit','Stay active for thirty consecutive days.','step_activity','gold','Flame','streak_days',30,150),
 ('WORKOUTS_WEEKLY','Weekly Warrior','Complete four workouts in a calendar week.','workout','silver','Calendar','workout_week_count',4,75),
 ('WORKOUTS_MONTHLY','Monthly Mastery','Complete sixteen workouts in a calendar month.','workout','gold','Calendar','workout_month_count',16,150),
 ('MEAL_DAYS_7','Macro Discipline','Log meals on seven distinct days.','nutrition','silver','Sparkles','meal_days',7,60),
 ('COMMUNITY_MOTIVATOR','Motivator','Give fifty high-fives.','community','silver','Heart','likes_given',50,75),
 ('COMMUNITY_CHALLENGE_JOIN','Challenger Awakens','Join a community challenge.','community','bronze','Target','challenge_join_count',1,25),
 ('COMMUNITY_CHALLENGE_COMPLETE','Victory Podium','Complete a community challenge.','community','gold','Trophy','challenge_complete_count',1,150)
ON CONFLICT (code) DO NOTHING;

-- Community content, reactions, comments, and challenges.
CREATE TABLE IF NOT EXISTS posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL CHECK (length(content) BETWEEN 1 AND 2000),
    image_url TEXT,
    post_type TEXT NOT NULL DEFAULT 'general' CHECK (post_type IN ('general','workout_complete','food_scan','step_milestone','trophy_unlock')),
    visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','followers','private')),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    likes_count INT NOT NULL DEFAULT 0,
    comments_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE posts ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'public';
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);
CREATE TABLE IF NOT EXISTS post_likes (
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY(post_id,user_id)
);
CREATE TABLE IF NOT EXISTS post_comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL CHECK (length(content) BETWEEN 1 AND 1000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS profile_follows (
    follower_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    followed_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY(follower_id,followed_id),
    CHECK (follower_id <> followed_id)
);
CREATE TABLE IF NOT EXISTS challenges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    target_metric TEXT NOT NULL CHECK (target_metric IN ('steps','distance_km','workout_count')),
    target_value INT NOT NULL CHECK (target_value > 0),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    badge_icon TEXT,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    CHECK (end_date >= start_date)
);
CREATE TABLE IF NOT EXISTS challenge_participants (
    challenge_id UUID NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    current_value INT NOT NULL DEFAULT 0,
    is_completed BOOLEAN NOT NULL DEFAULT FALSE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY(challenge_id,user_id)
);

INSERT INTO workouts (title,description,difficulty,category,duration_minutes,est_calories_burned,exercises)
SELECT seed.title,seed.description,seed.difficulty,seed.category,seed.duration,seed.calories,seed.exercises::jsonb
FROM (VALUES
 ('Bodyweight Starter','A short full-body introduction with no equipment.','beginner','Strength',15,90,'[{"name":"Bodyweight squat","durationOrReps":"12 reps","restSeconds":30,"tip":"Keep your knees tracking over your toes."},{"name":"Incline push-up","durationOrReps":"10 reps","restSeconds":30,"tip":"Keep your body in a straight line."}]'),
 ('Core Foundations','Build a steady core with controlled movements.','beginner','Core',18,100,'[{"name":"Dead bug","durationOrReps":"10 each side","restSeconds":30,"tip":"Keep your lower back gently pressed down."},{"name":"Plank","durationOrReps":"30 seconds","restSeconds":45,"tip":"Brace your abdomen and breathe steadily."}]'),
 ('Low Impact Cardio','A joint-friendly cardio circuit for home.','beginner','HIIT',20,130,'[{"name":"March in place","durationOrReps":"45 seconds","restSeconds":15,"tip":"Stand tall and use your arms."},{"name":"Step jacks","durationOrReps":"45 seconds","restSeconds":15,"tip":"Step side to side instead of jumping."}]'),
 ('Mobility Reset','Gentle mobility work for hips, shoulders, and back.','beginner','Mobility',12,45,'[{"name":"Cat-cow","durationOrReps":"8 reps","restSeconds":15,"tip":"Move slowly with your breath."},{"name":"World greatest stretch","durationOrReps":"5 each side","restSeconds":15,"tip":"Keep the range comfortable."}]')
) AS seed(title,description,difficulty,category,duration,calories,exercises)
WHERE NOT EXISTS (SELECT 1 FROM workouts w WHERE w.title=seed.title);
