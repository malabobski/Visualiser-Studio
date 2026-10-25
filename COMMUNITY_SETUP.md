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

## Messages, activity and people’s corners

After 004, paste the complete `supabase/community-social-setup.sql` file into a new Supabase SQL Editor query and run it. This ready-to-run file combines migration 005 with the hourly expiry job setup. Its canonical sources are `supabase/migrations/202610230005_community_social.sql` and `supabase/community-message-expiry.sql`. Supabase Cron uses the database’s built-in scheduler: https://supabase.com/docs/guides/cron . Check **Integrations → Cron** for the `community-dm-expiry` job after setup. Re-running its setup updates the existing named job.

Unread DMs expire after 30 days (hidden immediately at expiry; physically removed by the next hourly job). Message bodies are available only to the recipient through restricted functions. The desktop app encrypts and durably saves incoming messages before acknowledging them; acknowledgment deletes their queued server bodies. Reading an inbox count does not acknowledge anything. Sender copies are saved locally before sending. Retried sends use an idempotency receipt retained up to 30 days, containing IDs and timestamps rather than message text. Unsent local messages offer Retry. Messages are friends-only, up to 2,000 characters; blocking removes the friendship and queued messages in either direction. Blocking does not erase already saved local histories. This is not end-to-end encryption: queued bodies remain readable by the database operator.

History is encrypted using the OS credential store, separately for each signed-in account, and remains on that computer. Reinstalling, deleting app data, changing OS credentials or switching computers can lose access to it. There is no automatic cloud backup or cross-device message history. If secure storage is unavailable or a save fails, the app keeps the server copy and shows an error rather than acknowledging it. Corrupt history files are kept for recovery.

**Your corner → Share activity** starts unchecked. When enabled, friends can see a current activity description, refreshed every 30 seconds; stale descriptions disappear after 90 seconds. Disabling sharing immediately clears the server description. Activity is not written to the feed or retained as listening history. Profiles are still visible to signed-in members, but activity is restricted to accepted friends. Clicking a person’s name or avatar in friends, searches or feed posts opens their corner with relationship-aware actions.

Saved template names now accompany shared looks. No image/audio/MIDI data is included. Users choose a template name when saving locally, including when saving someone else’s shared template.

## Creator tools, badges and notifications

Run the complete `supabase/community-admin-setup.sql` file in Supabase SQL Editor after the social update. It installs migration 006 and binds the single creator role to the UUID of the account currently named **@malchim**, as requested. If that username does not exist, no account receives admin access. After the first successful binding, renaming the account or reusing its previous username never transfers the role, including when setup is rerun. The owner binding and verification tables have no client write grants; badges and all privileged actions are checked in the database.

The creator receives a crown with **Creator / Admin** on hover. Verified users receive a check with **Verified account** on hover. Badges sit directly beside display names in the app’s feed, friends/search lists, profile corners and own account header, and in the website’s feed/account header. Long names shorten to fit while badges remain on the same row. Other clients learn badges through authenticated read functions, not editable profile fields. When signed in as the creator, opening another member’s corner also offers **Add checkmark / Remove checkmark**. Verification for any username, including your own, remains available in Creator tools. Both routes use the same owner-only database function; no new SQL update is needed for the profile shortcut.

**Your corner → Creator tools** in the app, or **Creator tools** next to the account on the website, provides announcements, private notifications addressed to an exact username, and verification controls. Creator-only **Edit**, **Pin/Unpin**, and **Delete** actions appear on feed posts. Editing retains the author and original timestamp, shows an edited marker, and can name older shared templates. Up to five posts can be pinned. Pins and announcements appear in both feed filters. The original feed API remains available for older app versions.

Private notifications appear in the app’s existing achievement notification area; clicking one opens Community, where the full message can be dismissed. On the website they appear above the composer. Only the recipient can retrieve or dismiss them. They remain available until dismissed or 30 days old; the existing hourly message-expiry job now cleans up expired notifications too. Logging out clears queued custom notifications from that app session. Notifications are sent only when the creator confirms the recipient and message.

The website is still manually published. Re-upload `C:/Users/mal/Desktop/index.html` after these changes; changing the local file does not update Cloudflare’s deployed HTML. New shares include `template_name`. Older shares made without that field must be re-shared, or have their name set using the creator’s Edit action.

## Community workspace and browser messages

Community is now a separate website view at `https://malchim.malabobski.workers.dev/#community`. The download page remains the home view. Community navigation exposes Feed, Friends and Messages; on phones these switch between panels instead of extending the download page. Friends includes requests, username search and My corner. Its selected tab expands to show its name; inactive tabs show consistent icons. Clicking your name at the bottom selects My corner. The app also uses a fourth My corner tab in its friends panel, replacing the full-screen profile modal. Other people’s corners retain their relationship actions.

Announcements use a separate right column on wide screens, with their own scroll area. Smaller layouts place them below the feed, without a duplicate Announcements navigation button. They are excluded from the main feed’s displayed cards. Both interfaces use the existing authenticated read permissions on `community_posts` to load announcements independently of the feed’s current page and Friends filter. No new SQL or sign-in redirect is needed after the previous social/admin setup.

The website supports friends-only DMs using the same delivery functions and expiry rules as the app. Sender copies are saved locally before sending. Incoming messages are saved in encrypted IndexedDB transactions before server acknowledgment. A non-extractable AES-GCM key is stored in the same browser’s IndexedDB, separately per account. This protects raw message records from appearing as plaintext in storage, but does not add end-to-end encryption or protect against scripts running on the same website origin. Browser history stays in that browser; clearing site data, private browsing, eviction, losing the device or changing browser can lose it. Desktop and browser histories do not automatically sync after delivery.

The browser requests strict IndexedDB durability and checks write completion; if encrypted storage is unavailable or a write fails, it keeps the server message and displays an error. Concurrent updates from multiple tabs use revision checks before committing, preventing one tab from silently overwriting another’s received or sent history. Reference: https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction/durability .

## Notifications

The app uses one notification queue at the top right for achievements, friend requests, unread messages, creator notifications, completed update downloads and ordinary app feedback. Cards animate in/out, pause while hovered or keyboard-focused, and retain their remaining display time while the window is hidden. Reduced-motion preferences are respected. Notifications use a short chime; achievements have a separate rising chime. Sounds are synthesized locally, with no audio downloads. The main Electron window permits notification audio before the first click; browsers may require interaction before sound is allowed.

The Community sidebar count includes incoming requests and unread messages. The Messages button has its own unread count and appears only on the Friends tab. New unread counts create one alert per conversation increase; repeated polls do not replay unchanged notices. Clicking opens the conversation. Reading clears the unread count after safe delivery; merely notifying does not receive or acknowledge message bodies. Notifications for a conversation currently being read are suppressed. Unread counts and alerts still work when secure history is unavailable, while actual message delivery remains blocked until it can be saved safely. Signing out clears queued private notifications.

When an automatic download reaches ready, an update alert appears once for that version in the current session. Clicking opens the existing restart confirmation; downloading never installs or restarts by itself. The Settings restart button stays available after dismissing the alert. Saving a dirty template before restarting waits for the name dialog and the completed save; cancellation prevents installation.

Official references: https://supabase.com/docs/guides/auth/social-sign-in/auth-discord · https://supabase.com/docs/guides/auth/redirect-urls · https://supabase.com/docs/guides/auth/sessions/pkce-flow
