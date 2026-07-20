# analytics-dashboard

This workspace contains a complete user analytics demo with:

- a React-based dashboard UI
- an Express + Socket.IO analytics API
- an in-memory analytics store that tracks page visits, entry source, navigation flow, and active users

## Run locally

1. Start the backend
   - cd server
   - npm install
   - node server.js

2. Start the frontend
   - cd client
   - npm install
   - npm run dev -- --host 0.0.0.0

3. Open http://localhost:5173

## API endpoints

- POST /api/track
- POST /api/session/start
- POST /api/session/end
- GET /api/dashboard
- GET /api/dashboard/most-visited
- GET /api/dashboard/page-time
- GET /api/dashboard/navigation
- GET /api/dashboard/entry-source
- GET /api/dashboard/active-users
