# Manual testing checklist

Sites change their markup often, so after updating the extension, or every couple of weeks, go through this list. It takes about 10 minutes. If something broke, look at the page console (`[media-saver]` messages) and the service worker console in `chrome://extensions`.

Before testing: `npm run pack`, then ⟳ on both extensions in `chrome://extensions`. Files appear in `Downloads/<site>/<author>/`.

## Instagram

- [ ] Feed: photo post: ⬇ button in the row under the post, the file downloads.
- [ ] Feed: carousel: ⬇ downloads the current slide, "All N" downloads all of them.
- [ ] Feed: video: the video with sound downloads, not the cover.
- [ ] Post `/p/…`: the buttons are there; "HD <width>" appears for photos whose original is larger than 1080 and downloads it.
- [ ] Post page with counters next to the icons: the button turns compact (⬇ with an "N" badge) and doesn't push Save off the panel.
- [ ] Reels `/reels/…`: ⬇ in the column on the right.
- [ ] Profile and Explore: the button over a tile downloads the whole post, including the first tiles.
- [ ] Stories: ⬇ in the header, the current story downloads (photo and video).
- [ ] Highlights: same as stories.
- [ ] Right-click → "Media Saver ▸ Download / Download whole post / Download original (HD)".

## X (Twitter)

- [ ] Tweet with a photo: ⬇ in the action row, the photo in original size (`name=orig`).
- [ ] Tweet with a video and with a GIF: an mp4 downloads.
- [ ] Tweet with several photos: all of them download.
- [ ] Right-click → "Media Saver ▸ Download".

## TikTok

- [ ] For You: ⬇ in the column on the right, the video downloads.
- [ ] Photo post: all photos download.
- [ ] Profile tiles: a button over the preview.
- [ ] The "Compatible" setting (video quality) gives H.264.

## LinkedIn

- [ ] Post with a photo: ⬇ after Send, the folder is the post author (not `unknown`).
- [ ] Post with several photos: all of them download.
- [ ] Post with a video: an mp4 with sound downloads, no need to start the video.

## Media Saver for YouTube

- [ ] Video: "Video" under the video shows percentages, the file appears in `Downloads/youtube/@channel/`.
- [ ] "Thumbnail" downloads the image in maximum size.
- [ ] Shorts: "Video" and "Thumbnail" in the column on the right.
- [ ] Right-click a tile in the feed → "Download thumbnail".
- [ ] If "Video" gives a helper error, run `native-host\install.ps1` again (see README).

## Settings

- [ ] Settings page: the path template changes file names, the preview updates.
- [ ] "Ask where to save" opens a dialog for a single file, but not for "All N".
