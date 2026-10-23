# Community setup

The app is configured for project `hmofmufudjbgyvgeafwm`. The shipped publishable key is public; database policies control access. No admin or Discord secret belongs in the app.

## 1. Create the profiles table

Open your project's **SQL Editor**, choose **New query**, paste the complete contents of `supabase/migrations/202610230001_community_profiles.sql`, and run it once.

This allows signed-in members to read profiles and edit only their own. Signed-out users cannot access profiles. Account email, Discord tokens, listening history, audio files and projects are not stored in this table. Usernames are unique. Creation dates cannot be edited by clients.

## 2. Enable Discord

1. Open https://discord.com/developers/applications and select your Visualiser Studio application (or create one).
2. Under **OAuth2 → Redirects**, add exactly:
   `https://hmofmufudjbgyvgeafwm.supabase.co/auth/v1/callback`
3. Copy the application's **Client ID** and **Client Secret** into **Supabase → Authentication → Sign In / Providers → Discord**. Enable Discord and save. Enter the secret directly in the dashboard; don't send it in chat.
4. Under **Supabase → Authentication → URL Configuration**, add this **Redirect URL**:
   `http://127.0.0.1:*/community/callback/*`
   The desktop app binds only to the loopback address, using an available port and a random callback path for every attempt. PKCE ties the code to that app session.
5. Set **Site URL** to `https://malchim.malabobski.workers.dev/`. The desktop flow supplies its own redirect URL.

Discord's redirect goes to Supabase; Supabase's redirect goes back to the desktop app. These are deliberately different addresses.

## 3. Try it

Open the desktop app, select **Community**, and choose **Continue with Discord**. Complete sign-in in your browser. Back in the app, choose a username and save your profile. Restart the app to check that sign-in is remembered, then test sign-out. On another account, try taking the same username: it must be rejected.

Sessions are encrypted using the OS credential store. If secure storage isn't available, sign-in lasts for the running session only. Access and refresh tokens are never sent through the renderer bridge. Cancelled or abandoned logins expire after five minutes.

## Friends update

Run `supabase/migrations/202610230002_community_friends.sql` in a new SQL Editor query after the profiles setup. This adds friends and request functions without changing existing profiles. It is safe to run this second migration again.

Restart the development app. Community now includes **Friends**, **Requests**, and **Add friends**. Search for another account's username (at least three characters), send a request, then accept or decline from the recipient account. The sender can cancel a pending request; either friend can remove an accepted friendship. Removing a friend asks for inline confirmation. The list refreshes when Community is opened, when the app regains focus, and every 30 seconds while Community is visible.

Request details are visible only to the two members involved. Database functions enforce sender identity, recipient-only acceptance, and one relationship per pair in either direction. No client can directly insert, modify or delete friendship rows. No online status or listening activity is shared.

No paid plan, installer build or release is required for this setup. Account deletion can be handled in Authentication → Users until a secured server-side deletion flow is added.

## Username cooldown and self search

Run `supabase/migrations/202610230003_username_cooldown.sql` in the SQL Editor after the first two migrations. It is safe to run again and preserves profiles and friends.

After changing their username, members must wait one calendar month before changing it again. Existing profiles may make their first change immediately; choosing the initial username doesn't start a cooldown. Display names and bios can still be edited. The database enforces the limit and prevents clients from clearing or changing the timestamp. The profile editor shows the next available date.

Search now includes the current member's profile. Its Add friend button stays inactive and shows “you cant add yourself, silly!” on hover. The database continues to reject self requests.

## Community feed

Run `supabase/migrations/202610230004_community_feed.sql` after the first three migrations, then restart the development app. It preserves profiles, usernames and friends and is safe to run again.

The feed supports text posts (1,000 characters), shared Create looks, and optional signup introductions. Everyone signed into Community can see posts. **Friends** filters the view to your posts and accepted friends; it does not make a post private. New members see an unchecked **Introduce me in the Community feed** option when saving their first profile. The introduction and profile are created together; no announcement is generated for existing users.

Shared looks contain only style, colours, design, parameters and response. Audio, MIDI, automation, image layers and local paths are excluded. Other members can save a shared look into Templates. Own posts can be deleted after confirmation; other members cannot delete them. Posts are limited to one per ten seconds. Older posts use pagination.

Background friends checks keep unchanged nodes and controls in place, preserve scroll and drafts, and stay silent on transient failures once data is loaded. New feed posts appear behind a **Show new posts** button rather than moving the article being read. Logout now asks for confirmation, with **Stay signed in** as the initially focused choice.

## Google sign-in

No SQL update is needed for additional login methods.

1. Open Google Cloud Console → Google Auth Platform. Create/select a project and configure the app's branding and audience. While the app is in testing, add your testing accounts under Audience.
2. Create an **OAuth client ID**, choosing **Web application** (Supabase handles Google's callback).
3. Add the authorised redirect URI:
   `https://hmofmufudjbgyvgeafwm.supabase.co/auth/v1/callback`
4. Enter Google's Client ID and Client Secret directly into **Supabase → Authentication → Sign In / Providers → Google**. Enable and save. Keep the secret out of the app and chat.
5. The existing Supabase loopback redirect URL remains unchanged. Try **Continue with Google** in the app.

Official guide: https://supabase.com/docs/guides/auth/social-sign-in/auth-google

Leaderboards are not implemented yet.

Official references: https://supabase.com/docs/guides/auth/social-sign-in/auth-discord · https://supabase.com/docs/guides/auth/redirect-urls · https://supabase.com/docs/guides/auth/sessions/pkce-flow
