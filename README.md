# FUELGAUGE — Diet, Fitness & Gym Tracker

A full app with a real Node.js + Express backend and MongoDB database (no more browser-only storage). Includes a built-in food database (~100 common foods with calories/protein/carbs/fat) you can search instead of typing numbers yourself.

## What's included
- `server.js` — Express server
- `models/` — MongoDB schemas (Profile, FoodLogEntry, WeightEntry, WorkoutCompletion, WorkoutPlan)
- `routes/api.js` — REST API (profile, food log, food database search, weight log, workouts)
- `data/foods.js` — built-in nutrition database
- `public/` — the frontend (HTML/CSS/JS) that talks to the API

## Why you need to run this yourself
This is a real backend with a database — it can't live inside a chat window. You need somewhere to run Node.js and somewhere to host MongoDB. Below are the two easiest paths.

## 1. Install dependencies
```bash
cd fitness-app
npm install
```

## 2. Get a MongoDB database (pick one)

**Option A — MongoDB Atlas (free, no install, works from your phone too)**
1. Go to mongodb.com/atlas and create a free account + free cluster (M0).
2. Click "Connect" → "Drivers" and copy the connection string, it looks like:
   `mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/fuelgauge`
3. Paste it into a `.env` file (see step 3).

**Option B — MongoDB running locally on your computer**
1. Install MongoDB Community Server (mongodb.com/try/download/community).
2. Start it (`mongod` or via the MongoDB Compass app).
3. Use `mongodb://localhost:27017/fuelgauge` as your connection string.

## 3. Configure environment
Copy `.env.example` to `.env` and fill in your connection string:
```bash
cp .env.example .env
```
```
PORT=3000
MONGO_URI=mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/fuelgauge
```

## 4. Run it
```bash
npm start
```
Then open `http://localhost:3000` in your browser. On your phone, use your computer's local IP (e.g. `http://192.168.1.50:3000`) while on the same Wi-Fi, or deploy it (step 5) so it's reachable from anywhere.

## 5. Put it on your phone permanently (optional)
To use this from your phone anywhere (not just home Wi-Fi), deploy the server to a free host:
- **Render.com** or **Railway.app** — connect your GitHub repo, set the `MONGO_URI` environment variable (using your Atlas connection string), deploy. You'll get a public URL like `https://fuelgauge.onrender.com` you can open on your phone and add to your home screen.

## API reference
| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/foods?q=chicken` | Search the built-in nutrition database |
| GET/POST | `/api/profile` | Get or save your profile + calculated targets |
| GET | `/api/foodlog?date=YYYY-MM-DD` | Get a day's food entries |
| POST | `/api/foodlog` | Add a food entry |
| DELETE | `/api/foodlog/:id` | Remove a food entry |
| GET/POST | `/api/weight` | Get or log weight entries |
| GET | `/api/workouts` | Get active plan + completed exercises |
| POST | `/api/workouts/plan` | Switch active workout plan |
| POST | `/api/workouts/toggle` | Mark an exercise done/undone |

## Extending the food database
Add more foods to `data/foods.js` — each entry is calories/protein/carbs/fat **per 100g**:
```js
{ name: "Your food", cal: 150, protein: 10, carb: 20, fat: 5, category: "Protein" },
```
