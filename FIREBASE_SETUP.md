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

## Data Model

- `userProfiles/{uid}`
  - `uid`, `email`, `displayName`, `role`, `createdAtISO`

- `games/{gameId}`
  - `schoolName`, `sport`, `level`, `dateISO`, `acceptingBidsUntilISO?`, `location`, `payPosted`, `notes?`
  - `createdByUid`, `createdByRole`, `createdAtISO`, `status`, `selectedBidId?`

- `bids/{bidId}`
  - `gameId`, `officialUid`, `officialName`, `amount`, `message?`, `createdAtISO`
