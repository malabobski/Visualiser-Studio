# Parked ideas

## DMs: server delivery, local history

Implemented for the desktop app and the dedicated website Community workspace; requires migration 005 and the message expiry job. Automatic cross-device history remains future work.

- Friends-only text messages are implemented. Shared templates in DMs remain future work; they can already be posted to the feed.
- Queue undelivered messages on the server with a 30-day expiry for unread messages.
- Save a received message durably in encrypted local history before acknowledging delivery and allowing server deletion. Opening a chat alone must not delete messages.
- Keep the sender's copy locally as well.
- Explain that reinstalling or losing a device can lose its history, and another device won't automatically have the same history.
- Deleting a local copy doesn't delete the other participant's copy.
- Include blocking and enforce participant-only database access. This design alone is not end-to-end encryption.
