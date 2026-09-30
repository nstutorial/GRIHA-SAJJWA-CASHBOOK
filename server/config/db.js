const path = require("path");
const mongoose = require("mongoose");

require("dotenv").config({ path: path.join(__dirname, "..", ".env"), quiet: true });

const mongoUri =
  process.env.MONGODB_URI ||
  process.env.MONGO_URI ||
  process.env.DATABASE_URL ||
  "mongodb://127.0.0.1:27017/gs_steel_cashbook";

async function connectDB() {
  await mongoose.connect(mongoUri);
  return mongoose.connection;
}

module.exports = {
  connectDB,
  mongoUri
};
