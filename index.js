import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import dotenv from 'dotenv';
dotenv.config();


const app = express();
const port = 3000;
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production"
    ? { rejectUnauthorized: false }
    : false,
});
/*const db = new pg.Client({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});*/

db.connect();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

let currentUserId = 1;
let users = [];

async function checkVisisted() {
  const result = await db.query(
    `SELECT vc.country_code, c.country_name
     FROM visited_countries vc
     JOIN countries c ON vc.country_code = c.country_code
     WHERE vc.user_id = $1;`,
    [currentUserId]
  );
  return result.rows; // return both country_code and country_name
}

async function getCurrentUser() {
  const result = await db.query("SELECT * FROM users");
  users = result.rows;
  return users.find((user) => user.id == currentUserId) || null;
}

app.get("/", async (req, res) => {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return res.render("index.ejs", {
      countries: [],
      total: 0,
      users,
      color: "gray",
      error: "No user found. Please add a user first.",
      currentUserId: null,
      highlightCodes: []
    });
  }

  const visited = await checkVisisted(); // contains objects with country_code and country_name

  const validColors = ["red", "orange", "yellow", "olive", "green", "teal", "blue", "violet", "purple", "pink"];
  const safeColor = validColors.includes(currentUser.color) ? currentUser.color : "gray";
res.render("index.ejs", {
  countries: visited,
  total: visited.length,
  users,
  color: safeColor,
  error: null,
  currentUserId: currentUser.id,
  highlightCodes: visited.map(c => c.country_code)
});

});

app.post("/add", async (req, res) => {
  const input = req.body["country"]?.trim().toLowerCase(); // Ensure input is trimmed and safe
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return res.render("index.ejs", {
      countries: [],
      total: 0,
      users,
      color: "gray",
      error: "No user found. Please add a user first.",
      currentUserId: null,
      highlightCodes: []
    });
  }

  if (!input) {
    return res.render("index.ejs", {
      countries: await checkVisisted(),
      total: (await checkVisisted()).length,
      users,
      color: currentUser.color,
      error: "Please enter a country name.",
      currentUserId: currentUser.id,
      highlightCodes: (await checkVisisted()).map(c => c.country_code)
    });
  }

  try {
    // Use exact match with LOWER for accurate detection
    const result = await db.query(
      "SELECT country_code FROM countries WHERE LOWER(country_name) = $1;",
      [input]
    );

  if (result.rows.length === 0) {
  const visited = await checkVisisted();
  return res.render("index.ejs", {
    countries: visited,
    total: visited.length,
    users,
    color: currentUser.color,
    error: "Country not found. Please enter a valid country name.",
    currentUserId: currentUser.id,
    highlightCodes: visited.map(c => c.country_code)
  });
}


    const countryCode = result.rows[0].country_code;

    // Check if already visited (case insensitive match already handled by code)
    const duplicateCheck = await db.query(
      "SELECT * FROM visited_countries WHERE user_id = $1 AND country_code = $2;",
      [currentUserId, countryCode]
    );
if (duplicateCheck.rows.length > 0) {
  const visited = await checkVisisted();
  return res.render("index.ejs", {
    countries: visited,
    total: visited.length,
    users,
    color: currentUser.color,
    error: "You've already added this country.",
    currentUserId: currentUser.id,
    highlightCodes: visited.map(c => c.country_code)
  });
}

    await db.query(
      "INSERT INTO visited_countries (country_code, user_id) VALUES ($1, $2)",
      [countryCode, currentUserId]
    );

    res.redirect("/");
  } catch (err) {
    console.error(err);
    res.render("index.ejs", {
      countries: await checkVisisted(),
      total: (await checkVisisted()).length,
      users,
      color: currentUser.color,
      error: "Something went wrong. Please try again.",
      currentUserId: currentUser.id,
    });
  }
});

app.post("/delete-user", async (req, res) => {
  const userIdToDelete = req.body.delete;

  try {
    // Delete visited countries first (to maintain foreign key constraints)
    await db.query("DELETE FROM visited_countries WHERE user_id = $1;", [userIdToDelete]);

    // Delete the user
    await db.query("DELETE FROM users WHERE id = $1;", [userIdToDelete]);

    // If current user was deleted, reset to first available
    const remainingUsers = await db.query("SELECT id FROM users ORDER BY id ASC LIMIT 1;");
    currentUserId = remainingUsers.rows[0]?.id || null;

    res.redirect("/");
  } catch (err) {
    console.error("User deletion error:", err);
    res.status(500).send("Failed to delete user.");
  }
});
// DELETE all visited countries for the current user
app.post("/reset-countries", async (req, res) => {
  try {
    await db.query("DELETE FROM visited_countries WHERE user_id = $1", [currentUserId]);
    res.redirect("/");
  } catch (err) {
    console.error("Reset countries error:", err);
    res.status(500).send("Failed to reset countries.");
  }
});

// DELETE a specific country for the current user
app.post("/delete-country", async (req, res) => {
  const countryCode = req.body.countryCode;
  try {
    await db.query("DELETE FROM visited_countries WHERE user_id = $1 AND country_code = $2", [currentUserId, countryCode]);
    res.redirect("/");
  } catch (err) {
    console.error("Delete country error:", err);
    res.status(500).send("Failed to delete country.");
  }
});
app.post("/delete-country", async (req, res) => {
  const countryCode = req.body.countryCode;
  try {
    await db.query("DELETE FROM visited_countries WHERE user_id = $1 AND country_code = $2", [currentUserId, countryCode]);
    res.redirect("/");
  } catch (err) {
    console.error("Delete country error:", err);
    res.status(500).send("Failed to delete country.");
  }
});
app.get("/new", (req, res) => {
  res.render("new.ejs");
});


app.post("/user", async (req, res) => {
  if (req.body.add === "new") {
    res.render("new.ejs");
  } else {
    currentUserId = req.body.user;
    res.redirect("/");
  }
});

app.post("/new", async (req, res) => {
  const name = req.body.name;
  const color = req.body.color;

  const result = await db.query(
    "INSERT INTO users (name, color) VALUES($1, $2) RETURNING *;",
    [name, color]
  );

  const id = result.rows[0].id;
  currentUserId = id;

  res.redirect("/");
});
app.get("/suggestions", async (req, res) => {
  const query = req.query.q?.toLowerCase();

  if (!query) {
    return res.json([]);
  }

  try {
    const result = await db.query(
      "SELECT country_name FROM countries WHERE LOWER(country_name) LIKE $1 LIMIT 10;",
      [`%${query}%`]
    );
    res.json(result.rows.map(row => row.country_name));
  } catch (err) {
    console.error("Suggestion error:", err);
    res.status(500).json([]);
  }
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});

    
    
    
    
    
