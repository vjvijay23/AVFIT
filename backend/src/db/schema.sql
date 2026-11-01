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

-- Set-by-set strength training records. These extend the existing workout log
-- without changing how guided workout summaries are stored.
CREATE TABLE IF NOT EXISTS strength_exercises (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    equipment TEXT NOT NULL CHECK (equipment IN ('barbell','dumbbell','machine','cable','bodyweight','kettlebell','smith_machine','resistance_band','ez_bar','trap_bar','medicine_ball','suspension_trainer','landmine')),
    primary_muscle TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE strength_exercises DROP CONSTRAINT IF EXISTS strength_exercises_equipment_check;
ALTER TABLE strength_exercises ADD CONSTRAINT strength_exercises_equipment_check
    CHECK (equipment IN ('barbell','dumbbell','machine','cable','bodyweight','kettlebell','smith_machine','resistance_band','ez_bar','trap_bar','medicine_ball','suspension_trainer','landmine'));
CREATE TABLE IF NOT EXISTS strength_workouts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    workout_log_id UUID REFERENCES workout_logs(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ NOT NULL,
    duration_seconds INT NOT NULL CHECK (duration_seconds BETWEEN 30 AND 86400),
    total_volume_kg NUMERIC(12,2) NOT NULL DEFAULT 0,
    calories_burned INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_strength_workouts_user_date ON strength_workouts(user_id, completed_at DESC);
CREATE TABLE IF NOT EXISTS strength_workout_exercises (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workout_id UUID NOT NULL REFERENCES strength_workouts(id) ON DELETE CASCADE,
    exercise_id UUID NOT NULL REFERENCES strength_exercises(id),
    exercise_name TEXT NOT NULL,
    order_index INT NOT NULL CHECK (order_index >= 0),
    UNIQUE (workout_id, order_index)
);
CREATE TABLE IF NOT EXISTS strength_sets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workout_exercise_id UUID NOT NULL REFERENCES strength_workout_exercises(id) ON DELETE CASCADE,
    set_index INT NOT NULL CHECK (set_index > 0),
    set_type TEXT NOT NULL DEFAULT 'N' CHECK (set_type IN ('W','N','D','F')),
    weight_kg NUMERIC(8,2) NOT NULL DEFAULT 0 CHECK (weight_kg >= 0),
    reps INT NOT NULL CHECK (reps BETWEEN 0 AND 1000),
    rpe NUMERIC(3,1) CHECK (rpe BETWEEN 6 AND 10),
    is_completed BOOLEAN NOT NULL DEFAULT FALSE,
    volume_kg NUMERIC(12,2) NOT NULL DEFAULT 0,
    estimated_1rm_kg NUMERIC(10,2),
    is_pr BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE (workout_exercise_id, set_index)
);
CREATE INDEX IF NOT EXISTS idx_strength_sets_previous ON strength_sets(workout_exercise_id, set_index);

INSERT INTO strength_exercises (id,slug,name,equipment,primary_muscle) VALUES
 ('00000000-0000-4000-8000-000000000001','barbell-back-squat','Barbell Back Squat','barbell','quads'),
 ('00000000-0000-4000-8000-000000000002','barbell-deadlift','Barbell Deadlift','barbell','back'),
 ('00000000-0000-4000-8000-000000000003','barbell-bench-press','Barbell Bench Press','barbell','chest'),
 ('00000000-0000-4000-8000-000000000004','barbell-overhead-press','Barbell Overhead Press','barbell','shoulders'),
 ('00000000-0000-4000-8000-000000000005','barbell-row','Barbell Row','barbell','back'),
 ('00000000-0000-4000-8000-000000000006','dumbbell-goblet-squat','Dumbbell Goblet Squat','dumbbell','quads'),
 ('00000000-0000-4000-8000-000000000007','dumbbell-chest-press','Dumbbell Chest Press','dumbbell','chest'),
 ('00000000-0000-4000-8000-000000000008','dumbbell-shoulder-press','Dumbbell Shoulder Press','dumbbell','shoulders'),
 ('00000000-0000-4000-8000-000000000009','dumbbell-row','Dumbbell Row','dumbbell','back'),
 ('00000000-0000-4000-8000-000000000010','dumbbell-bicep-curl','Dumbbell Bicep Curl','dumbbell','biceps'),
 ('00000000-0000-4000-8000-000000000011','leg-press','Leg Press','machine','quads'),
 ('00000000-0000-4000-8000-000000000012','leg-extension','Leg Extension','machine','quads'),
 ('00000000-0000-4000-8000-000000000013','seated-row','Seated Cable Row','machine','back'),
 ('00000000-0000-4000-8000-000000000014','chest-fly-machine','Chest Fly Machine','machine','chest'),
 ('00000000-0000-4000-8000-000000000015','lat-pulldown','Lat Pulldown','cable','back'),
 ('00000000-0000-4000-8000-000000000016','cable-triceps-pushdown','Cable Triceps Pushdown','cable','triceps'),
 ('00000000-0000-4000-8000-000000000017','cable-face-pull','Cable Face Pull','cable','shoulders'),
 ('00000000-0000-4000-8000-000000000018','cable-lateral-raise','Cable Lateral Raise','cable','shoulders'),
 ('00000000-0000-4000-8000-000000000019','push-up','Push-Up','bodyweight','chest'),
 ('00000000-0000-4000-8000-000000000020','pull-up','Pull-Up','bodyweight','back'),
 ('00000000-0000-4000-8000-000000000021','bodyweight-squat','Bodyweight Squat','bodyweight','quads'),
 ('00000000-0000-4000-8000-000000000022','plank','Plank','bodyweight','core')
ON CONFLICT (slug) DO NOTHING;

-- Expanded commercial-gym equipment catalog. Slugs are stable so new entries
-- can be safely seeded on every backend startup without duplicating exercises.
INSERT INTO strength_exercises (slug,name,equipment,primary_muscle) VALUES
 ('barbell-front-squat','Barbell Front Squat','barbell','quads'),
 ('barbell-romanian-deadlift','Barbell Romanian Deadlift','barbell','hamstrings'),
 ('barbell-incline-bench-press','Barbell Incline Bench Press','barbell','chest'),
 ('barbell-close-grip-bench-press','Barbell Close-Grip Bench Press','barbell','triceps'),
 ('barbell-push-press','Barbell Push Press','barbell','shoulders'),
 ('barbell-hip-thrust','Barbell Hip Thrust','barbell','glutes'),
 ('barbell-bulgarian-split-squat','Barbell Bulgarian Split Squat','barbell','quads'),
 ('barbell-sumo-deadlift','Barbell Sumo Deadlift','barbell','glutes'),
 ('barbell-good-morning','Barbell Good Morning','barbell','hamstrings'),
 ('barbell-pendlay-row','Barbell Pendlay Row','barbell','back'),
 ('barbell-shrug','Barbell Shrug','barbell','traps'),
 ('barbell-floor-press','Barbell Floor Press','barbell','chest'),
 ('barbell-walking-lunge','Barbell Walking Lunge','barbell','quads'),
 ('barbell-upright-row','Barbell Upright Row','barbell','shoulders'),
 ('dumbbell-incline-chest-press','Dumbbell Incline Chest Press','dumbbell','chest'),
 ('dumbbell-decline-chest-press','Dumbbell Decline Chest Press','dumbbell','chest'),
 ('dumbbell-chest-fly','Dumbbell Chest Fly','dumbbell','chest'),
 ('dumbbell-lateral-raise','Dumbbell Lateral Raise','dumbbell','shoulders'),
 ('dumbbell-front-raise','Dumbbell Front Raise','dumbbell','shoulders'),
 ('dumbbell-rear-delt-fly','Dumbbell Rear-Delt Fly','dumbbell','shoulders'),
 ('dumbbell-arnold-press','Dumbbell Arnold Press','dumbbell','shoulders'),
 ('dumbbell-hammer-curl','Dumbbell Hammer Curl','dumbbell','biceps'),
 ('dumbbell-concentration-curl','Dumbbell Concentration Curl','dumbbell','biceps'),
 ('dumbbell-overhead-triceps-extension','Dumbbell Overhead Triceps Extension','dumbbell','triceps'),
 ('dumbbell-triceps-kickback','Dumbbell Triceps Kickback','dumbbell','triceps'),
 ('dumbbell-romanian-deadlift','Dumbbell Romanian Deadlift','dumbbell','hamstrings'),
 ('dumbbell-step-up','Dumbbell Step-Up','dumbbell','quads'),
 ('dumbbell-walking-lunge','Dumbbell Walking Lunge','dumbbell','quads'),
 ('dumbbell-calf-raise','Dumbbell Calf Raise','dumbbell','calves'),
 ('dumbbell-pullover','Dumbbell Pullover','dumbbell','back'),
 ('machine-seated-leg-curl','Seated Leg Curl','machine','hamstrings'),
 ('machine-hack-squat','Hack Squat Machine','machine','quads'),
 ('machine-chest-press','Machine Chest Press','machine','chest'),
 ('machine-incline-chest-press','Incline Chest Press Machine','machine','chest'),
 ('machine-shoulder-press','Machine Shoulder Press','machine','shoulders'),
 ('machine-lat-pulldown','Machine Lat Pulldown','machine','back'),
 ('machine-assisted-pull-up','Assisted Pull-Up Machine','machine','back'),
 ('machine-pec-deck','Pec Deck','machine','chest'),
 ('machine-reverse-pec-deck','Reverse Pec Deck','machine','shoulders'),
 ('machine-seated-calf-raise','Seated Calf Raise','machine','calves'),
 ('machine-hip-abductor','Hip Abductor Machine','machine','glutes'),
 ('machine-hip-adductor','Hip Adductor Machine','machine','glutes'),
 ('machine-glute-kickback','Glute Kickback Machine','machine','glutes'),
 ('machine-back-extension','Back Extension Machine','machine','back'),
 ('cable-low-row','Cable Low Row','cable','back'),
 ('cable-biceps-curl','Cable Biceps Curl','cable','biceps'),
 ('cable-rope-hammer-curl','Cable Rope Hammer Curl','cable','biceps'),
 ('cable-overhead-triceps-extension','Cable Overhead Triceps Extension','cable','triceps'),
 ('cable-chest-fly','Cable Chest Fly','cable','chest'),
 ('cable-crossover','Cable Crossover','cable','chest'),
 ('cable-straight-arm-pulldown','Cable Straight-Arm Pulldown','cable','back'),
 ('cable-pull-through','Cable Pull-Through','cable','glutes'),
 ('cable-glute-kickback','Cable Glute Kickback','cable','glutes'),
 ('cable-crunch','Cable Crunch','cable','core'),
 ('cable-pallof-press','Cable Pallof Press','cable','core'),
 ('cable-woodchop','Cable Woodchop','cable','core'),
 ('cable-reverse-fly','Cable Reverse Fly','cable','shoulders'),
 ('bodyweight-chin-up','Chin-Up','bodyweight','back'),
 ('bodyweight-dip','Dip','bodyweight','triceps'),
 ('bodyweight-bulgarian-split-squat','Bulgarian Split Squat','bodyweight','quads'),
 ('bodyweight-reverse-lunge','Reverse Lunge','bodyweight','quads'),
 ('bodyweight-glute-bridge','Glute Bridge','bodyweight','glutes'),
 ('bodyweight-single-leg-glute-bridge','Single-Leg Glute Bridge','bodyweight','glutes'),
 ('bodyweight-calf-raise','Calf Raise','bodyweight','calves'),
 ('bodyweight-mountain-climber','Mountain Climber','bodyweight','core'),
 ('bodyweight-burpee','Burpee','bodyweight','full_body'),
 ('bodyweight-pike-push-up','Pike Push-Up','bodyweight','shoulders'),
 ('bodyweight-crunch','Crunch','bodyweight','core'),
 ('bodyweight-side-plank','Side Plank','bodyweight','core'),
 ('bodyweight-pistol-squat','Pistol Squat','bodyweight','quads'),
 ('bodyweight-inverted-row','Inverted Row','bodyweight','back'),
 ('kettlebell-swing','Kettlebell Swing','kettlebell','glutes'),
 ('kettlebell-goblet-squat','Kettlebell Goblet Squat','kettlebell','quads'),
 ('kettlebell-sumo-deadlift','Kettlebell Sumo Deadlift','kettlebell','glutes'),
 ('kettlebell-clean-and-press','Kettlebell Clean and Press','kettlebell','shoulders'),
 ('kettlebell-snatch','Kettlebell Snatch','kettlebell','full_body'),
 ('kettlebell-turkish-get-up','Kettlebell Turkish Get-Up','kettlebell','core'),
 ('kettlebell-one-arm-row','Kettlebell One-Arm Row','kettlebell','back'),
 ('kettlebell-reverse-lunge','Kettlebell Reverse Lunge','kettlebell','quads'),
 ('kettlebell-floor-press','Kettlebell Floor Press','kettlebell','chest'),
 ('kettlebell-farmer-carry','Kettlebell Farmer Carry','kettlebell','forearms'),
 ('kettlebell-high-pull','Kettlebell High Pull','kettlebell','shoulders'),
 ('kettlebell-windmill','Kettlebell Windmill','kettlebell','core'),
 ('smith-machine-squat','Smith Machine Squat','smith_machine','quads'),
 ('smith-machine-flat-bench-press','Smith Machine Bench Press','smith_machine','chest'),
 ('smith-machine-incline-bench-press','Smith Machine Incline Bench Press','smith_machine','chest'),
 ('smith-machine-shoulder-press','Smith Machine Shoulder Press','smith_machine','shoulders'),
 ('smith-machine-bent-over-row','Smith Machine Bent-Over Row','smith_machine','back'),
 ('smith-machine-hip-thrust','Smith Machine Hip Thrust','smith_machine','glutes'),
 ('smith-machine-calf-raise','Smith Machine Calf Raise','smith_machine','calves'),
 ('smith-machine-reverse-lunge','Smith Machine Reverse Lunge','smith_machine','quads'),
 ('smith-machine-close-grip-bench','Smith Machine Close-Grip Bench Press','smith_machine','triceps'),
 ('smith-machine-shrug','Smith Machine Shrug','smith_machine','traps'),
 ('band-seated-row','Resistance Band Seated Row','resistance_band','back'),
 ('band-pull-apart','Band Pull-Apart','resistance_band','shoulders'),
 ('band-chest-press','Resistance Band Chest Press','resistance_band','chest'),
 ('band-face-pull','Resistance Band Face Pull','resistance_band','shoulders'),
 ('band-biceps-curl','Resistance Band Biceps Curl','resistance_band','biceps'),
 ('band-triceps-extension','Resistance Band Triceps Extension','resistance_band','triceps'),
 ('band-squat','Resistance Band Squat','resistance_band','quads'),
 ('band-lateral-walk','Resistance Band Lateral Walk','resistance_band','glutes'),
 ('band-glute-kickback','Resistance Band Glute Kickback','resistance_band','glutes'),
 ('band-deadlift','Resistance Band Deadlift','resistance_band','hamstrings'),
 ('ez-bar-curl','EZ-Bar Curl','ez_bar','biceps'),
 ('ez-bar-preacher-curl','EZ-Bar Preacher Curl','ez_bar','biceps'),
 ('ez-bar-skull-crusher','EZ-Bar Skull Crusher','ez_bar','triceps'),
 ('ez-bar-close-grip-bench','EZ-Bar Close-Grip Bench Press','ez_bar','triceps'),
 ('ez-bar-upright-row','EZ-Bar Upright Row','ez_bar','shoulders'),
 ('ez-bar-reverse-curl','EZ-Bar Reverse Curl','ez_bar','forearms'),
 ('ez-bar-overhead-triceps-extension','EZ-Bar Overhead Triceps Extension','ez_bar','triceps'),
 ('ez-bar-front-raise','EZ-Bar Front Raise','ez_bar','shoulders'),
 ('trap-bar-deadlift','Trap-Bar Deadlift','trap_bar','hamstrings'),
 ('trap-bar-farmer-carry','Trap-Bar Farmer Carry','trap_bar','forearms'),
 ('trap-bar-shrug','Trap-Bar Shrug','trap_bar','traps'),
 ('trap-bar-jump-squat','Trap-Bar Jump Squat','trap_bar','quads'),
 ('trap-bar-romanian-deadlift','Trap-Bar Romanian Deadlift','trap_bar','hamstrings'),
 ('trap-bar-high-handle-deadlift','Trap-Bar High-Handle Deadlift','trap_bar','glutes'),
 ('trap-bar-split-squat','Trap-Bar Split Squat','trap_bar','quads'),
 ('trap-bar-calf-carry','Trap-Bar Loaded Carry','trap_bar','calves'),
 ('medicine-ball-slam','Medicine-Ball Slam','medicine_ball','full_body'),
 ('medicine-ball-wall-ball-squat','Medicine-Ball Wall-Ball Squat','medicine_ball','quads'),
 ('medicine-ball-rotational-throw','Medicine-Ball Rotational Throw','medicine_ball','core'),
 ('medicine-ball-chest-pass','Medicine-Ball Chest Pass','medicine_ball','chest'),
 ('medicine-ball-russian-twist','Medicine-Ball Russian Twist','medicine_ball','core'),
 ('medicine-ball-overhead-throw','Medicine-Ball Overhead Throw','medicine_ball','shoulders'),
 ('medicine-ball-rotational-lunge','Medicine-Ball Rotational Lunge','medicine_ball','quads'),
 ('medicine-ball-v-up','Medicine-Ball V-Up','medicine_ball','core'),
 ('suspension-trainer-row','Suspension Trainer Row','suspension_trainer','back'),
 ('suspension-trainer-chest-press','Suspension Trainer Chest Press','suspension_trainer','chest'),
 ('suspension-trainer-hamstring-curl','Suspension Trainer Hamstring Curl','suspension_trainer','hamstrings'),
 ('suspension-trainer-assisted-squat','Suspension Trainer Assisted Squat','suspension_trainer','quads'),
 ('suspension-trainer-atomic-push-up','Suspension Trainer Atomic Push-Up','suspension_trainer','core'),
 ('suspension-trainer-biceps-curl','Suspension Trainer Biceps Curl','suspension_trainer','biceps'),
 ('suspension-trainer-triceps-extension','Suspension Trainer Triceps Extension','suspension_trainer','triceps'),
 ('suspension-trainer-mountain-climber','Suspension Trainer Mountain Climber','suspension_trainer','core'),
 ('landmine-press','Landmine Press','landmine','shoulders'),
 ('landmine-row','Landmine Row','landmine','back'),
 ('landmine-squat','Landmine Squat','landmine','quads'),
 ('landmine-romanian-deadlift','Landmine Romanian Deadlift','landmine','hamstrings'),
 ('landmine-rotation','Landmine Rotation','landmine','core'),
 ('landmine-split-squat','Landmine Split Squat','landmine','quads'),
 ('landmine-one-arm-press','Landmine One-Arm Press','landmine','shoulders'),
 ('landmine-meadows-row','Landmine Meadows Row','landmine','back')
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    equipment = EXCLUDED.equipment,
    primary_muscle = EXCLUDED.primary_muscle;

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
