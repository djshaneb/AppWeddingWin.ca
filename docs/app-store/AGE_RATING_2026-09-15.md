# Saved App Store age rating — September 15, 2026

WeddingWin Canada (Apple ID 6806603211) has a saved **18+ override**. The owner explicitly authorized completing the questionnaire and choosing 18+. Apple calculated 13+ from the descriptors; the higher rating was selected separately. Save succeeded at approximately 21:32 UTC. After reloading App Information, the rating persisted, and the country details explicitly listed **Canada under 18+**. Apple shows a global **17+** rating, with regional exceptions, for operating systems earlier than version 26.

This is an App Store metadata change. No app code, build configuration, backend eligibility, public terms, App Review submission or public release was changed. The rating is not an in-app age-verification mechanism. Existing draw eligibility remains separate.

## Recorded questionnaire answers

| Field | Saved answer | Basis |
| --- | --- | --- |
| Parental Controls | No | No parental management feature identified. |
| Age Assurance | No | The implementation derives an attestation from general terms acceptance; it does not check DOB, call the Declared Age Range API, estimate age or verify identity. |
| Unrestricted Web Access | No | Main-frame WebView navigation is restricted to WeddingWin/WedWebsite domains; other HTTPS destinations open the system browser. |
| User-Generated Content | Yes | Public profiles, reviews, galleries and wedding content. |
| Social Media | Yes | Interpretation of Apple's broad similar-discovery definition: the embedded directory publicly distributes member/vendor reviews and galleries and allows public review interaction. This does not claim a conventional social feed. |
| Social Media Disabled for Users Under 13 | No | No Declared Age Range API or corresponding social-content gate exists. |
| Messaging and Chat | Yes | Direct couple/vendor conversations. |
| Advertising | No | Owner explicitly confirmed only unpaid listings/content and no paid or sponsored promotions. |
| Profanity or Crude Humor | None | No occurrences identified in representative content inspection. |
| Horror/Fear Themes | None | No occurrences identified in representative content inspection. |
| Alcohol, Tobacco, or Drug Use or References | Infrequent | Incidental venue/bar and celebration references. |
| Medical or Treatment Information | Infrequent | Public beauty-treatment listings include procedure information and suggested timing. |
| Health or Wellness Topics | Yes | Public fitness/yoga listings include self-care, exercise and dietary advice. |
| Mature or Suggestive Themes | Infrequent | Public boudoir service descriptions and imagery. |
| Sexual Content or Nudity | Infrequent | A reviewed boudoir gallery contains non-graphic partial nudity; lingerie portraits also occur. |
| Graphic Sexual Content and Nudity | None | None identified in the reviewed content. |
| Cartoon or Fantasy Violence | None | None identified in app features or representative content. |
| Realistic Violence | None | None identified in app features or representative content. |
| Prolonged Graphic or Sadistic Realistic Violence | None | None identified in app features or representative content. |
| Guns or Other Weapons | None | None identified in app features or representative content. |
| Simulated Gambling | None | No wagering simulation identified. |
| Contests | Frequent | QR Bingo and optional vendor draws are prominent, repeatedly encountered features during participating events. Actual entry remains event-dependent; this frequency judgment does not claim year-round entry availability. |
| Gambling | No | No implemented betting, paid draw entry, wagering balance or purchase of improved odds was identified. This descriptor is not a legal conclusion about promotion arrangements. |
| Loot Boxes | No | No purchase of randomized virtual items identified. |
| Age category/override | Override to Higher Age Rating: Age 18+ | Owner's selected adult audience; calculated rating was 13+. |
| Age Suitability URL | Blank | Optional; no dedicated age-suitability page supplied. |

## Evidence and limits

The review included native feature/navigation source and representative public content reachable through embedded WeddingWin pages. It is not an exhaustive inspection of every changing member post. Revisit the descriptors when content or capabilities change.

- Navigation policy: `lib/webview_url_policy.ts`; WebView navigation/new-window handling and general agreement behavior in `app/(tabs)/index.tsx`.
- Public discovery/interaction: [Sound of Harmony profile](https://www.weddingwin.ca/wedding-dj/niagara-falls/sound-of-harmony) and [reviews](https://www.weddingwin.ca/wedding-dj/niagara-falls/sound-of-harmony/reviews).
- Alcohol references: [Pour Baby](https://www.weddingwin.ca/wedding-mobile-bar/burlington/pour-baby) and [Brunswick Bierworks](https://www.weddingwin.ca/wedding-venues/east-york/brunswick-bierworks).
- Medical content: [Vitality Derm Surg](https://www.weddingwin.ca/wedding-beauty-treatment/pelham/vitality-derm-surg).
- Wellness: [Namaste Yoga](https://www.weddingwin.ca/wedding-workout/calgary/namaste-yoga) and [NDG Fitness Center](https://www.weddingwin.ca/wedding-workout/montreal/ndg-fitness-center).
- Mature/non-graphic content: all four images in the [Boudoir Atelier gallery](https://www.weddingwin.ca/photo-albums/boudoir-atelier) were visually inspected.
- Apple: [Age-rating definitions](https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions/) and [higher-rating override](https://developer.apple.com/help/app-store-connect/manage-app-information/set-an-app-age-rating/).

Remaining privacy, content-rights, copyright, reviewer-access, installation/testing and submission requirements remain tracked in [release readiness](RELEASE_READINESS.md). Completing the age rating does not resolve those separate items.
