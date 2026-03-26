// ================================================================
// THE CULTIVAR — Update Server
// Hosted on Render.com (Node.js)
// ================================================================

const express = require("express");
const fs      = require("fs");
const app     = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ----------------------------------------------------------------
// CONFIGURATION — Edit these values
// ----------------------------------------------------------------

// Your SL avatar key (Synniah Masani)
const STORE_OWNER_KEY = "2b726a23-e792-40d0-8a20-baeaa49c1b03";

// Simple admin password for the web dashboard
const ADMIN_PASSWORD = "12060404us";

// Path to persistent data file
const DATA_FILE = "./data.json";

// ----------------------------------------------------------------
// PER-ITEM VERSION TABLE
// When you update specific items, only bump those version numbers.
// Players who own other items will not be notified.
//
// HOW TO UPDATE:
//   - Change the version number for the item(s) you updated
//   - Push to GitHub — Render auto-redeploys
//   - Only owners of that specific item will see the update dialog
// ----------------------------------------------------------------
const CURRENT_VERSIONS = {
    "TC_HUD":           "1.0.0",
    "TC_GrowLight":     "1.0.0",
    "TC_WeedJar":       "1.0.0",
    "TC_BaggingTable":  "1.0.0",
    "TC_RollingTable":  "1.0.0",
    "TC_StashBox":      "1.0.0",
    "TC_Plant":         "1.0.0",
    "TC_SessionObject": "1.0.0",
    "TC_PlugBoard":     "1.0.0"
};

// ----------------------------------------------------------------
// DATA HELPERS
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

app.get("/", (req, res) =>
{
    res.send("The Cultivar Update Server is running.");
});

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

    if (!ownerEntry.items.includes(itemName))
    {
        ownerEntry.items.push(itemName);
    }
    ownerEntry.name     = ownerName;
    ownerEntry.lastSeen = now;

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

    // Look up the correct version for this specific item
    const latestVersion = CURRENT_VERSIONS[itemName] || "1.0.0";

    if (version === latestVersion)
    {
        return res.send("UP_TO_DATE|" + latestVersion);
    }
    else
    {
        return res.send("UPDATE_AVAILABLE|" + latestVersion);
    }
});

app.get("/versions", (req, res) =>
{
    res.json(CURRENT_VERSIONS);
});

app.get("/admin", (req, res) =>
{
    if (req.query.pw !== ADMIN_PASSWORD)
    {
        return res.status(401).send("Unauthorized");
    }

    const data  = loadData();
    const total = data.owners.length;
    const objs  = data.objects.length;

    const itemCounts = {};
    data.owners.forEach(o =>
    {
        o.items.forEach(item =>
        {
            itemCounts[item] = (itemCounts[item] || 0) + 1;
        });
    });

    let itemRows = "";
    Object.keys(CURRENT_VERSIONS).forEach(item =>
    {
        const count = itemCounts[item] || 0;
        itemRows += "<tr><td>" + item + "</td><td>" +
                    CURRENT_VERSIONS[item] + "</td><td>" +
                    count + "</td></tr>";
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

            <div class="stat"><div class="num">${total}</div>Registered Owners</div>
            <div class="stat"><div class="num">${objs}</div>Tracked Objects</div>

            <h2>Current Versions & Owner Counts</h2>
            <table>
                <tr><th>Item</th><th>Current Version</th><th>Owners With This Item</th></tr>
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
{
    console.log("The Cultivar Update Server running on port " + PORT);
    console.log("Per-item versions:", CURRENT_VERSIONS);
});
