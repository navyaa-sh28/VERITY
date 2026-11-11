Frontend is in /frontend (Next.js App Router, TypeScript, Tailwind). Never touch /backend.
Read docs/API_CONTRACT.md for every endpoint. All backend calls use lib/api.ts. Never hardcode URLs or keys.
Auth comes from components/AuthProvider.tsx (useAuth). Statuses and colours come from lib/status.ts.
Use "use client" on pages that use hooks. Every screen needs loading, empty and error states.
Design tokens: navy #152A35, teal #218C84, gold #D4A85A, background #F7F7F5, mint #EAF3F1. Headings Montserrat, body Open Sans.
Keep each task to one page or one component. Do not install new packages unless asked.