# Lead Engine dashboard

Next.js app on Vercel. Shows jobs, leads, mockups, sent emails and replies, and lets you queue scrapes.
The worker (Railway) and the laptop scripts talk to it with the `x-worker-token` header.

Deploy steps are in `../FRESH-INSTALL.md` (step 5). Environment variables are listed in `.env.local.example`.

Local preview: `cp .env.local.example .env.local`, fill it in, then `npm install` and `npm run dev`.
