# SenseCraft HMI POC Publisher

Purpose: generate anonymized JSON for the HMI Data widgets. Outputs live in `public/` and use IDs `C1` / `C2` only. Put real names as static text in the Canvas, not in the data.

## Files
- `day_config.json`, `club_schedule.json`: source configs (participants use `C1`/`C2`).
- `overrides.json`: date-keyed tweaks for late edits (see template inside).
- `build.js`: generates `public/today.json` and `public/week.json`.
- `public/`: publishable outputs.

## Generate outputs
```bash
node build.js                 # uses today
node build.js --date=2024-07-22   # optional target date
```
Outputs: `public/today.json`, `public/week.json`.

## Local test server (no GitHub needed)
```bash
cd public
python -m http.server 8000
# Data URL to use in HMI: http://<your-LAN-ip>:8000/today.json
```

## HMI Data key paths (today.json)
Point all Data widgets to the same URL; use these keys:
- Header: `day`, `date`
- Child C1: `children.C1.clothing.label`, `children.C1.pack[0].label`, `children.C1.dropoff`, `children.C1.pickup`, `children.C1.clubs[0].time`, `children.C1.clubs[0].short_name`, `children.C1.snacks`
- Child C2: swap `C1` → `C2`

## week.json shape (slim)
```json
{
  "week_order": ["Monday","Tuesday",...],
  "week": {
    "Monday": { "day": "Monday", "date": "2024-07-22", "children": { "C1": {...}, "C2": {...} } },
    "Tuesday": { ... }
  }
}
```
Use keys like: `week.Monday.children.C1.clothing.label`, `week.Monday.children.C1.dropoff`, `week.Monday.children.C1.clubs[0].short_name`, etc.

## Overrides format
```json
{
  "by_date": {
    "2024-07-22": {
      "children": {
        "C1": {
          "pickup": "17:30",
          "clubs": [
            { "time": "16:00-17:00", "name": "Creative Art Club", "short_name": "Art" }
          ]
        }
      }
    }
  }
}
```
Overrides are merged after the base build for that ISO date. Add/remove fields as needed.
