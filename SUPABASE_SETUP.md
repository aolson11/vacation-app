# Supabase Setup

## 1. Create the table

Run the SQL in `supabase/events_schema.sql` inside the Supabase SQL Editor.

## 2. Add environment variables locally

Create a local `.env.local` file with:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

## 3. Restart the dev server

After saving `.env.local`, restart `npm run dev`.

## 4. Notes

- The app reads and writes through `app/api/events/route.ts`.
- For local development, the route uses `SUPABASE_SERVICE_ROLE_KEY` if present, otherwise falls back to `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Do not expose the service role key to the browser.
