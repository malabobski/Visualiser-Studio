# Website Community section

`index.html` is the complete single-file website, including the Community UI and the pinned Supabase browser SDK. Upload this HTML through the existing manual Cloudflare workflow.

In **Supabase → Authentication → URL Configuration**, add this exact Redirect URL:

`https://malchim.malabobski.workers.dev/`

Keep the desktop loopback redirect entry too. Google and Discord still send their provider callback to Supabase; their client secrets remain in Supabase, never in this HTML. No new SQL migration is needed: the website uses the same profile and feed functions as app v1.3.0.

The website supports Google/Discord sign-in, existing profiles, optional new-profile introductions, reading Everyone/Friends feeds, text posts, own-post deletion with confirmation, and older-post pagination. Desktop shared looks can be viewed from the website. Public posts have the same visibility as in the app.

The download/home view and the dedicated `#community` workspace share this single HTML upload. Community has friends, requests, search, inline My corner, profiles, DMs and a separate announcements rail. Mobile navigation switches panels. Browser DMs use encrypted IndexedDB and the existing social delivery functions: server messages are acknowledged only after a successful local commit. Browser history is local to that browser and does not sync automatically with the desktop app; clearing site data can remove it. No additional SQL or OAuth redirect is required after the social/admin setup.

Browser sessions are separate from the desktop session. New posts wait behind a button while reading. Polling runs only while the Community section is visible and the page is active. The website does not send private keys, local paths, audio or MIDI files.

The local file preview can show the design, but sign-in is available only on the published HTTPS site. The live website is not deployed by editing this file; it still needs the manual HTML upload.

After editing Community fragments, run `node website/build.cjs` to rebuild the single uploadable HTML. The pinned Supabase SDK and original page assets remain embedded. The builder also embeds the shared creator-tools UI and CSS from the repository root.

Listening cards now show “Now Playing” with a brief glow when a friend's song changes. Click a song in Friends or a friend's profile to open its artwork, title, artist and platform link. Exact links are used when available; search links are labelled as searches. Missing artwork has a music-note placeholder. The dialog supports keyboard navigation, Escape and narrow phone screens, and respects reduced motion. The browser displays music shared by the desktop app; it does not detect system playback. Browser activity updates preserve fresh desktop listening activity without extending its expiry.

Creator Tools → Notification now offers One account or Everyone. Everyone includes all current profiles, including the creator, with a title/message review before sending. Broadcasts use existing Community inboxes and in-app notification popups; they do not request system notification permissions. Offline recipients see the notice when they next open Community, within the existing 30-day retention period. Each account dismisses its own copy. A lost connection can be retried without duplicating a broadcast. No broadcast is sent automatically by installing this update.

Apply `supabase/community-listening-and-broadcast-setup.sql` (or the two `202610280001`/`202610280002` migrations) to the existing database, then upload the rebuilt `website/index.html` through the existing Cloudflare workflow. Restart the desktop app to load the shared Creator Tools changes. Existing text listening activity still works before the database update, but shared artwork and broadcasts need the new functions. The setup file can be reapplied safely.

For creator tools and role badges, first run `supabase/community-admin-setup.sql`. Ownership is bound once to @malchim’s account UUID; public clients cannot grant roles. The website supports creator-only pinning, announcements, post editing/deletion, verification and private notifications, using the same functions as the app. Other accounts receive no moderation controls. Private notifications appear above the composer and can be dismissed by their recipient. Existing feed access still works against databases that have not installed the admin update.
