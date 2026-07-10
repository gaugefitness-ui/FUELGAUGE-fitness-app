// Premium-only library: standalone physical exercise routines (separate from the
// gym "Train" workout plans), each with an estimated calorie burn for logging.
module.exports = [
  { name: "Brisk walking", category: "Cardio", caloriesPerMin: 5, desc: "Steady pace, outdoors or treadmill." },
  { name: "Jogging", category: "Cardio", caloriesPerMin: 9, desc: "Light continuous run." },
  { name: "Running, fast pace", category: "Cardio", caloriesPerMin: 13, desc: "~10km/h or faster." },
  { name: "Cycling, moderate", category: "Cardio", caloriesPerMin: 8, desc: "Outdoor or stationary bike." },
  { name: "Jump rope", category: "Cardio", caloriesPerMin: 12, desc: "Continuous skipping." },
  { name: "Swimming, freestyle", category: "Cardio", caloriesPerMin: 10, desc: "Moderate continuous laps." },
  { name: "Stair climbing", category: "Cardio", caloriesPerMin: 9, desc: "Stairmaster or real stairs." },
  { name: "HIIT circuit", category: "Cardio", caloriesPerMin: 11, desc: "20s on / 10s off intervals." },
  { name: "Yoga, vinyasa flow", category: "Mobility", caloriesPerMin: 4, desc: "Flowing poses, breath-led." },
  { name: "Stretching / mobility flow", category: "Mobility", caloriesPerMin: 3, desc: "Full body, slow and controlled." },
  { name: "Bodyweight circuit", category: "Strength", caloriesPerMin: 8, desc: "Push-ups, squats, lunges, planks." },
  { name: "Dancing", category: "Cardio", caloriesPerMin: 7, desc: "Freestyle or class." },
  { name: "Hiking", category: "Cardio", caloriesPerMin: 7, desc: "Outdoor trail, moderate incline." },
  { name: "Boxing / shadow boxing", category: "Cardio", caloriesPerMin: 10, desc: "Combos, footwork, no bag needed." },
  { name: "Pilates", category: "Mobility", caloriesPerMin: 4, desc: "Core-focused control work." },
];
