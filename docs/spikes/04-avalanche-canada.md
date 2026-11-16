# Spike 4: Avalanche Canada

Nov 15, 2026.

## Question

What do Avalanche Canada's terms allow, including keeping bulletins offline?

## What I read

- Terms of Use: https://avalanche.ca/terms-of-use
- Data Sharing Policy (updated Feb 12, 2026): https://avalanche.ca/data-sharing-policy
- API documentation: https://avalanche.ca/api-docs

## Result

- **No API-specific terms.** The API page links only the general website Terms of Use.
- The Terms of Use say the site's text and graphics "may not be reproduced or copied without prior written consent", and use of their trademarks and logos needs written permission.
- The Data Sharing Policy points public users to "our public APIs" and says they may ask users to disclose how data is used and sign an agreement. Requests go to research@avalanche.ca; general questions to info@avalanche.ca.
- Nothing says whether bulletins may be stored offline.
- **The API addresses have changed** from the docs: forecasts at `https://avcan-services-api.prod.avalanche.ca` (areas, metadata, products), weather stations at `https://weather.prod.avalanche.ca`. Mountain Information Network reports need an API key.

## Consequence

Kaden's email is needed before the avalanche layer. The draft is below. The cloud environment will need the two new API hosts allowed when that layer is built.

## Draft email for Kaden

> **To:** info@avalanche.ca (cc research@avalanche.ca)
> **Subject:** Using the public forecast API in a personal, non-commercial app
>
> Hello,
>
> I'm building a personal weather and trip-planning app for my own ski touring in BC. It may be shared with a few friends, and it will never be sold or carry ads. I'd like to show Avalanche Canada forecasts in it, and I want to make sure that's within your terms.
>
> How I would use the data:
>
> - Read forecast areas, metadata and products from your public API (avcan-services-api.prod.avalanche.ca).
> - Show them exactly as issued: your danger ratings and colours, problems, travel advice, issue and expiry times, Avalanche Canada named as the source, and a link to the full forecast on avalanche.ca. No re-scoring, summarising or changes.
> - Fetch only when the app is open, and cache politely.
>
> My questions:
>
> 1. Is this use acceptable, and is there an attribution wording or logo use you prefer?
> 2. May the app keep a copy of the current bulletin on the phone for use without signal (for a day's trip), clearly marked with its issue and expiry times and as expired once past?
> 3. May I show the ATES terrain ratings that you publish as KMZ files, imported by hand for areas I travel in?
> 4. Is there a request rate you'd like apps to stay under?
>
> Thank you for the forecasts. They're the first thing I check.
>
> Kaden Foy
