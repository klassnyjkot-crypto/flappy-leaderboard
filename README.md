Flappy leaderboard server (Node + Postgres).
Endpoints:
- POST /score  { token, score, name? }  -> updates best_score only if higher
- POST /record (alias of /score)
- GET  /leaders?limit=10  -> returns top N players
- GET  /me?token=... -> returns player's best
