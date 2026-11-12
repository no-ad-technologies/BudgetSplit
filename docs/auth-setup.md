# Sign-in setup (US-01)

BudgetSplit signs people in with Firebase Authentication. The API only verifies the tokens Firebase
issues (ADR 0007), so setup is two values, and neither is a secret.

| Value | Where it goes | Where to find it |
| --- | --- | --- |
| Project ID (e.g. `budgetsplit-1a2b3`) | API: `FIREBASE_PROJECT_ID` | Firebase console → Project settings → General |
| Web API key (`AIza…`) | App: `EXPO_PUBLIC_FIREBASE_API_KEY` | Same page, "Web API key" |

## One-time: create the Firebase project

1. Go to <https://console.firebase.google.com> → **Add project**. Analytics is not needed.
2. **Build → Authentication → Get started → Sign-in method → Email/Password → Enable.**
3. Recommended, same page under **Settings**:
   - **User actions → Email enumeration protection: on** (sign-in errors don't reveal who has an account).
   - **Password policy:** minimum length 8, to match the app's form.
4. Copy the project ID and the Web API key from **Project settings → General**. The Web API key appears
   once Authentication is enabled.

## Deployed API (Render)

1. Dashboard → `budgetsplit-api` → **Environment** → add `FIREBASE_PROJECT_ID` = your project ID.
2. Confirm `AUTH_MODE` is `firebase` and delete `ALLOW_DEV_AUTH_IN_PRODUCTION` if it is still listed
   (`render.yaml` no longer sets it, but Render keeps variables that were added earlier).

Do step 1 **before** merging the US-01 pull request. Without the project id the new version refuses to
start; Render then keeps the previous version running and marks the deploy failed.

## The app

```bash
# apps/mobile/.env.local
EXPO_PUBLIC_API_URL=https://budgetsplit-api.onrender.com
EXPO_PUBLIC_FIREBASE_API_KEY=AIza...
```

Restart `npm run dev:mobile` after changing `.env.local`. The app shows the sign-in screen; "Create an
account" makes a Firebase user, and the first API call creates the matching row in `users`.

## Local development without Firebase

Leave `EXPO_PUBLIC_FIREBASE_API_KEY` unset and run the API with `AUTH_MODE=dev` (the default in
`.env.example`). The app skips sign-in and acts as the seeded user in `EXPO_PUBLIC_DEV_USER_ID`.
To test real sign-in locally, set `AUTH_MODE=firebase` and `FIREBASE_PROJECT_ID` in `apps/api/.env`
and the API key in the app.

## Checking it works

```bash
# No token: 401
curl -i https://budgetsplit-api.onrender.com/users/me

# The old dev header: also 401
curl -i https://budgetsplit-api.onrender.com/users/me -H "X-User-Id: 11111111-1111-4111-8111-111111111111"

# A real token (sign in through Firebase's REST API, then call ours)
TOKEN=$(curl -s "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=$FIREBASE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"your-password","returnSecureToken":true}' | jq -r .idToken)
curl https://budgetsplit-api.onrender.com/users/me -H "Authorization: Bearer $TOKEN"
```
