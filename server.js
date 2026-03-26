// ================================================================
// THE CULTIVAR — Update Server
// Hosted on Railway (Node.js)
// ================================================================

const express = require("express");
const fs      = require("fs");
const app     = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ----------------------------------------------------------------
// CONFIGURATION — Edit these values
// ----------------------------------------------------------------

// Bump this string every time you release an update
const CURRENT_VERSION = "1.0.0";

// Your SL avatar key (Synniah Masani) — only this key gets admin notifications
const STORE_OWNER_KEY = "2b726a23-e792-40d0-8a20-baeaa49c1b03";

// Simple admin password for the web dashboard
const ADMIN_PASSWORD = "12060404us";

// Path to persistent data file
const DATA_FILE = "./data.json";

// ----------------------------------------------------------------
// DATA HELPERS — Reads and writes owner registry to disk
// ----------------------------------------------------------------

function loadData()
{
    if (!fs.existsSync(DATA_FILE))
    {
        return { owners: [], objects: [] };
    }
    try
    {
        return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    }
    catch (e)
    {
        return { owners: [], objects: [] };
    }
}

function saveData(data)
{
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// ----------------------------------------------------------------
// ROUTES
// ----------------------------------------------------------------

// Health check — Railway uses this to confirm server is alive
app.get("/", (req, res) =>
{
    res.send("The Cultivar Update Server is running. Version: " + CURRENT_VERSION);
});

// ----------------------------------------------------------------
// POST /check — Called by LSL UpdateClient on every rez
//
// Expected body params (sent as form data from llHTTPRequest):
//   owner_key    — SL avatar UUID of the item owner
//   owner_name   — Display name
//   object_key   — UUID of the rezzed object
//   item_name    — e.g. "TC_HUD", "TC_GrowLight"
//   version      — Client's current version string
//   region       — Region name the object is in
// ----------------------------------------------------------------
app.post("/check", (req, res) =>
{
    const ownerKey  = req.body.owner_key  || "";
    const ownerName = req.body.owner_name || "Unknown";
    const objectKey = req.body.object_key || "";
    const itemName  = req.body.item_name  || "Unknown Item";
    const version   = req.body.version    || "0.0.0";
    const region    = req.body.region     || "Unknown Region";

    if (!ownerKey || !objectKey)
    {
        return res.status(400).send("INVALID_REQUEST");
    }

    const data = loadData();
    const now  = new Date().toISOString();

    // Register or update owner entry
    let ownerEntry = data.owners.find(o => o.key === ownerKey);
    if (!ownerEntry)
    {
        ownerEntry = {
            key:          ownerKey,
            name:         ownerName,
            registeredAt: now,
            items:        []
        };
        data.owners.push(ownerEntry);
        console.log("[NEW OWNER] " + ownerName + " (" + ownerKey + ") — " + itemName);
    }

    // Track which items this owner has
    if (!ownerEntry.items.includes(itemName))
    {
        ownerEntry.items.push(itemName);
    }
    ownerEntry.name     = ownerName;
    ownerEntry.lastSeen = now;

    // Register or update object entry
    let objEntry = data.objects.find(o => o.key === objectKey);
    if (!objEntry)
    {
        objEntry = {
            key:      objectKey,
            ownerKey: ownerKey,
            itemName: itemName,
            version:  version,
            region:   region,
            lastSeen: now
        };
        data.objects.push(objEntry);
    }
    else
    {
        objEntry.version  = version;
        objEntry.region   = region;
        objEntry.lastSeen = now;
    }

    saveData(data);

    // Version check response
    if (version === CURRENT_VERSION)
    {
        return res.send("UP_TO_DATE|" + CURRENT_VERSION);
    }
    else
    {
        return res.send("UPDATE_AVAILABLE|" + CURRENT_VERSION);
    }
});

// ----------------------------------------------------------------
// GET /version — Simple version check endpoint
// LSL can poll this to just get the current version number
// ----------------------------------------------------------------
app.get("/version", (req, res) =>
{
    res.send(CURRENT_VERSION);
});

// ----------------------------------------------------------------
// GET /admin — Simple web dashboard (password protected)
// Visit https://your-railway-url/admin?pw=yourpassword
// ----------------------------------------------------------------
app.get("/admin", (req, res) =>
{
    if (req.query.pw !== ADMIN_PASSWORD)
    {
        return res.status(401).send("Unauthorized");
    }

    const data  = loadData();
    const total = data.owners.length;
    const objs  = data.objects.length;

    // Build item breakdown
    const itemCounts = {};
    data.owners.forEach(o =>
    {
        o.items.forEach(item =>
        {
            itemCounts[item] = (itemCounts[item] || 0) + 1;
        });
    });

    let itemRows = "";
    Object.keys(itemCounts).forEach(item =>
    {
        itemRows += "<tr><td>" + item + "</td><td>" + itemCounts[item] + "</td></tr>";
    });

    let ownerRows = "";
    data.owners.slice(-50).reverse().forEach(o =>
    {
        ownerRows += "<tr><td>" + o.name + "</td><td>" + o.key + "</td><td>" +
                     o.items.join(", ") + "</td><td>" + o.lastSeen + "</td></tr>";
    });

    res.send(`
        <html>
        <head>
            <title>The Cultivar — Update Server Dashboard</title>
            <style>
                body { font-family: Arial, sans-serif; background: #111; color: #eee; padding: 20px; }
                h1 { color: #cc3300; }
                h2 { color: #d4a820; margin-top: 30px; }
                .stat { display: inline-block; background: #222; padding: 15px 25px;
                        margin: 10px; border-radius: 8px; text-align: center; }
                .stat .num { font-size: 2em; font-weight: bold; color: #cc3300; }
                table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                th { background: #222; padding: 8px; text-align: left; color: #d4a820; }
                td { padding: 6px 8px; border-bottom: 1px solid #333; font-size: 0.85em; }
                tr:hover td { background: #1a1a1a; }
            </style>
        </head>
        <body>
            <h1>🌿 The Cultivar — Update Server</h1>
            <p>Current Version: <strong style="color:#d4a820">${CURRENT_VERSION}</strong></p>

            <div class="stat"><div class="num">${total}</div>Registered Owners</div>
            <div class="stat"><div class="num">${objs}</div>Tracked Objects</div>

            <h2>Items In The Wild</h2>
            <table>
                <tr><th>Item</th><th>Owner Count</th></tr>
                ${itemRows}
            </table>

            <h2>Recent Owners (last 50)</h2>
            <table>
                <tr><th>Name</th><th>Key</th><th>Items</th><th>Last Seen</th></tr>
                ${ownerRows}
            </table>
        </body>
        </html>
    `);
});

// ----------------------------------------------------------------
// START SERVER
// ----------------------------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
{
    console.log("The Cultivar Update Server running on port " + PORT);
    console.log("Current version: " + CURRENT_VERSION);
});
