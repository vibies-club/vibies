# Issue 61 browser evidence

Captured on the isolated Cloudflare compatibility Worker on 2026-10-15 using Chrome through the browser's Playwright controls. The root opened and visually inspected every image.

- `home-{390,768,1280,1440}.png`: first-viewport proof of the changed header and home layout. Lower homepage sections retain scroll-triggered reveals.
- `sign-in-{390,768,1280,1440}.png`: sign-in layout at each required width, including both provider controls and private access copy.

These contain no private member data. They are visual proof, not evidence of authenticated persistence or completed migration. `google-unlinked.png` records the recovery message after the owner-authorized Google OAuth callback. It proves denial of an unlinked identity, not successful linked login.

- `github-test-account.png`: the approved isolated test account after GitHub sign-in.
- `google-linked.png`: successful explicit Google linking.
- `google-login.png`: subsequent Google login to the same nickname.
- `google-saved-refresh.png`: synthetic milestone persisted across a full refresh.

## Static architecture refresh

`vibies-static-{home,sign-in,project,projects,welcome}-{390,768,1280,1440}.png` captures the replacement React frontend at each verified viewport width. Public home/sign-in were captured from the isolated live compatibility Worker. Private pages were captured against a loopback-only Worker/D1 synthetic fixture, without copying any browser credentials. CSS animations were finished for stable screenshots. Root opened all 20 final images and found no clipping or horizontal overflow. Intermediate captures with incorrect dimensions or unsettled compositor frames were replaced. Screenshots remain local evidence and are not committed as unused app assets.
