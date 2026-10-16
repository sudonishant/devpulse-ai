# Public repository secret-pattern scan

23 public repositories; 426 reachable commits; 3,016 unique-per-repository Git blobs. 15 raw candidate occurrences across four repositories. No credential validity requests were made. Private repositories and unfetched refs are outside this scan.

| Repository | Commits | Blobs | Raw candidates | Review |
|---|---:|---:|---:|---|
| [aegiseye-forensics](https://github.com/sudonishant/aegiseye-forensics) | 24 | 66 | 0 | No configured secret-pattern candidate found; not a guarantee of no secrets. |
| [aethersense](https://github.com/sudonishant/aethersense) | 9 | 35 | 0 | No configured secret-pattern candidate found; not a guarantee of no secrets. |
| [air-draw-drum-kit](https://github.com/sudonishant/air-draw-drum-kit) | 2 | 71 | 0 | No configured secret-pattern candidate found; not a guarantee of no secrets. |
| [airlink-vercel](https://github.com/sudonishant/airlink-vercel) | 24 | 68 | 0 | No configured secret-pattern candidate found; not a guarantee of no secrets. |
| [autodoc-ai](https://github.com/sudonishant/autodoc-ai) | 6 | 40 | 0 | No configured secret-pattern candidate found; not a guarantee of no secrets. |
| [chemistryneeshant](https://github.com/sudonishant/chemistryneeshant) | 4 | 14 | 0 | No configured secret-pattern candidate found; not a guarantee of no secrets. |
| [cryptoshield-usb-vault](https://github.com/sudonishant/cryptoshield-usb-vault) | 3 | 17 | 0 | No configured secret-pattern candidate found; not a guarantee of no secrets. |
| [devpulse-ai](https://github.com/sudonishant/devpulse-ai) | 18 | 73 | 0 | No configured secret-pattern candidate found; not a guarantee of no secrets. |
| [ISM](https://github.com/sudonishant/ISM) | 11 | 136 | 0 | No configured secret-pattern candidate found; not a guarantee of no secrets. |
| [ISM-AccessPath](https://github.com/sudonishant/ISM-AccessPath) | 14 | 230 | 0 | No configured secret-pattern candidate found; not a guarantee of no secrets. |
| [jeeplan2027](https://github.com/sudonishant/jeeplan2027) | 38 | 331 | 5 | Firebase client configuration; public identifier, not by itself a private auth secret. Review key restrictions and Firestore/Storage rules (not tested). |
| [nee-wifi-fixer](https://github.com/sudonishant/nee-wifi-fixer) | 7 | 9 | 0 | No configured secret-pattern candidate found; not a guarantee of no secrets. |
| [omnidetect-ai](https://github.com/sudonishant/omnidetect-ai) | 9 | 95 | 2 | Historical mock/test key strings; current tests use environment or explicitly non-usable fixture. No provider validation performed. |
| [pi-control-center](https://github.com/sudonishant/pi-control-center) | 14 | 149 | 5 | HTML placeholder showing a private-key BEGIN marker, not a complete PEM key. |
| [satarkpay-repo](https://github.com/sudonishant/satarkpay-repo) | 42 | 592 | 0 | No configured secret-pattern candidate found; not a guarantee of no secrets. |
| [SUDO-SPANDR](https://github.com/sudonishant/SUDO-SPANDR) | 79 | 548 | 3 | Markers/long matching strings embedded in the checked-in cloudflared binary; low-confidence binary matches, not confirmed private credentials. |
| [sudo-spandr-gateway](https://github.com/sudonishant/sudo-spandr-gateway) | 11 | 98 | 0 | No configured secret-pattern candidate found; not a guarantee of no secrets. |
| [SUDO-SPANDR-TUI](https://github.com/sudonishant/SUDO-SPANDR-TUI) | 17 | 78 | 0 | No configured secret-pattern candidate found; not a guarantee of no secrets. |
| [sudo-spandr-vpn](https://github.com/sudonishant/sudo-spandr-vpn) | 7 | 160 | 0 | No configured secret-pattern candidate found; not a guarantee of no secrets. |
| [sudonishant](https://github.com/sudonishant/sudonishant) | 28 | 30 | 0 | No configured secret-pattern candidate found; not a guarantee of no secrets. |
| [sudonishant.github.io](https://github.com/sudonishant/sudonishant.github.io) | 18 | 74 | 0 | No configured secret-pattern candidate found; not a guarantee of no secrets. |
| [vanguard-scanner](https://github.com/sudonishant/vanguard-scanner) | 23 | 38 | 0 | No configured secret-pattern candidate found; not a guarantee of no secrets. |
| [voxtrace](https://github.com/sudonishant/voxtrace) | 18 | 64 | 0 | No configured secret-pattern candidate found; not a guarantee of no secrets. |

## Candidate locations (values intentionally omitted)

### jeeplan2027

Firebase client configuration; public identifier, not by itself a private auth secret. Review key restrictions and Firestore/Storage rules (not tested).

- `client/public/firebase-messaging-sw.js:6` — Google; blob `ae0177c44e061f8d377e465ad8fedc0a5dc77c2f`; exact blob at current HEAD: **True**. Example historical change: `5a4d54252c4a5934da90312c5d45bd6a53922f37`.
- `firebase-applet-config.json:4` — Google; blob `f6f01e3f6d3f2318cb3b3ac652bff203324f8f98`; exact blob at current HEAD: **True**. Example historical change: `17b9d4babb149f65f0d5b2cb90da7cc572066244`.
- `firebase-applet-config.json:4` — Google; blob `3ed52d944ec4279e659604360c9f8eb025b3a71c`; exact blob at current HEAD: **False**. Example historical change: `3e14dbeb104addad8879c4490cccf83f4f2a26b3`.
- `client/public/firebase-messaging-sw.js:6` — Google; blob `b29dbb220ade829db5e2e07bcedb37fc8257ae75`; exact blob at current HEAD: **False**. Example historical change: `0899e79b67ad1d02d05348e658038841d7beb174`.
- `client/public/firebase-messaging-sw.js:6` — Google; blob `6f2c434552ab522fc93b59f37aa7f3620ad720fb`; exact blob at current HEAD: **False**. Example historical change: `ccf3e8762b5a7e478fc75c854bc0e953088209b4`.
### omnidetect-ai

Historical mock/test key strings; current tests use environment or explicitly non-usable fixture. No provider validation performed.

- `backend/tests/test_key_manager.js:9` — OpenAI-like; blob `134d35ec8998839fa27c6017597e918e4b36ca93`; exact blob at current HEAD: **False**. Example historical change: `991a57469eec27313c20d89a11968740310e2395`.
- `backend/tests/test_open_router.js:10` — OpenAI-like; blob `4ad31464fe8fc300deb7f45d88977ac6dddc32e3`; exact blob at current HEAD: **False**. Example historical change: `991a57469eec27313c20d89a11968740310e2395`.
### pi-control-center

HTML placeholder showing a private-key BEGIN marker, not a complete PEM key.

- `public/index.html:734` — Private key; blob `33e71d58e48d87decb0c6c759451178bab0977c5`; exact blob at current HEAD: **True**. Example historical change: `dec6dba1a71cebfb216657067ad4b6d1c69a40d1`.
- `public/index.html:729` — Private key; blob `a04151a04969d57d5bde7391a94ec1e7685cc7df`; exact blob at current HEAD: **False**. Example historical change: `30e30fbbdf56aac1974c48b5bffd5dbe91584c5e`.
- `public/index.html:518` — Private key; blob `44a4cc8d8a554a8b7e7d6482df8c868695043b3e`; exact blob at current HEAD: **False**. Example historical change: `71f694f22809015c307204d16fbbc075a48af500`.
- `public/index.html:513` — Private key; blob `b31d68e449ab3c87c236db1d6dad6ff64d885642`; exact blob at current HEAD: **False**. Example historical change: `456db05b2f9329b548409ef5889d9db1e15109d1`.
- `public/index.html:513` — Private key; blob `4bde8870e651f90eb510b4e34c74561ff25613a8`; exact blob at current HEAD: **False**. Example historical change: `2a345f49d391ec6f4d195d5aea016ec65daa62fb`.
### SUDO-SPANDR

Markers/long matching strings embedded in the checked-in cloudflared binary; low-confidence binary matches, not confirmed private credentials.

- `cloudflared:22158` — OpenAI-like; blob `2ed603ccd1b4da2c8ccc2592e2db812787ca39bd`; exact blob at current HEAD: **False**. Example historical change: `0ae9dd1edd44c96cf87a832875f030d2597f1e13`.
- `cloudflared:22167` — OpenAI-like; blob `2ed603ccd1b4da2c8ccc2592e2db812787ca39bd`; exact blob at current HEAD: **False**. Example historical change: `0ae9dd1edd44c96cf87a832875f030d2597f1e13`.
- `cloudflared:22560` — Private key; blob `2ed603ccd1b4da2c8ccc2592e2db812787ca39bd`; exact blob at current HEAD: **False**. Example historical change: `0ae9dd1edd44c96cf87a832875f030d2597f1e13`.

## Important interpretation

A Firebase web API key is normally part of client configuration, not an authorization boundary. Its presence alone is not proof of a private API-key leak. Abuse restrictions, API enablement, authentication and database/storage rules need a separate authorized audit. Historical mock strings and BEGIN-marker placeholders are not demonstrated live credentials. Static string matches inside a binary are not proof of an embedded usable key. No match was validated with a provider, and no repository was modified except the local devpulse-ai working copy.

Limits: only configured patterns, fetched reachable Git blobs; no private repos, unfetched PR refs, unreachable/deleted objects, external caches, release assets, LFS contents, encrypted/encoded secrets, screenshots/OCR or general entropy detection. Multiple blobs can contain the same value; candidate count is not a count of unique leaked secrets.
