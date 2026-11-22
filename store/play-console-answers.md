# Google Play Console: answers for Gridquake

What the app really does, as the basis for the forms in Play Console (section "App content" / "Policy"). The owner fills in the forms; the exact screens are walked through step by step.

## App details
- App name: Gridquake: Block Puzzle
- Default language: English (United States), en-US
- App or game: Game · Free
- Category: Puzzle
- Package name (from the uploaded bundle): `be.proqltc.gridquake`

## Privacy policy
https://proqltc-prog.github.io/gridquake/privacy.html (version 1.3)

## Ads
Yes, the app contains ads (Google AdMob: reward videos the player chooses, and a short ad after every fifth game).

## App access
All functionality is available without special access. There is no login with e-mail or password: the account is anonymous and made automatically. (A username is chosen in the app for leaderboards and duels.)

## Content rating (IARC questionnaire)
- Category: Game (puzzle).
- Violence: no. (Blocks burst and "bombs" clear cells; no people, animals or blood.)
- Fear / horror: no. Sexuality / nudity: no. Bad language: no. Drugs, alcohol, tobacco: no.
- Simulated gambling: no. The "Wheel of Luck" is a free daily spin for in-game coins and helpers; nothing is bet, nothing can be bought with money, and nothing has value outside the game.
- Users interact or share content: yes, limited. Players see each other's chosen username and scores on leaderboards and in duels. There is no chat and no free text between players; usernames are filtered for offensive words.
- Shares the user's location: no. Digital purchases: no. Unrestricted internet access (e.g. a browser): no.

## Target audience and content
- Target age groups: 13–15, 16–17 and 18 and over. Not designed for children under 13 (the ads are not set up for children).
- Could the app unintentionally appeal to children? Answer honestly in the form; the store listing and graphics are not aimed at children.

## Data safety
- Does the app collect or share user data? Yes.
- Is all collected data encrypted in transit? Yes (HTTPS).
- Can users ask for their data to be deleted? Yes: in the app (Settings → Delete username and data) and by e-mail. Deletion URL: https://proqltc-prog.github.io/gridquake/privacy.html#en

Data types (all required for the app to work; none optional except personalised ads, which follow the consent form):

| Data type (Play category) | Collected | Shared | Purpose | Source |
|---|---|---|---|---|
| Personal info → User IDs (anonymous account ID, chosen username, friend code) | yes | no | App functionality, Fraud prevention, security and compliance | our server (Supabase, EU) |
| App activity → Other in-app actions / game progress (scores, levels, stars, medals, duels, coins and helpers) | yes | no | App functionality, Fraud prevention | our server |
| Device or other IDs (advertising ID) | yes | yes | Advertising or marketing, Analytics, Fraud prevention | Google Mobile Ads SDK |
| Location → Approximate location (from the IP address, used by the ads SDK) | yes | yes | Advertising or marketing, Fraud prevention | Google Mobile Ads SDK |
| App activity → App interactions (ad views and taps) | yes | yes | Advertising or marketing, Analytics | Google Mobile Ads SDK |
| App info and performance → Crash logs, Diagnostics (ads SDK) | yes | yes | Analytics, Fraud prevention | Google Mobile Ads SDK |

Not collected: name, e-mail, phone, address, age, precise location, contacts, photos, files, messages, health, financial info, web history.
Check before submitting: Google's own list for the Mobile Ads SDK ("Data disclosure" in the AdMob help) can change; follow that page for the SDK rows.

## Advertising ID declaration
Yes, the app uses an advertising ID: for advertising (Google AdMob). (The permission `com.google.android.gms.permission.AD_ID` comes in through the ads SDK.)

## Other declarations
- Government app: no. Financial features: none. Health: no. News app: no. COVID-19 app: no.
- In-app purchases: none (coins cannot be bought).

## Closed testing
- Track: Closed testing → a new track (or "Alpha").
- Testers: a list of Gmail addresses (or a Google Group). Testers open the opt-in link, accept, then install from Google Play.
- Countries: at least Belgium and the Netherlands (more as wished).
- Personal developer accounts made after 13 November 2023 need at least 12 testers who stay opted in for 14 days in a row before production access can be requested.
- Ads in the test: real ads. Testers must never tap an ad on purpose (AdMob can block the account for invalid clicks). Add the test phones as test devices in AdMob (Settings → Test devices) so they see test ads.
