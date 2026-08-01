# Playing together — up to four players, one screen each

Nothing to install. Works on iPhones, iPads, Chromebooks, anything with a
browser.

## How to play

Everyone opens the normal game address:

    https://mattjanineclark.github.io/cape-squad/

**One of you makes the room:**

1. Tap **Play together (up to 4)**
2. Type a name, tap **Make a room**
3. A big four-letter code appears, like **KRTM**
4. Tap **Pick hero**, choose an animal and a costume

**Everyone else joins:**

1. Tap **Play together (up to 4)**
2. Type a name, tap **Join a room**
3. Type the four letters, tap **Go**
4. Tap **Pick hero**, choose an animal and a costume

**Then:** the person who made the room taps **Start the page**. Everyone plays,
each on their own screen, each following their own hero.

## What it needs

- Everyone on **the same Wi-Fi**. Not the guest network, and turn mobile data
  off on the phones so they do not wander onto 4G.
- **Internet, briefly.** Two devices need help finding each other in the first
  place, and that introduction happens over the internet. Once they are talking,
  the game itself goes straight across your Wi-Fi.

## Who does the work

Whoever made the room runs the game for everybody. Their device does the
physics; the others send button presses and draw what they are told. So use the
beefiest device to host — an iPad rather than an old phone — and keep that one
awake and in the foreground.

## If it will not connect

- **"No room with that code."** Check the letters. There is no letter I or O in
  a code, so a 1 is a one and a 0 is a zero.
- **Everyone must be on the same Wi-Fi.** This is the usual one.
- **The host locked their screen.** iOS pauses a tab when the screen sleeps or
  you switch apps, which stops the game for everyone. Keep the host device
  awake and on the game.
- **Someone dropped out.** They can rejoin, and they will be dealt in at the
  next page. The rest carry on.

## The normal game still works

One player, or two on a shared screen, exactly as before. No room, no internet
needed once the page has loaded.

## Optional: running your own server

If you happen to have a computer with Node.js on it, `cape-squad-server.js` in
this repository will host the game on your network with no internet at all.
Run `node cape-squad-server.js` and it prints an address. This is entirely
optional — the room codes above need nothing installed.
