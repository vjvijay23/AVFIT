# AVFIT Full-Stack Backend Service
### Live Walking GPS Analyzer (Strava-style) & Multimodal Food Vision (Gemini AI)

## Mock API tests

Run the API tests without connecting to PostgreSQL or Redis:

```powershell
npm run test:mock
```

The suite uses Fastify's in-memory request injector and stubs database, Redis,
and selected service calls. It covers health behavior, OTP/JWT login, workout
catalogue, walking leaderboard, authorization and ownership checks, activity
recording, and meal validation. It does not create or modify live database rows.

A high-performance TypeScript backend powered by **Fastify**, **PostgreSQL with PostGIS** for spatial GPS trajectories, **Redis** for sub-millisecond leaderboards, and **Google Gemini Flash** for nutritional computer vision.

---

## 🚀 Quick Start

### 1. Start Database & Cache Containers
```bash
cd backend
docker compose up -d
```
* **PostgreSQL + PostGIS**: `localhost:5433` (DB: `avfit_db`, User: `postgres`, Password: `postgrespassword`)
* **Redis**: `localhost:6379`

### 2. Start Fastify Backend
```bash
npm run dev
```
The server will automatically apply PostGIS migrations and launch on `http://localhost:5000`.

### 3. Interactive Swagger API Docs
Open in your browser:
👉 **[http://localhost:5000/documentation](http://localhost:5000/documentation)**

---

## 📡 API Endpoints

### 🏃 1. Live Walking & GPS Analyzer (`/api/v1/activities`)
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/activities/record` | Save a completed walk with full GPS coordinates, PostGIS `LINESTRING`, pace, and elevation. |
| `GET` | `/api/v1/activities/user/:userId` | Get activity history with GeoJSON route lines. |
| `GET` | `/api/v1/activities/:id` | Get single activity with high-resolution GPS coordinate stream. |

### 🥗 2. AI Food Vision Scanner (`/api/v1/vision`)
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/vision/scan-food` | Send food base64 image; returns dish name, estimated grams, calories, carbs, protein, fat, fiber, health tips, and ingredients. (Results cached in Redis via image SHA-256 hash). |

### 🏆 3. Strava-style Leaderboard (`/api/v1/leaderboard`)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1/leaderboard/walking?timeframe=alltime` | Top distance walkers ranked in real-time via Redis Sorted Sets. |
| `POST` | `/api/v1/leaderboard/steps` | Sync daily steps to the leaderboard. |

### 🔑 4. Phone OTP Authentication (`/api/v1/auth`)
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/auth/otp/send` | By default, ask Twilio Verify to send an SMS code. In explicitly enabled local mock mode, return a temporary development code and send no SMS. |
| `POST` | `/api/v1/auth/otp/verify` | Validate with Twilio (default) or the temporary local mock challenge, then return a 7-day JWT + profile. |
| `GET` | `/api/v1/auth/profile/:id` | Get user profile and active streaks. |

## Expanded API

All routes below that change or expose personal data require `Authorization: Bearer <token>`. By default, obtain a token by requesting an SMS code and submitting the code actually received. OTP send and verification fail closed unless Twilio Verify is configured. Local development can opt into an ephemeral mock OTP as described below. Never commit provider credentials or use development JWT secrets in production.

| Method | Endpoint | Purpose |
|---|---|---|
| `PATCH` | `/api/v1/auth/profile` | Update your profile fields. |
| `GET`, `PUT` | `/api/v1/fitness/profile` | Read or save your onboarding profile; BMR, TDEE, macros, and hydration targets are calculated by the server. |
| `GET` | `/api/v1/fitness/dashboard` | Today's activity/nutrition totals, completed workout count, and targets. |
| `GET`, `POST`, `PUT` | `/api/v1/meals` and `/api/v1/meals/:id` | Meal history, manual meal entry, and editing. |
| `GET` | `/api/v1/workouts` | Curated workout catalog, optionally filtered by category/difficulty. |
| `GET` | `/api/v1/workouts/logs` | Your workout history. |
| `POST` | `/api/v1/workouts/complete` | Log a completed workout. |
| `GET` | `/api/v1/achievements/catalog` | Achievement definitions. |
| `GET` | `/api/v1/achievements/me` | Your progress, unlocked achievements, and point summary. |
| `GET`, `POST` | `/api/v1/community/posts` | Feed and create a post. |
| `POST` | `/api/v1/community/posts/:id/likes` | Like a post (idempotent). |
| `GET`, `POST` | `/api/v1/community/posts/:id/comments` | Read and add comments. |
| `GET`, `POST` | `/api/v1/community/challenges` | Browse or create challenges. |
| `POST` | `/api/v1/community/challenges/:id/join` | Join an active challenge. |
| `GET` | `/api/v1/community/challenges/:id/leaderboard` | See participant progress. |
| `POST` | `/api/v1/community/users/:id/follow` | Follow a profile. |
| `GET` | `/api/v1/community/users/me/following` | List profiles you follow. |
| `GET` | `/api/v1/leaderboard/steps` | Today's step rankings. |

## Local setup

1. Create a Twilio Verify service in your Twilio Console. In `backend`, copy `.env.example` to `.env`, set `TWILIO_VERIFY_SERVICE_SID`, and preferably set `TWILIO_API_KEY_SID` plus `TWILIO_API_KEY_SECRET` from a Standard API key created in the same Twilio account and region. Alternatively set `TWILIO_ACCOUNT_SID` plus `TWILIO_AUTH_TOKEN`. Phone numbers must include the country code in E.164 form, for example `+919876543210`. Twilio trial accounts may restrict delivery to verified recipient numbers.
2. Set `GEMINI_API_KEY` if you want live food analysis.
3. Run `npm ci`.
4. Run `docker compose up -d` to start PostgreSQL/PostGIS and Redis.
5. Run `npm run dev`. Startup applies the idempotent schema and seeds a small workout catalog.
6. Open `http://localhost:5000/documentation`; check `http://localhost:5000/health` for dependency status.

### Local OTP testing without paid Twilio SMS

Set `OTP_PROVIDER=mock` in `backend/.env` and keep `NODE_ENV=development`, then restart the backend. Signup/login will show a randomly generated 6-digit development code in the app; no SMS is sent. The code expires after five minutes, allows at most five attempts, and is held only in backend memory. Request a new code after a backend restart. `OTP_PROVIDER` defaults to `twilio`, and the backend refuses to start in production if mock mode is selected. Remove `OTP_PROVIDER=mock` (or set it to `twilio`) to return to real Twilio Verify.

## PowerShell smoke test

Run these from a second PowerShell window after the server is up. Use a fresh phone number if you want a fresh account. Keep the same window open so `$token`, `$userId`, and IDs remain defined.

```powershell
$base = 'http://localhost:5000/api/v1'
$phone = '+15551234567'
Invoke-RestMethod -Method Post -Uri "$base/auth/otp/send" -ContentType 'application/json' -Body (@{phone=$phone} | ConvertTo-Json)
$otp = Read-Host 'Enter the code received by SMS'
$login = Invoke-RestMethod -Method Post -Uri "$base/auth/otp/verify" -ContentType 'application/json' -Body (@{phone=$phone;otp=$otp;fullName='Test Athlete'} | ConvertTo-Json)
$token = $login.token
$userId = $login.user.id
$headers = @{Authorization="Bearer $token"}
```

Then exercise each subsystem:

```powershell
# Profile and onboarding targets
Invoke-RestMethod -Method Patch -Uri "$base/auth/profile" -Headers $headers -ContentType 'application/json' -Body (@{gender='male';dateOfBirth='1995-01-01';country='US'} | ConvertTo-Json)
$fitness = Invoke-RestMethod -Method Put -Uri "$base/fitness/profile" -Headers $headers -ContentType 'application/json' -Body (@{heightCm=178;weightKg=75;fitnessGoal='general_fitness';activityLevel='moderately_active';dietaryPreference='non_vegetarian'} | ConvertTo-Json)
Invoke-RestMethod -Uri "$base/fitness/dashboard" -Headers $headers

# Meals, workouts, and achievements
$meal = Invoke-RestMethod -Method Post -Uri "$base/meals" -Headers $headers -ContentType 'application/json' -Body (@{dishName='Test oats';calories=350;proteinG=18;carbsG=55;fatG=8;mealType='breakfast'} | ConvertTo-Json)
Invoke-RestMethod -Uri "$base/meals" -Headers $headers
$catalog = Invoke-RestMethod -Uri "$base/workouts"
$workoutId = $catalog.workouts[0].id
Invoke-RestMethod -Method Post -Uri "$base/workouts/complete" -Headers $headers -ContentType 'application/json' -Body (@{workoutId=$workoutId;durationSeconds=900} | ConvertTo-Json)
Invoke-RestMethod -Uri "$base/workouts/logs" -Headers $headers
Invoke-RestMethod -Uri "$base/achievements/me" -Headers $headers

# Steps and leaderboard
Invoke-RestMethod -Method Post -Uri "$base/leaderboard/steps" -Headers $headers -ContentType 'application/json' -Body (@{userId=$userId;steps=6500} | ConvertTo-Json)
Invoke-RestMethod -Uri "$base/leaderboard/steps" -Headers $headers

# Activity (routeCoordinates use longitude/latitude points)
$activity = @{userId=$userId;sportType='walking';title='Test walk';durationSec=900;distanceKm=1.2;calories=65;avgPace='12:30';routeCoordinates=@(@{latitude=37.7749;longitude=-122.4194;timestamp=1790000000000},@{latitude=37.7759;longitude=-122.4184;timestamp=1790000060000})} | ConvertTo-Json -Depth 5
Invoke-RestMethod -Method Post -Uri "$base/activities/record" -Headers $headers -ContentType 'application/json' -Body $activity
Invoke-RestMethod -Uri "$base/activities/user/$userId" -Headers $headers

# Feed and challenge
$post = Invoke-RestMethod -Method Post -Uri "$base/community/posts" -Headers $headers -ContentType 'application/json' -Body (@{content='Testing the AVFIT backend';postType='general'} | ConvertTo-Json)
Invoke-RestMethod -Method Post -Uri "$base/community/posts/$($post.post.id)/likes" -Headers $headers
Invoke-RestMethod -Method Post -Uri "$base/community/posts/$($post.post.id)/comments" -Headers $headers -ContentType 'application/json' -Body (@{content='Nice test'} | ConvertTo-Json)
$today = (Get-Date).ToString('yyyy-MM-dd')
$tomorrow = (Get-Date).AddDays(1).ToString('yyyy-MM-dd')
$challenge = Invoke-RestMethod -Method Post -Uri "$base/community/challenges" -Headers $headers -ContentType 'application/json' -Body (@{title='Smoke test';description='Local API check';targetMetric='steps';targetValue=1000;startDate=$today;endDate=$tomorrow} | ConvertTo-Json)
Invoke-RestMethod -Method Post -Uri "$base/community/challenges/$($challenge.challenge.id)/join" -Headers $headers
Invoke-RestMethod -Uri "$base/community/challenges/$($challenge.challenge.id)/leaderboard" -Headers $headers
```

To verify access control, repeat a protected call without `$headers`; it should return `401`. To verify ownership, create a second account and try to read the first account's `/auth/profile/:id` or `/activities/user/:userId`; it should return `403`. `POST /vision/scan-food` accepts `{imageBase64,mimeType}`; without `GEMINI_API_KEY` it returns a deterministic demo meal, while still recording it under the authenticated user.
