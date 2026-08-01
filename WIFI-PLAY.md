# Playing Cape Squad over your Wi-Fi

Up to four players, each on their own phone, tablet or laptop.

## What you need

One computer on the same Wi-Fi as everyone else, with **Node.js** installed
(nodejs.org — the "LTS" download). Nothing else. No `npm install`.

## Running it

1. Download this repository (green **Code** button on GitHub → **Download ZIP**)
   and unzip it.
2. Open a terminal / command prompt in that folder and run:

       node cape-squad-server.js

3. It prints an address, something like `http://192.168.1.42:8080`.
   On Windows you may get a firewall prompt the first time — allow it on
   **private networks**, or nobody will be able to connect.
4. Everyone opens that address in their browser, on the same Wi-Fi.
5. Tap **Play over Wi-Fi**, type a name, tap **Join**.
6. Each player taps **Pick hero**, chooses an animal and a costume.
7. The first person who joined is the host and gets the **Start the page**
   button.

To stop the server, press `Ctrl+C` in the terminal.

## How it works

The computer running the server plays the whole game — physics, hazards, the
lot — and sends everyone about 30 updates a second. Your device sends button
presses and draws what it is told. That means nobody can get out of step with
anybody else, and each player gets their own camera following their own hero
instead of everyone squeezing onto one screen.

It is roughly 17 KB per second per device. Your Wi-Fi will not notice.

## If it does not work

- **Nobody can connect.** Almost always the firewall on the host machine, or a
  guest network with "client isolation" turned on. Put every device on the
  normal home Wi-Fi, not the guest one.
- **The address does not load.** Check every device is on the same Wi-Fi and
  not on mobile data. Type the address exactly, including `http://` and the
  `:8080`.
- **A player drops out.** They can reload the page and join again. The others
  keep playing.
- **Phones sleeping.** iOS pauses a tab when you switch apps or the screen
  locks. Keep the game in front.

## The normal game still works

`index.html` on its own is unchanged — the single-player and couch two-player
game plays exactly as before, with no server and no internet. The Wi-Fi button
only appears when the page is being served by `cape-squad-server.js`.
