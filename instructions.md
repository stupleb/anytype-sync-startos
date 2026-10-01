# Instructions

Anytype keeps your notes on your own devices and works offline. This server is what those devices sync *through* — so there is no web app to log into here. What you need from it is one small configuration file.

## Documentation

- [Anytype self-hosting guide](https://doc.anytype.io/anytype/data/sync-and-backup/self-host) — how to point a client at your own network
- [Anytype help centre](https://doc.anytype.io/) — using the app itself
- [any-sync](https://tech.anytype.io/any-sync/overview) — the protocol this server implements

## What this gives you

Your Channels — what Anytype used to call Spaces — sync between your devices through your server instead of Anytype's. They are end-to-end encrypted either way, so this is not about hiding your notes — it removes the account, the storage quota, and the dependency on infrastructure you do not control.

The server exposes four connection points that your devices use — coordinator, sync node, file node and consensus node — plus a **Network Configuration** page where you download the file that points your app at them.

## Getting set up

1. Wait for every health check to go green. First start takes a few minutes: the server generates its network identity and initialises its databases.
2. Open the **Network Configuration** interface and download `client.yml`. Save it onto the device you want to connect.
3. **Save your Anytype login key before going any further.** Anytype cannot recover it, and the next step signs you out.
4. In Anytype, open settings from the sidebar and scroll to the bottom for **Log out**. It only appears on your account's settings — if you opened settings from inside a space you are looking at that space's settings and there is no Log out there.
5. You are now on the login screen. The network picker lives **only here**, not in the app's normal settings: click the **gear icon in the top-right**, beside the language selector.
6. Choose **Self-hosted** ("Back up to your self-hosted network"), then upload `client.yml` under **Self-hosted Configuration**.
7. Create a new vault, or log into one that already exists on this network.

Repeat on each device. Desktop, iOS and Android all support self-hosted networks.

## Reaching your server

Your devices must be able to reach the four sync connection points. On the same network that works out of the box. From outside, you need either a VPN back to your server or forwarded ports on your router.

**Tor will not work for this.** The Anytype apps cannot connect through Tor, so an onion address is not an option no matter how it is configured.

### Adding a domain

Addresses are enabled **per interface**, and your devices talk to all four sync connection points directly. So after adding a domain, enable it on **all four** — Coordinator, Sync Node, File Node and Consensus Node. Enabling it on only some produces a client that connects and syncs text but silently fails on images, with every health check still green.

Once enabled, nothing else is needed:

- **Devices already set up pick it up on their own**, within about ten minutes. They re-fetch the node list from your server periodically, so you do not need to re-download `client.yml` or re-import anything.
- **New devices** get it in a freshly downloaded `client.yml`.

You do not need to re-download `client.yml` for this. Your devices store the node list they fetch from your server and keep it across restarts, so a new address replaces the old one on its own.

The exception is a device that cannot reach your server on any address it already has — a phone that has only ever been on mobile data, holding a `client.yml` with only your home network's address, can never be told about the new one. That device needs a freshly downloaded `client.yml`.

So the order matters: add the new address, let every device come online once while the old one still works, and only then remove anything.

A domain gives your server a name — it does not by itself make it reachable from outside your network. The four ports still need to reach your server, via forwarded ports on your router or a VPN.

## Moving content from Anytype's network

If you already use Anytype, your existing content does not follow you automatically. You move it a Channel at a time, using Anytype's own export and import. Nothing here touches your old vault — it stays exactly as it is on Anytype's network until you choose to delete it.

**Do the exports first, while you are still logged into your existing vault on the Anytype network.** Once you switch networks you cannot reach that vault.

1. Open the settings for a Channel you want to move and choose **Export Channel**.
2. Pick **Any-Block**, not Markdown. Markdown is for reading elsewhere and loses your object types, properties and relations; Any-Block is Anytype's own format and is the only one that imports back cleanly.
3. Turn on **Include files** so images and attachments come with it. **Include archived objects** if you want those too. Leave **Zip archive** on.
4. Repeat for every Channel you want to keep. There is no whole-vault export in this format — it is one export per Channel.
5. Now switch to your self-hosted network and create a new vault.
6. In the new vault, create a Channel to receive the content, then go to **Import**, choose **Any-Block**, and select the archive you exported. Imported objects land in the Channel you selected.

What does not come across, and cannot:

- **Your identity.** The new vault has a new login key. Save it — Anytype cannot recover it for you.
- **Sharing and collaborators.** A Channel's members live on the network it was created on, so anyone you shared with needs re-inviting on the new one.
- **Anything tied to Anytype's network**, such as a purchased name.

Take your time over step 4. It is much easier to export one Channel too many now than to switch networks back and forth later.

## Freeing space after the move to Garage

This applies only if you installed this service while it still stored files in MinIO. The update that replaced MinIO with Garage copied your images and attachments across and kept the old copy, so until you remove it they take twice the space.

1. Open a few images and file attachments in Anytype and check that they load.
2. Run the **Delete Old MinIO Data** action. StartOS also shows it as a task on this service.

The action returns straight away and deletes in the background; it disappears from the list when it has finished. It cannot be undone.

## Important limitations

- **A self-hosted network is a separate identity, and you must create a _new_ vault on it.** Your existing anytype.io vault belongs to Anytype's network and cannot be recovered onto yours. Entering its login key after switching to Self-hosted does not fail with an error — the app sits on "Welcome back" with a spinner indefinitely, because it is looking for an account that does not exist on your server. Create a new vault instead, and move your content across with the steps below.
- **Raspberry Pi 4 and older boards cannot run this.** MongoDB needs a newer processor than they have. A Pi 5 or any x86 server is fine.
- **Push notifications still go through Anytype's servers.** Your phone contacts Anytype's push service regardless of this server, and there is no setting in the app that repoints it — only an environment variable on the client. The notification controls you *do* get in a space's settings decide whether you are notified, not who delivers it. Self-hosting does not remove this.
