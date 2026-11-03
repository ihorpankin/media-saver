# Instagram: how media is obtained

The result of task 1.1: what we learned from the sources of three live projects. Everything here still had to be checked against live pages (task 1.2).

| Project                                               | Version / commit date | License | What was studied                                                                |
| ----------------------------------------------------- | --------------------- | ------- | ------------------------------------------------------------------------------- |
| [gallery-dl](https://github.com/mikf/gallery-dl)      | 1.32.19, 2026-10-31   | GPL-2.0 | `gallery_dl/extractor/instagram.py`                                             |
| [IG Helper](https://github.com/SN-Koarashi/ig-helper) | 4.3.5, 2026-11-01     | GPL-3.0 | `src/utils/api.js`, `src/utils/general.js`, `src/functions/post.js`, `story.js` |
| [SocialSnag](https://github.com/jamditis/socialsnag)  | 1.3.0, 2026-09-23     | MIT     | `manifest.json`, `src/background.js`, `src/platforms/instagram*.js`             |

No code is copied from the GPL projects, only knowledge of the protocol. SocialSnag code (MIT) can be used with attribution.

---

## Main finding

**None of the three projects intercepts network requests (method C).** They all make their own API requests (method B), with the DOM as a fallback (method A). So C was untested in practice, and task 1.2 had to confirm it first. **Task 1.2 confirmed it, the results are at the end of this document.** Everything studied speaks in favor of C:

- The page's own GraphQL responses contain the same media objects as the REST API: `image_versions2`, `video_versions`, `carousel_media`. The root fields `xdt_api__v1__...` (see below) show that they are wrappers over the REST model.
- So one media object parser works for both C and B.

---

## Identifiers

- **shortcode ↔ media id.** A shortcode is a number in base64 with the alphabet `A–Z a–z 0–9 - _`. In JS it's converted with `BigInt` (SocialSnag has a ready function: `shortcodeToMediaId`).
- **Long shortcodes.** Private posts have shortcodes longer than 28 characters. gallery-dl cuts off the last 28 characters before decoding in that case.
- **URLs:** `/p/<code>/`, `/reel/<code>/`, `/stories/<username>/<media_id>/`, `/stories/highlights/<highlight_id>/`.
- **user id by username:**
  - `GET /api/v1/users/web_profile_info/?username=…` → `data.user.id`
  - or from the profile HTML with the regex `"page_id":"profilePage_(\d+)"` (as IG Helper does)

## Media object model

Important fields (REST and `xdt_api__` GraphQL):

| Field                               | Meaning                                                                                                                                                                                                                                  |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pk` / `id`                         | media id (`id` can look like `<pk>_<user_id>`). **Trap:** `pk` sometimes arrives as a JSON number above 2^53 and loses its low digits in `JSON.parse`. So the pk is taken from the string `id` (the part before `_`), as SocialSnag does |
| `code`                              | shortcode                                                                                                                                                                                                                                |
| `user.username`, `owner.username`   | author                                                                                                                                                                                                                                   |
| `taken_at`                          | unix publication time                                                                                                                                                                                                                    |
| `media_type`                        | 1 photo, 2 video, 8 carousel                                                                                                                                                                                                             |
| `carousel_media[]`                  | carousel items, each with its own `image_versions2` / `video_versions`                                                                                                                                                                   |
| `image_versions2.candidates[]`      | `{url, width, height}`: image variants                                                                                                                                                                                                   |
| `video_versions[]`                  | `{url, width, height, type}`: progressive mp4s                                                                                                                                                                                           |
| `video_dash_manifest`               | MPD (XML) with separate video and audio tracks, often better quality                                                                                                                                                                     |
| `original_width`, `original_height` | original size                                                                                                                                                                                                                            |
| `expiring_at`                       | present on stories                                                                                                                                                                                                                       |

## Choosing the best quality

**Photos.** The projects differ:

- gallery-dl takes `candidates[0]`: it's usually the largest.
- SocialSnag takes the candidate with the largest area `width × height`.
- IG Helper sorts candidates by **the length of the `stp` parameter** in the URL: the shorter it is, the fewer server transformations (crop, resize) and the closer to the original. A subtle point the other two projects don't know.

**Our rule:** the largest area, on a tie the shortest `stp`. If the best candidate is noticeably smaller than `original_width`, log a warning. In gallery-dl's experience, that's a sign of a stale session.

**Video.**

- From `video_versions` take the maximum by `width`, `height`, `type` (gallery-dl).
- `video_dash_manifest` often gives better quality than the progressive mp4, but video and audio come separately. IG Helper parses the MPD (`Representation` → `BaseURL`, chooses by `height`, then by `bandwidth`) and **muxes the tracks right in the browser with the [Mediabunny](https://mediabunny.dev) library**, without ffmpeg.wasm. Worth following.
- gallery-dl warns that with a non-Chrome User-Agent the video quality is lower. That doesn't affect us, we run in Chrome.

---

## API for the fallback (B)

### REST (more stable, recommended)

| What                   | Request                                                                                                               |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Post / Reel / carousel | `GET /api/v1/media/{media_id}/info/` → `items[0]`                                                                     |
| A user's stories       | `GET /api/v1/feed/reels_media/?reel_ids={user_id}` → `reels_media[0].items`, author in `reels_media[0].user.username` |
| Highlight              | the same with `reel_ids=highlight:{id}`                                                                               |
| List of highlights     | `GET /api/v1/highlights/{user_id}/highlights_tray/`                                                                   |
| Profile                | `GET /api/v1/users/web_profile_info/?username=…`                                                                      |

Host: `www.instagram.com/api/v1/…` (gallery-dl) or `i.instagram.com/api/v1/…` (IG Helper, SocialSnag).

**Headers:**

- **Minimum (SocialSnag):** `x-ig-app-id: 936619743392459` + cookies (`credentials: 'include'`). SocialSnag does this right from the service worker: `host_permissions` on `*.instagram.com` gives access to the cookies, no page context needed.
- **Full set (gallery-dl, IG Helper):**
  - `X-CSRFToken` from the `csrftoken` cookie
  - `X-IG-WWW-Claim` from `sessionStorage['www-claim-v2']` or the `x-ig-set-www-claim` response header
  - `X-ASBD-ID`
  - `X-Requested-With: XMLHttpRequest`
- The App ID doesn't have to be hardcoded, it can be read from the page with the regex `"APP_ID":"(\d+)"` over `<script type="application/json">` (IG Helper).

### GraphQL (fragile, not used for B)

`POST /graphql/query` with `doc_id`, the id of a persisted query that Instagram changes from time to time. IG Helper itself says in its code: "may break in the future". It needs the `lsd` and `fb_dtsg` tokens from the embedded JSON and a bunch of service fields.

For C this is still useful: these names identify the page's responses.

| `fb_api_req_friendly_name`                | Root field of the response                   |
| ----------------------------------------- | -------------------------------------------- |
| `PolarisPostRootQuery`                    | `xdt_api__v1__media__shortcode__web_info`    |
| `PolarisStoriesV3ReelPageStandaloneQuery` | `xdt_api__v1__feed__reels_media`             |
| `PolarisStoriesV3HighlightsPageQuery`     | `xdt_api__v1__feed__reels_media__connection` |

### Errors

- A redirect to `/accounts/login/` means login is needed. A redirect to `/challenge/` is a bot check: stop requests immediately.
- `401`/`403` login needed, `404` no access or the post was deleted, `429` rate limit exceeded (SocialSnag's classification).

### Limits

- gallery-dl pauses **6–12 seconds** between API requests.
- IG Helper warns directly that active use of the Media API leads to warnings, logouts and bans.
- **Our policy for B:** a request only on the user's click and only on a cache miss, a minimum interval between requests, a pause after `429` or `/challenge/`. No bulk downloads.

---

## DOM (fallback A and attaching buttons)

- Classes are obfuscated and change, so they aren't relied on. Stable anchors: the links `a[href^="/p/"]`, `a[href^="/reel/"]`, the tags `article`, `video`, `img[srcset]`.
- `srcset`: IG Helper takes the first item. This needs checking: the standard doesn't guarantee the order, taking the largest `w` is more reliable.
- A known IG Helper problem: React re-renders components and removes injected buttons (especially on the new Reels page). So buttons have to be re-inserted with a MutationObserver, and click handlers delegated to `body`, as IG Helper does.

---

## SocialSnag's architecture (MV3, in the Chrome Web Store)

- API requests are made from the **background service worker**, while the content script only decides what to download.
- An **offscreen document** is needed for what the service worker lacks: building ZIPs, the clipboard. We'll use it for muxing DASH with Mediabunny.
- A **result cache** (`resolve-cache.js`) protects against repeated requests for the same shortcode.
- **Pure parsing functions** are kept separate and covered by tests (vitest) on saved JSON. We'll take this approach.
- It's published in the store with YouTube support **for thumbnails only** (`img.youtube.com/vi/<id>/maxresdefault.jpg`, avatars `yt3.ggpht.com` with `=s0`), which will be useful for stage 2.

---

## Results of task 1.2: checking live Instagram (2026-11-02)

Checked in the built-in browser with a logged-in account: a temporary `fetch`/`XHR` interceptor was installed from the console, then responses and the embedded JSON were studied.

### Method C confirmed ✅

**1. Transport: `XMLHttpRequest` only.** All requests with media go through XHR, not a single one came through `fetch`. Both need intercepting, but XHR is the main one. Endpoints: `/graphql/query`, `/api/graphql` and REST `/api/v1/…`.

**2. There is embedded JSON.** On a direct page load the data sits in `<script type="application/json" data-sjs>` at `require[…].__bbox.require[…].__bbox.result.data.<root>`. A recursive search finds it without knowing the exact path. Checked on `/p/<code>/` (the `xdt_api__v1__media__shortcode__web_info` field) and on the home page (first page of the feed, `xdt_api__v1__feed__timeline__connection`).

**3. Page map:**

| Page                       | How it arrives                                                                                          | `fb_api_req_friendly_name`                                 | Root field                                                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Feed, first page           | embedded JSON                                                                                           | —                                                          | `xdt_api__v1__feed__timeline__connection`                                                                                    |
| Feed, loading more         | XHR `/graphql/query`                                                                                    | `PolarisFeedRootPaginationCachedQuery_subscribe`           | `xdt_api__v1__feed__timeline__connection` → `edges[].node.media` (also `node.explore_story.media`, ads in `node.ad.items[]`) |
| Post by direct link        | embedded JSON                                                                                           | —                                                          | `xdt_api__v1__media__shortcode__web_info.items[0]`                                                                           |
| Post opened by click (SPA) | XHR **REST**                                                                                            | —                                                          | `/api/v1/media/{pk}/info/` → `items[0]`                                                                                      |
| Profile grid               | XHR `/api/graphql`                                                                                      | `PolarisProfilePostsQuery`                                 | `xdt_api__v1__feed__user_timeline_graphql_connection`                                                                        |
| Reels                      | XHR `/api/graphql`                                                                                      | `PolarisClipsTabDesktopContainerQuery`, `…PaginationQuery` | `xdt_api__v1__clips__home__connection_v2`                                                                                    |
| Stories                    | XHR `/graphql/query`                                                                                    | `PolarisStoriesV3ReelPageGalleryQuery`, `…PaginationQuery` | `xdt_api__v1__feed__reels_media__connection` → `edges[].node.items[]`                                                        |
| Highlights                 | not checked (to avoid leaving extra views); per IG Helper, `xdt_api__v1__feed__reels_media__connection` |                                                            |                                                                                                                              |

Instagram itself calls REST `/api/v1/media/{pk}/info/` when a post is opened by click. So our fallback request there looks like the site's regular traffic.

**4. The structure matches REST:** `pk` (a string), `id` = `<pk>_<user_id>`, `code`, `media_type` (1/2/8), `user.username`, `taken_at`, `original_width`/`original_height`, `image_versions2.candidates`, `video_versions`, `video_dash_manifest`, `carousel_media[]`. One parser fits all sources.

**5. Feed carousels arrive whole:** `carousel_media.length === carousel_media_count` (seen with 8 and 13 slides). No need to swipe.

### Quality: important findings ⚠️

**6. Video: DASH is a must.**

- Progressive `video_versions` are almost always limited to **720p** (720×1280 or 1280×720), even when the original is 1440×2560.
- The DASH manifest has 1080p and 1440p: e.g. `video_versions` at 720×1280 while DASH goes up to 1440×2560.
- In Reels and stories `video_versions` have **no `width`/`height` fields**, so they can't be sorted by them.

Conclusion: decent video quality needs DASH muxing (task 1.4b). The progressive mp4 stays only as a quick fallback.

**7. Photos: the maximum resolution depends on the source.**

| Source                                             | Candidates | Maximum (example: 3000×4000 original)            |
| -------------------------------------------------- | ---------- | ------------------------------------------------ |
| Feed (`feed__timeline`)                            | 2          | 1080×1440 (`stp=…_p1080x1080_…`)                 |
| REST `/api/v1/media/{pk}/info/`                    | 2          | 1080×1440                                        |
| Post by direct link (`media__shortcode__web_info`) | ~14        | **3000×4000** (`stp=dst-jpg_e35_tt6`, no resize) |
| Profile grid (`user_timeline_graphql_connection`)  | many       | **3000**                                         |
| Stories                                            | 1–2        | equal to the original (usually 1080×1920)        |

- A short `stp` without `p1080x1080`/`s640x640` does mean the original; IG Helper's rule works.
- A plain `fetch('/p/<code>/')` HTML does **not** contain media data: the embedded JSON comes only with a real navigation.
- **Consequence:** for feed photos an original above 1080 can't be obtained through C or REST. Options for the future (task 1.5):
  - (a) GraphQL `PolarisPostRootQuery`. The interceptor sees the page's own requests, so it could learn the current `doc_id` and the `lsd`/`fb_dtsg` tokens from its traffic instead of hardcoding them. Not checked.
  - (b) Accept 1080 for the feed and take the original when the post is opened by link or from the profile.
  - Most posts are uploaded at no more than 1080–1440 anyway, so the problem only concerns photos uploaded in high resolution.

### DOM

- In the feed `<img>` has **no `srcset`**, only `src` (1080px). The `srcset` variant of A is outdated; take `src`/`currentSrc`.
- Posts are `<article>` elements with a stable `a[href^="/p/<code>/"]` link inside, used to match the post with its data.
- The story URL changes to `/stories/<username>/<pk>/` on switching: the current item is identified by the `pk` from the URL.
- Images load from `scontent-*.cdninstagram.com`.
