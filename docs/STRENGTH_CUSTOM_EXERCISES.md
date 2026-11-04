# Strength exercise library API

The Gym workout screen combines the shared exercise catalog with exercises created by the signed-in user. Custom entries are stored in PostgreSQL and are scoped to their owner. The schema changes are applied by the backend's existing startup migration.

All routes below are under `/api/v1/strength`.

## List shared exercises

`GET /exercises`

Optional query parameters: `equipment`, `muscle`, and `q` (searches name and muscle). Shared exercises are readable without authentication.

## List my exercises

`GET /my-exercises`

Requires `Authorization: Bearer <JWT>`. Returns the caller's custom exercise metadata and a `hasImage` flag.

## Create a custom exercise

`POST /exercises`

Requires a bearer token. JSON body:

```json
{
  "name": "Single-arm floor press",
  "equipment": "dumbbell",
  "primaryMuscle": "chest",
  "secondaryMuscles": ["triceps", "shoulders"],
  "description": "Controlled press from the floor.",
  "instructions": ["Lie on the floor with a dumbbell.", "Press up, then lower with control."],
  "imageBase64": "<optional base64 image>",
  "imageMime": "image/jpeg"
}
```

Allowed equipment values match the app's equipment selector. Images are optional JPEG, PNG, or WebP and are capped at 500 KB after decoding. The API validates the image bytes and stores them with the exercise record.

## Read exercise details

`GET /exercises/:exerciseId`

Requires a bearer token. Shared exercises are readable by signed-in users; custom exercises are returned only to their owner. The response contains description, muscle groups, instructions, and image data when present.

Workout submission also checks ownership of every custom exercise ID, so another user's exercise cannot be added to a workout.
