// X / Twitter. Two web clients are live at once (November 2026): the old
// React Native Web client (#react-root, data-testid hooks) and the new one
// (html[data-app-version], TanStack Router + Tailwind, no test ids), which
// X is moving signed-in users to country by country. Every CSS file covers
// both. Old-client selectors were cross-checked against Control Panel for
// Twitter, Minimal Twitter, Twitter Media Harvest and Twitter Media
// Downloader; new-client selectors against X's own server-rendered pages,
// its front-end bundles (app version 6cb4de35) and the new-client branch of
// Control Panel for Twitter (PR #973). Pure CSS: every kind is visible in
// the markup, so no classifier is needed.
const graphql = (operations) =>
  `^https://([a-z0-9-]+\\.)?(x|twitter)\\.com/(i/api/)?graphql/[^/]+/(${operations})([?]|$)`;

export default {
  id: "x",
  name: "X",
  domains: ["x.com", "twitter.com"],
  features: [
    {
      id: "images",
      label: "Image posts",
      description:
        "Posts showing one or more photos disappear from every timeline, quotes of photo posts included, with the photo grid of a profile's Media tab; link previews stay.",
      css: "images.css",
      network: [
        // The photo grid of a profile's Media tab (new client), used by
        // nothing else.
        { regexFilter: graphql("UserPhotoTimeline"), resourceTypes: ["xmlhttprequest"] },
      ],
    },
    {
      id: "videos",
      label: "Video posts",
      description:
        "Posts showing a video or a GIF disappear from every timeline, quotes of them and video cards included, with the video and live grids of a profile's Media tab.",
      css: "videos.css",
      network: [
        // The video grid of a profile's Media tab (new client), used by
        // nothing else.
        { regexFilter: graphql("UserVideoTimeline"), resourceTypes: ["xmlhttprequest"] },
      ],
    },
    {
      id: "shorts",
      label: "Immersive video feed",
      description:
        "The full-screen swipe-up video viewer and the Expand button that opens it from a video disappear, and its address sends you to Home.",
      css: "shorts.css",
      paths: [
        {
          // /<user>/status/<id>/mediaviewer (also /i/web/status/...): the
          // immersive viewer, titled "Videos", in both clients.
          regex: "^/([A-Za-z0-9_]+|i/web)/status/[0-9]+/mediaviewer(/|$)",
          redirect: "/home",
        },
      ],
      network: [
        // The viewer's own feed, profile feed and opened-post queries (new
        // client); only the viewer's two chunks reference them.
        {
          regexFilter: graphql(
            "immersiveTimelineQuery|immersiveProfileTimelineQuery|immersiveViewerPinnedTweetQuery",
          ),
          resourceTypes: ["xmlhttprequest"],
        },
      ],
    },
    {
      id: "for-you",
      label: "For you feed",
      description:
        "The For you tab and its feed disappear from Home, which then shows the Following feed once you pick it.",
      css: "for-you.css",
    },
    {
      id: "explore",
      label: "Explore and trends",
      description:
        "The Explore entry, the trends and news boxes of the sidebar disappear, and Explore, trends and news pages send you to Home; search stays.",
      css: "explore.css",
      paths: [
        {
          // Explore and its tabs, the trends pages, trend and news detail
          // pages, and the AI news "stories".
          regex:
            "^/(explore|i/trends|i/trending|i/jf/global-trending|i/jf/explore|i/jf/stories)(/|$)",
          redirect: "/home",
        },
      ],
    },
    {
      id: "who-to-follow",
      label: "Who to follow",
      description:
        "Account suggestions disappear: the Who to follow and You might like boxes and the Follow entry, and the suggestions page sends you to Home.",
      css: "who-to-follow.css",
      paths: [{ regex: "^/i/connect_people(/|$)", redirect: "/home" }],
    },
    {
      id: "grok",
      label: "Grok",
      description:
        "Grok disappears: its menu entry, its floating window and the Grok buttons on posts, and a Grok page sends you to Home.",
      css: "grok.css",
      paths: [{ regex: "^/i/(jf/)?grok(/|$)", redirect: "/home" }],
    },
  ],
};
