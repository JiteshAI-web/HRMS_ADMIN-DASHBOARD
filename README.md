# Bariflo HR Web Dashboard

Separate React dashboard for the existing Bariflo Firebase project. It reads the existing `users`, `Attendance`, and `location` Realtime Database paths; it does not create or write attendance data. The Flutter applications are not part of this web app.

## Local setup

1. Register a **Web app** in the existing Firebase project (`bariflohrmsapp`). This does not replace either mobile app.
2. Copy the Web SDK settings into `web-dashboard/.env.local` using `.env.example` as a template. Get `VITE_FIREBASE_APP_ID` from the Web app configuration; a mobile app ID is not a substitute.
3. In Firebase Authentication, enable Email/Password and use the existing authorized HR/admin accounts.
4. By default, the email used for initial HR sign-in (`bariflolabs.deploy@gmail.com`) is allowed. To change or add HR accounts, set their comma-separated addresses in `.env.local`:

   ```env
   VITE_HR_ADMIN_EMAILS=bariflolabs.deploy@gmail.com
   ```

   Add multiple addresses separated by commas. This controls which signed-in accounts the UI admits. It is not a substitute for database authorization because browser configuration can be inspected or changed.

5. Configure Realtime Database rules so only authorized HR accounts can read the existing directory, locations, and attendance. Preserve the existing Employee App write rules and Admin App permissions when merging the read permissions; do not replace the project's current rules with a web-only ruleset. The dashboard only requests reads. For stronger server-enforced HR authorization, use Firebase custom claims and check them in the database rules.
6. Run `npm install`, then `npm run dev` from this directory. Use `npm run build` for a production bundle.

The Firebase Web SDK configuration (API key, project ID, app ID, and domain) is client configuration and is visible in a browser bundle by design. Database rules and custom claims provide the actual access control. Do not put passwords, service account credentials, or private keys in `.env.local` or source control.

## Data model used

- `users/{firebaseAuthUid}`: employee profile fields `UID`, `Name`, `Email`, `Designation`, `PhoneNumber`, `Address`, and `allotted_office`.
- `Attendance/{firebaseAuthUid}/{DD-MM-YYYY}/{IN|OUT-HH:mm:ss}`: punch values containing `time` and `office`.
- `location/{officeKey}`: office metadata containing `name` (and the mobile app's coordinates and radius).

Attendance date keys and rendered calendar dates use `Asia/Kolkata`. Punch times remain the `time` strings written by the mobile app and are displayed as stored. Those strings contain no timezone or UTC timestamp, so the dashboard assumes employee devices record punches in India Standard Time; it cannot convert records created in another device timezone. Presence is counted once per employee/day when a valid `IN` punch exists. Currently checked in means the last valid punch for today is `IN`.

## Features

- Live Realtime Database listeners for employee, attendance, and location changes.
- Email/password sign-in, custom-claim access gate, and sign-out.
- Overview cards, monthly attendance trend, employee directory, daily activity search/filter, employee history, and monthly summaries.
- PDF and Excel exports with employee name, employee ID, date, IN/OUT time, office location, and attendance status.
