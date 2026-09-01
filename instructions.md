# Instructions

Anytype keeps your notes on your own devices and works offline. This server is what those devices sync *through* — so there is no web app to log into here. What you need from it is one small configuration file.

## Documentation

- [Anytype self-hosting guide](https://doc.anytype.io/anytype/data/sync-and-backup/self-host) — how to point a client at your own network
- [Anytype help centre](https://doc.anytype.io/) — using the app itself
- [any-sync](https://tech.anytype.io/any-sync/overview) — the protocol this server implements

## What this gives you

Your spaces sync between your devices through your server instead of Anytype's. Spaces are end-to-end encrypted either way, so this is not about hiding your notes — it removes the account, the storage quota, and the dependency on infrastructure you do not control.

The server exposes four connection points that your devices use — coordinator, sync node, file node and consensus node — plus a **Network Configuration** page where you download the file that points your app at them.

## Getting set up

1. Wait for every health check to go green. First start takes a few minutes: the server generates its network identity and initialises its databases.
2. Open the **Network Configuration** interface and download `client.yml`. Save it onto the device you want to connect.
3. In the Anytype app, log out of your current vault.
4. Open the settings gear and choose **Self-hosted** under Networks.
5. Upload `client.yml`, then create a new vault or log into one that already exists on this network.

Repeat steps 2–5 on each device. Desktop, iOS and Android all support self-hosted networks.

## Reaching your server

Your devices must be able to reach the four sync connection points. On the same network that works out of the box. From outside, you need either a VPN back to your server or forwarded ports on your router.

**Tor will not work for this.** The Anytype apps cannot connect through Tor, so an onion address is not an option no matter how it is configured.

If you add a domain or your server's address changes, your devices pick the new address up automatically — the server republishes it. Give it a few minutes.

## Important limitations

- **A self-hosted network is a separate identity.** Spaces in an anytype.io account do not move across. Export what you want to keep from the app, switch networks, then import it into your new vault.
- **Raspberry Pi 4 and older boards cannot run this.** MongoDB needs a newer processor than they have. A Pi 5 or any x86 server is fine.
- **Anytype's own push notification service is still used** by your phone unless you change that in the app. That is a client setting, not something this server controls.
