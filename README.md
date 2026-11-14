# Site Blocker

A personal Chrome extension with two jobs:

- **Black zone.** A site in it cannot be opened: every page of it, and every
  subdomain, lands on a plain "blocked" page. Any site can go in.
- **Part blockers.** On Instagram, YouTube, X, TikTok and LinkedIn, switches
  hide one kind of content (image posts, video posts, short-form video, and a
  few extras per site) while the rest of the site keeps working. On any other
  site you add, two blunt switches: hide images, hide videos.

- **Daily time.** Any site can have a limit (15 or 30 minutes, 1 or 2 hours a
  day). The time counts while the site is the tab in front, or is playing
  sound in another tab; when it is used up the site closes until midnight.

Making things stricter is always free. Making them looser (a blocker off, a
site out of the black zone, a longer or removed daily limit, a timed pass
through the blocked page) asks for the password in `.env`.

## Install

1. Set your password in `.env`:

   ```
   BLOCKER_PASSWORD=something long and annoying to type
   ```

2. Build it (Node 20 or newer, nothing to install):

   ```
   npm run build
   ```

3. Open `chrome://extensions`, switch on **Developer mode**, press
   **Load unpacked**, choose the `dist` folder.
4. In the extension's **Details**, switch on **Allow in Incognito**, or an
   incognito window walks around every block.

After changing the password or any file: `npm run build`, then the reload
arrow on the extension's card.

## Use

- **Toolbar icon**: the switches for the site in the current tab, or a
  "Block this site" button for a site not yet listed.
- **All settings** (the options page): the black zone list, every supported
  site with its switches, running passes.
- **The blocked page**: a pass for 5, 15 or 60 minutes, with the password.
- An unlock lasts 10 minutes, then locks itself again; closing the browser
  locks too. Three wrong passwords start a wait that doubles each time.

## What it does not stop

It is a tool against your own reflexes, not a security boundary:

- You can switch the extension off, or remove it, in `chrome://extensions`.
- The password sits in plain text in `.env` on this computer (the built
  extension only carries a salted digest of it). If you know it by heart, it
  is only friction: let someone else pick it, or make it long.
- Other browsers and your phone are not covered.

## Commands

| Command          | What it does                                                |
| ---------------- | ----------------------------------------------------------- |
| `npm run build`  | `src/` to `dist/`, with the digest of the `.env` password   |
| `npm run check`  | Validates every site module against the contract            |
| `npm run e2e`    | Loads `dist/` in a throwaway Chromium and tests it for real |
| `npm run verify` | The three above, in order                                   |

`npm run e2e` needs a Chromium that accepts `--load-extension` (Playwright's
does; set `CHROME_PATH` for another). It runs offline against a local server
and never touches your own Chrome profile.

## When a site changes its markup

Each site is one folder, `src/sites/<site>/`: a `site.js` listing its
blockers, and one small CSS file per blocker. A blocker that stopped working
is a selector to update in that one file. The contract, and how to add a
site, is in `CLAUDE.md`.
