import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pg;
const app = express();
app.set("etag", false);

// ✅ IMPORTANT: Disable ETag so browser/CDN won't return 304 for dynamic routes
app.set("etag", false);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : false,
});

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

let currentUserId = 1;
let users = [];

// ✅ helper to reuse visited countries list
async function checkVisisted() {
  const result = await pool.query(
    `SELECT vc.country_code, c.country_name
     FROM visited_countries vc
     JOIN countries c ON vc.country_code = c.country_code
     WHERE vc.user_id = $1;`,
    [currentUserId]
  );
  return result.rows;
}

async function getCurrentUser() {
  const result = await pool.query("SELECT * FROM users");
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
      highlightCodes: [],
    });
  }

  const visited = await checkVisisted();

  const validColors = [
    "red",
    "orange",
    "yellow",
    "olive",
    "green",
    "teal",
    "blue",
    "violet",
    "purple",
    "pink",
  ];
  const safeColor = validColors.includes(currentUser.color)
    ? currentUser.color
    : "gray";

  res.render("index.ejs", {
    countries: visited,
    total: visited.length,
    users,
    color: safeColor,
    error: null,
    currentUserId: currentUser.id,
    highlightCodes: visited.map((c) => c.country_code),
  });
});

app.post("/add", async (req, res) => {
  const input = req.body["country"]?.trim().toLowerCase();
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return res.render("index.ejs", {
      countries: [],
      total: 0,
      users,
      color: "gray",
      error: "No user found. Please add a user first.",
      currentUserId: null,
      highlightCodes: [],
    });
  }

  if (!input) {
    const visited = await checkVisisted();
    return res.render("index.ejs", {
      countries: visited,
      total: visited.length,
      users,
      color: currentUser.color,
      error: "Please enter a country name.",
      currentUserId: currentUser.id,
      highlightCodes: visited.map((c) => c.country_code),
    });
  }

  try {
    const result = await pool.query(
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
        highlightCodes: visited.map((c) => c.country_code),
      });
    }

    const countryCode = result.rows[0].country_code;

    const duplicateCheck = await pool.query(
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
        highlightCodes: visited.map((c) => c.country_code),
      });
    }

    await pool.query(
      "INSERT INTO visited_countries (country_code, user_id) VALUES ($1, $2)",
      [countryCode, currentUserId]
    );

    res.redirect("/");
  } catch (err) {
    console.error(err);
    const visited = await checkVisisted();
    res.render("index.ejs", {
      countries: visited,
      total: visited.length,
      users,
      color: currentUser.color,
      error: "Something went wrong. Please try again.",
      currentUserId: currentUser.id,
      highlightCodes: visited.map((c) => c.country_code),
    });
  }
});

app.post("/delete-user", async (req, res) => {
  const userIdToDelete = req.body.delete;

  try {
    await pool.query("DELETE FROM visited_countries WHERE user_id = $1;", [
      userIdToDelete,
    ]);
    await pool.query("DELETE FROM users WHERE id = $1;", [userIdToDelete]);

    const remainingUsers = await pool.query(
      "SELECT id FROM users ORDER BY id ASC LIMIT 1;"
    );
    currentUserId = remainingUsers.rows[0]?.id || null;

    res.redirect("/");
  } catch (err) {
    console.error("User deletion error:", err);
    res.status(500).send("Failed to delete user.");
  }
});

app.post("/reset-countries", async (req, res) => {
  try {
    await pool.query("DELETE FROM visited_countries WHERE user_id = $1", [
      currentUserId,
    ]);
    res.redirect("/");
  } catch (err) {
    console.error("Reset countries error:", err);
    res.status(500).send("Failed to reset countries.");
  }
});

// ✅ KEEP ONLY ONE delete-country route (you had it twice)
app.post("/delete-country", async (req, res) => {
  const countryCode = req.body.countryCode;
  try {
    await pool.query(
      "DELETE FROM visited_countries WHERE user_id = $1 AND country_code = $2",
      [currentUserId, countryCode]
    );
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

  const result = await pool.query(
    "INSERT INTO users (name, color) VALUES($1, $2) RETURNING *;",
    [name, color]
  );

  currentUserId = result.rows[0].id;
  res.redirect("/");
});

// ✅ FIXED: Suggestions route now returns name + code
// ✅ FIXED: No-cache headers to prevent 304 Not Modified issues
app.get("/suggestions", async (req, res) => {
  // prevent caching on CDN/browser
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  res.set("Surrogate-Control", "no-store");

  const query = req.query.q?.toLowerCase().trim();

  if (!query) return res.json([]);

  try {
    const result = await pool.query(
      `SELECT country_name, country_code
       FROM countries
       WHERE LOWER(country_name) LIKE $1
       ORDER BY country_name
       LIMIT 10;`,
      [`%${query}%`]
    );

    // return objects (frontend can show name + store code)
    res.json(
      result.rows.map((row) => ({
        name: row.country_name,
        code: row.country_code,
      }))
    );
  } catch (err) {
    console.error("Suggestion error:", err);
    res.status(500).json([]);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => console.log(`Running on ${PORT}`));
