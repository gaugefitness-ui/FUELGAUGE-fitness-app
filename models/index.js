const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  name: { type: String, default: "" },
  phone: { type: String, default: "" },
  avatar: { type: String, default: "" },
  verified: { type: Boolean, default: false },
  verifyCode: String,
  verifyExpires: Date,
  premium: { type: Boolean, default: false },
  premiumPlan: { type: String, default: "" },
  premiumExpires: Date,
  admin: { type: Boolean, default: false },
  googleId: { type: String, default: null },
  plan: { type: String, default: "basic" },
  planExpiresAt: { type: Date, default: null },
  lastLogin: Date,
}, { timestamps: true });

const ProfileSchema = new mongoose.Schema({
  userId: { type: String, default: "default", unique: true },
  age: Number,
  sex: String,
  height: Number,
  weight: Number,
  activity: Number,
  goal: Number,
  target: {
    cal: Number,
    protein: Number,
    carb: Number,
    fat: Number,
  },
}, { timestamps: true });

const FoodLogEntrySchema = new mongoose.Schema({
  userId: { type: String, default: "default" },
  date: { type: String, required: true }, // YYYY-MM-DD
  name: String,
  grams: Number,
  cal: Number,
  protein: Number,
  carb: Number,
  fat: Number,
}, { timestamps: true });

const WeightEntrySchema = new mongoose.Schema({
  userId: { type: String, default: "default" },
  date: { type: String, required: true },
  weight: Number,
}, { timestamps: true });

const WorkoutCompletionSchema = new mongoose.Schema({
  userId: { type: String, default: "default" },
  key: { type: String, required: true }, // e.g. "ppl|0|2"
  done: { type: Boolean, default: true },
}, { timestamps: true });

const WorkoutPlanSchema = new mongoose.Schema({
  userId: { type: String, default: "default" },
  activePlan: { type: String, default: "push-pull-legs" },
}, { timestamps: true });

const PaymentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true },
  plan: { type: String, required: true },
  amount: { type: Number, required: true },
  method: { type: String, required: true },
  reference: { type: String, default: "" },
  payerName: { type: String, default: "" },
  status: { type: String, default: "pending" },
}, { timestamps: true });

const WaterLogSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  date: { type: String, required: true },
  glasses: { type: Number, default: 0 },
}, { timestamps: true });

const MeasurementSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  date: { type: String, required: true },
  chest: Number,
  waist: Number,
  hips: Number,
  biceps: Number,
  thighs: Number,
  calves: Number,
}, { timestamps: true });

const WorkoutLogSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  date: { type: String, required: true },
  planKey: String,
  dayIndex: Number,
  exerciseIndex: Number,
  exerciseName: String,
  sets: Number,
  reps: Number,
  weight: Number,
  duration: Number,
  completed: { type: Boolean, default: false },
}, { timestamps: true });

const PersonalRecordSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  exerciseName: { type: String, required: true },
  weight: Number,
  reps: Number,
  date: { type: String, required: true },
}, { timestamps: true });

const GymSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  name: { type: String, required: true },
  address: { type: String, default: "" },
  phone: { type: String, default: "" },
  website: { type: String, default: "" },
  hours: { type: String, default: "" },
  lat: { type: Number, default: 0 },
  lng: { type: Number, default: 0 },
}, { timestamps: true });

module.exports = {
  User: mongoose.model("User", UserSchema),
  Profile: mongoose.model("Profile", ProfileSchema),
  FoodLogEntry: mongoose.model("FoodLogEntry", FoodLogEntrySchema),
  WeightEntry: mongoose.model("WeightEntry", WeightEntrySchema),
  WorkoutCompletion: mongoose.model("WorkoutCompletion", WorkoutCompletionSchema),
  WorkoutPlan: mongoose.model("WorkoutPlan", WorkoutPlanSchema),
  Payment: mongoose.model("Payment", PaymentSchema),
  WaterLog: mongoose.model("WaterLog", WaterLogSchema),
  Measurement: mongoose.model("Measurement", MeasurementSchema),
  WorkoutLog: mongoose.model("WorkoutLog", WorkoutLogSchema),
  PersonalRecord: mongoose.model("PersonalRecord", PersonalRecordSchema),
  Gym: mongoose.model("Gym", GymSchema),
};
