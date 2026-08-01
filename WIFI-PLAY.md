# Playing Cape Squad over your Wi-Fi

Up to four players, each on their own screen.

## First, the honest bit

One machine has to run the server, and it needs **Node.js**. iPhones and iPads
cannot do this. A **Chromebook can**, if it is allowed to turn on its Linux
environment — school-managed Chromebooks often have that blocked.

**Check this before anything else. It takes thirty seconds:**

> Chromebook → **Settings** → **About ChromeOS** → **Developers**
> Look for **Linux development environment**.

- **It is there** → follow the steps below.
- **It is missing or greyed out** → this will not work on your kit. Tell me and
  I will build the version that needs nothing installed.

## Step by step, on the Chromebook

**1. Turn on Linux.**
Settings → About ChromeOS → Developers → Linux development environment →
**Set up**. Accept the defaults (10 GB is plenty). It takes a few minutes and
finishes by opening a black **Terminal** window.

**2. Install Node and the bits to unpack a download.** In that Terminal:

    sudo apt update
    sudo apt install -y nodejs curl unzip

Check it worked:

    node --version

Anything from v12 up is fine.

**3. Fetch the game.** Still in the Terminal:

    curl -L -o cape.zip https://github.com/mattjanineclark/cape-squad/archive/refs/heads/main.zip
    unzip cape.zip
    cd cape-squad-main

**4. Start it.**

    node cape-squad-server.js

It prints instructions. Leave this window open — closing it stops the game.

**5. Open the door to the other devices.** The Linux part of a Chromebook sits
behind its own little network, so the iPads cannot reach it until you say so:

Settings → Advanced → **Developers** → **Linux** → **Port forwarding** →
**Add** → port **8080**, TCP.

**6. Find the Chromebook\'s Wi-Fi address.**
Settings → **Network** → **Wi-Fi** → tap your network. Look for the IP address,
something like `192.168.1.42`.

**7. Everyone joins.** On each iPhone and iPad, in Safari:

    http://192.168.1.42:8080

(using your own number from step 6). On the Chromebook itself you can use
`http://localhost:8080`.

**8. Play.** Tap **Play over Wi-Fi** → type a name → **Join** → **Pick hero** →
choose an animal and a costume. The first person who joined is the host and
gets the **Start the page** button.

## Every time after the first

Only steps 4 and 7. Open the Terminal, then:

    cd cape-squad-main
    node cape-squad-server.js

Port forwarding stays set.

## If it will not connect

- **Everything must be on the same Wi-Fi.** Not the guest network, and not
  mobile data. Turn mobile data off on the iPhones if they keep wandering off.
- **Guest networks block this on purpose.** They stop devices talking to each
  other. Use the normal home network.
- **Check the address.** It needs the `http://` and the `:8080`.
- **Skipped step 5?** That is the usual one. Without port forwarding only the
  Chromebook can reach the game.

## While playing

- iOS pauses a tab when you lock the screen or switch apps, so keep the game in
  front. If someone drops out the others carry on, and they can rejoin at the
  next page.
- Each player sees their own hero with their own camera, so you can be far apart
  without squashing everyone onto one screen.
- About 17 KB a second per device. Your Wi-Fi will not notice.

## The normal game is unchanged

`index.html` on its own still plays exactly as before — one player or two on a
shared screen, no server, no internet. The Wi-Fi button only appears when the
page is served by `cape-squad-server.js`.
