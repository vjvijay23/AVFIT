# Strava connection setup

AVFIT uses Strava OAuth on the backend. The client secret and per-user tokens never go into the Android app.

## Strava developer app

1. Create/register the AVFIT integration at <https://www.strava.com/settings/api>.
2. Set **Authorization Callback Domain** to the hostname that serves the backend callback (for the deployed API: `avfit-api.onrender.com`).
3. Configure the exact callback URL in Render and locally:
   - Render: `https://avfit-api.onrender.com/api/v1/strava/callback`
   - Local: `http://10.0.2.2:5000/api/v1/strava/callback` for the Android emulator (use `http://localhost:5000/api/v1/strava/callback` for a desktop browser).
4. Set backend environment values:
   - `STRAVA_CLIENT_ID` — Strava application ID.
   - `STRAVA_CLIENT_SECRET` — secret from the Strava app settings.
   - `STRAVA_REDIRECT_URI` — exact callback URL configured above.
   - `STRAVA_TOKEN_ENCRYPTION_KEY` — a random secret of at least 32 characters, used to encrypt stored Strava access and refresh tokens.
5. Deploy/restart the backend. Open AVFIT Home, connect Strava, approve the requested activity-read access, return to AVFIT, and press **Sync**.

AVFIT requests `activity:read_all` so the account owner can sync private activities too. The app imports the latest 30 activities and stores them independently from AVFIT-recorded workouts. Strava's default new-app athlete capacity may be one account until access is increased or approved.

Never put the client secret or encryption key in mobile `.env`, source control, screenshots, or chat. If changing the encryption key, first disconnect existing Strava accounts; previously stored tokens cannot be decrypted with a replacement key.
