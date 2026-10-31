# AVFIT Full-Stack Backend Service
### Live Walking GPS Analyzer (Strava-style) & Multimodal Food Vision (Gemini AI)

## API tests

The isolated API checks use in-memory database/provider stubs and do not write
to a real database. Run them with:

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
| `POST` | `/api/v1/vision/scan-food` | Send a food photo as base64; returns estimated calories, macros, fiber, sugar, saturated fat, sodium, cholesterol, confidence, and ingredients. Results are cached by image hash. |
| `POST` | `/api/v1/diet-plans/generate` | Generate and persist a personalized 7-day plan from the signed-in user's goals, body details, calorie/macro targets, restrictions, and recent meal history. Optional `{ "focus": "quick vegetarian lunches" }`. |
| `GET` | `/api/v1/diet-plans/latest` | Fetch the signed-in user's most recently saved plan. |

Diet-plan context is intentionally modular: add a `DietPlanContextProvider` in `src/services/diet-plan.service.ts` to include a future source (such as community meal suggestions). Each provider has a name and returns context for the authenticated user; the source names are saved with each generated plan for traceability.

### 🏆 3. Strava-style Leaderboard (`/api/v1/leaderboard`)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1/leaderboard/walking?timeframe=alltime` | Top distance walkers ranked in real-time via Redis Sorted Sets. |
| `POST` | `/api/v1/leaderboard/steps` | Sync daily steps to the leaderboard. |

### 🔑 4. Phone OTP Authentication (`/api/v1/auth`)
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/auth/otp/verify` | Validate the access token returned by the MSG91 OTP widget, match its verified phone to the requested phone, then return a 7-day JWT + PostgreSQL profile. |
| `GET` | `/api/v1/auth/otp/user-exists?identifier=<phone>` | Privacy-preserving MSG91 widget user-existence callback. |
| `GET` | `/api/v1/auth/profile/:id` | Get user profile and active streaks. |

## Expanded API

All routes below that change or expose personal data require `Authorization: Bearer <token>`. The app sends and checks the SMS through the MSG91 client widget; the backend validates MSG91's returned access token against MSG91 and only then reads or writes the real PostgreSQL profile. There is no OTP mock or alternate provider. Never commit provider credentials or use development JWT secrets in production.

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

1. In `backend`, copy `.env.example` to `.env` and set `MSG91_AUTHKEY` to the Authkey for the same MSG91 account that owns the client widget. The Android app reads `AVFIT_MSG91_MOBILE_WIDGET_ID` and `AVFIT_MSG91_MOBILE_TOKEN_AUTH` from the app's `.env`; the optional web client reads `AVFIT_MSG91_WEB_WIDGET_ID` and `AVFIT_MSG91_WEB_TOKEN_AUTH`. The widget must allow the matching client platform and use a six-digit code.
2. Set `GEMINI_API_KEY` in the backend environment for food photo analysis and diet-plan generation. Never put it in the mobile app's `.env` or APK.
3. Run `npm ci`.
4. Run `docker compose up -d` to start PostgreSQL/PostGIS and Redis.
5. Run `npm run dev`. Startup applies the schema. It does not create demo user records.
6. Open `http://localhost:5000/documentation`; check `http://localhost:5000/health` for PostgreSQL and Redis status.

### Test against the configured MSG91 and database

Use a real phone number you control. In the app, sign up or log in; MSG91 sends the OTP directly to that number. Enter the received code in the app. The backend checks the widget's access token with MSG91 and then looks up the profile using the normalized phone number. It creates a profile only for a signup with valid name, birth date, and gender; login never creates a missing account. No test profile is seeded. A real OTP request sends an SMS and may consume MSG91 account quota.

Check the backend and database connection without changing rows:

```powershell
$health = Invoke-RestMethod 'http://localhost:5000/health'
$health | Select-Object status, postgres, redis, otpProvider
```

To inspect the actual account after signing in, use the PostgreSQL console without inserting test rows:

```sql
SELECT id, phone, full_name, date_of_birth, gender, created_at, updated_at
FROM profiles
ORDER BY created_at DESC;
```

For Render, use the deployed `/health` URL and the Render PostgreSQL console. Never paste a production database URL or provider secret into source control or a client build.

To verify the existing user's record without modifying it, inspect the matching phone in PostgreSQL and confirm that the profile shown after login has the same name, DOB, gender, and onboarding state. For other data routes, use the signed-in app to read the account's existing history first; do not replay write requests against production as test fixtures. `POST /vision/scan-food` accepts `{imageBase64,mimeType}`. Without `GEMINI_API_KEY`, AI endpoints return `503` and do not create fake results.
