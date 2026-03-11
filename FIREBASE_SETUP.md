# Firebase Setup

1. Open Firebase Console for `officiating-marketplace-487319`.
2. Go to Authentication -> Sign-in method -> enable `Email/Password`.
3. Go to Firestore Database -> create database (Native mode).
   - Recommended database ID: `(default)`.
   - If you created a custom DB ID instead, set `VITE_FIRESTORE_DATABASE_ID=<your-db-id>` in `.env.local`.
4. Deploy the callable Functions API from this repo:
   - `npm install`
   - `npm --prefix functions install`
   - `firebase deploy --only functions`
5. Run the web app:
   - `npm install`
   - `npm run dev`

## Functions Configuration

- The web client now talks to Firebase Functions instead of reading or writing Firestore directly.
- The Functions package lives in `functions/`.
- If you use a non-default Firestore database ID in production, set `FIRESTORE_DATABASE_ID=<your-db-id>` for the Functions runtime and `VITE_FIRESTORE_DATABASE_ID=<your-db-id>` for the web client.
- If you want to use the local Functions emulator in development, set these in `.env.local`:
  - `VITE_USE_FUNCTIONS_EMULATOR=true`
  - `VITE_FUNCTIONS_EMULATOR_HOST=127.0.0.1`
  - `VITE_FUNCTIONS_EMULATOR_PORT=5001`
  - `VITE_FIREBASE_FUNCTIONS_REGION=us-central1`

## Optional: Google Places Autocomplete

If you want address autocomplete on `Post a Game`:
1. In Google Cloud Console, enable **Maps JavaScript API** and **Places API**.
2. Create or reuse a browser API key.
3. Add to `.env.local`:
   - `VITE_GOOGLE_MAPS_API_KEY=<your_api_key>`
4. Restart `npm run dev`.

## Data Model

- `userProfiles/{uid}`
  - `uid`, `email`, `displayName`, `role`, `createdAtISO`
  - `levelsOfficiated?`: array of `Varsity | Sub Varsity | NCAA DI | NCAA DII | NCAA DIII`
  - `contactInfo?`: `{ addressLine1?, addressLine2?, city?, state?, postalCode? }`

- `games/{gameId}`
  - `schoolName`, `sport`, `level`, `dateISO`, `acceptingBidsUntilISO?`, `location`, `payPosted`, `notes?`
  - `createdByUid`, `createdByRole`, `createdAtISO`, `status`, `selectedBidId?`

- `bids/{bidId}`
  - `gameId`, `officialUid`, `officialName`, `amount`, `message?`, `createdAtISO`

## Notes

- `firestore.rules` is no longer the primary enforcement point for application authorization. The callable Functions layer now validates roles and ownership before every read and write.
- Mobile and other clients can reuse the same callable Functions endpoints introduced in this repo.
