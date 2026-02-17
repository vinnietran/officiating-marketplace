# Firebase Setup

1. Open Firebase Console for `officiating-marketplace-487319`.
2. Go to Authentication -> Sign-in method -> enable `Email/Password`.
3. Go to Firestore Database -> create database (Native mode).
   - Recommended database ID: `(default)`.
   - If you created a custom DB ID instead, set `VITE_FIRESTORE_DATABASE_ID=<your-db-id>` in `.env.local`.
4. In Firestore Rules, paste contents of `firestore.rules` and publish.
5. Run the app:
   - `npm install`
   - `npm run dev`

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
