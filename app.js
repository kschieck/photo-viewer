// app.js
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar'); // for watching the images directory
const moment = require('moment');
const sharp = require('sharp'); // For creating image thumbnails

const app = express();
const PORT = 8080;
const IMAGE_DIR = '/mnt/usb/nas/images'; // Set your image directory here
const THUMBNAIL_DIR = '/mnt/usb/nas/image_thumbnails';
const PUBLIC_DIR = path.join(__dirname, 'public');

// Ensure the thumbnail directory exists
if (!fs.existsSync(THUMBNAIL_DIR)) {
    fs.mkdirSync(THUMBNAIL_DIR, { recursive: true });
}

// Generate a thumbnail for an image
function createThumbnail(imagePath, thumbnailPath) {
    const dir = path.dirname(thumbnailPath);

    // Ensure the directory exists
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true }); // Create the directory and all necessary subdirectories
    }

    // Generate the thumbnail
    sharp(imagePath)
        .resize({ width: 200, height: 200, fit: 'inside' }) // Adjust logic as needed
        .toFile(thumbnailPath)
        .then(() => console.log(`Thumbnail created: ${thumbnailPath}`))
        .catch((err) => console.error(`Error creating thumbnail: ${err.message}`));
}

// SQLite3 database
const db = new sqlite3.Database('./imageDatabase.db', (err) => {
    if (err) {
        console.error(err.message);
        process.exit(1);
    }
    console.log('Connected to SQLite3 database.');
});

// Create tables
const createTables = `
CREATE TABLE IF NOT EXISTS images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    relativePath TEXT UNIQUE NOT NULL,
    dateTaken TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    imageId INTEGER NOT NULL,
    tag TEXT NOT NULL,
    dateAdded DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(imageId, tag),
    FOREIGN KEY (imageId) REFERENCES images(id) ON DELETE CASCADE
);
`;

db.exec(createTables, (err) => {
    if (err) console.error('Error creating tables:', err.message);
});

// Middleware
app.use(express.static(PUBLIC_DIR));
app.use(express.json());

// Parse date from filename or use file's last modified time
function parseDateFromFilename(filename) {
    // Prefix could be IMG, MVIMG, PXL, etc. Example: PXL_12345678_123456123.jpg
    const regex = /^.*_(\d{8})_(\d{6})\d{3}/;
    const match = filename.match(regex);
    if (match) {
        const dateStr = match[1] + match[2];
        return moment(dateStr, 'YYYYMMDDHHmmss').toISOString();
    }
    return null;
}

// Validate files and update the database
async function validateDatabaseAndFiles() {
    const files = fs.readdirSync(IMAGE_DIR);
    files.forEach((file) => {
        const filePath = path.join(IMAGE_DIR, file);
        const stat = fs.statSync(filePath);
        const dateTaken = parseDateFromFilename(file) || stat.mtime.toISOString();
        const relativePath = path.relative(IMAGE_DIR, filePath);
        const thumbnailPath = path.join(THUMBNAIL_DIR, relativePath);

        if (!fs.existsSync(thumbnailPath)) {
            createThumbnail(filePath, thumbnailPath);
        }

        db.get('SELECT id FROM images WHERE relativePath = ?', [relativePath], (err, row) => {
            if (err) {
                console.error('Error querying database:', err.message);
            } else if (!row) {
                db.run('INSERT INTO images (relativePath, dateTaken) VALUES (?, ?)', [relativePath, dateTaken], (err) => {
                    if (err) console.error('Error inserting image:', err.message);
                });
            }
        });
    });
}

// Watch directory for changes
function watchDirectory() {
    const watcher = chokidar.watch(IMAGE_DIR, { persistent: true });

    watcher.on('add', (filePath) => {
        const relativePath = path.relative(IMAGE_DIR, filePath);
        const thumbnailPath = path.join(THUMBNAIL_DIR, relativePath);

        const dateTaken = parseDateFromFilename(path.basename(filePath)) || fs.statSync(filePath).mtime.toISOString();

        db.get('SELECT id FROM images WHERE relativePath = ?', [relativePath], (err, row) => {
            if (err) {
                console.error('Error querying database:', err.message);
            } else if (!row) {

                // Generate thumbnail at the same path, but within the thumbnail dir
                createThumbnail(filePath, thumbnailPath);

                db.run('INSERT INTO images (relativePath, dateTaken) VALUES (?, ?)', [relativePath, dateTaken], (err) => {
                    if (err && err.code !== 'SQLITE_CONSTRAINT') {
                        console.error('Error inserting image:', err.message);
                    }
                });
            }
        });
    });

    watcher.on('unlink', (filePath) => {
        const relativePath = path.relative(IMAGE_DIR, filePath);
        const thumbnailPath = path.join(THUMBNAIL_DIR, relativePath);

        // Delete the thumbnail if it exists
        fs.unlink(thumbnailPath, (err) => {
            if (err && err.code !== 'ENOENT') {
                console.error('Error deleting thumbnail:', err.message);
            } else if (!err) {
                console.log(`Deleted thumbnail: ${thumbnailPath}`);
            }
        });

        db.run('DELETE FROM images WHERE relativePath = ?', [relativePath], (err) => {
            if (err) console.error('Error deleting image:', err.message);
        });
    });
}

// Get all files in ID order
app.get('/api/images/all', (req, res) => {
    db.all('SELECT * FROM images ORDER BY dateTaken ASC', [], (err, rows) => {
        if (err) {
            res.status(500).json({ error: 'Database error' });
        } else {
            res.json(rows);
        }
    });
});


// Serve images
app.get('/images/:filename', (req, res) => {
    const imagePath = path.join(IMAGE_DIR, req.params.filename);
    if (fs.existsSync(imagePath)) {
        res.sendFile(imagePath);
    } else {
        res.status(404).send('Image not found');
    }
});

app.get('/thumbnails/:filename', (req, res) => {
    const thumbnailPath = path.join(THUMBNAIL_DIR, req.params.filename);

    if (fs.existsSync(thumbnailPath)) {
        res.sendFile(thumbnailPath);
    } else {
        res.status(404).send('Thumbnail not found');
    }
});

// Query for images by date range
app.get('/api/images/date-range', (req, res) => {
    const { startDate, endDate } = req.query;
    db.all(
        'SELECT * FROM images WHERE dateTaken BETWEEN ? AND ?',
        [startDate, endDate],
        (err, rows) => {
            if (err) {
                res.status(500).json({ error: 'Database error' });
            } else {
                res.json(rows);
            }
        }
    );
});

// Query for images by month across all years
app.get('/api/images/month', (req, res) => {
    const { month } = req.query;

    if (!month || isNaN(month) || month < 1 || month > 12) {
        return res.status(400).json({ error: 'Invalid month. Please provide a number between 1 and 12.' });
    }

    // Zero-pad the month if it's a single digit (e.g., '10' for October)
    const paddedMonth = month.padStart(2, '0');

    db.all(
        `SELECT * FROM images WHERE strftime('%m', dateTaken) = ?`,
        [paddedMonth],
        (err, rows) => {
            if (err) {
                res.status(500).json({ error: 'Database error' });
            } else {
                res.json(rows);
            }
        }
    );
});

// Query for images by multiple tags
app.get('/api/images/tags', (req, res) => {
    const { tags } = req.query;

    if (!tags || !Array.isArray(tags)) {
        return res.status(400).json({ error: 'Tags must be provided as an array' });
    }

    // Generate placeholders for query
    const placeholders = tags.map(() => '?').join(', ');

    db.all(
        `SELECT DISTINCT images.* FROM images 
         JOIN tags ON images.id = tags.imageId 
         WHERE tags.tag IN (${placeholders})`,
        tags,
        (err, rows) => {
            if (err) {
                res.status(500).json({ error: 'Database error' });
            } else {
                res.json(rows);
            }
        }
    );
});

// Endpoint to filter images by includeTags, excludeTags, and optionally selectedMonth
app.get('/api/images/filter', (req, res) => {
    const { includeTags, excludeTags, requiredTags, selectedMonth } = req.query;

    // Parse and validate input
    const includeTagsArray = includeTags ? includeTags.split(',') : [];
    const excludeTagsArray = excludeTags ? excludeTags.split(',') : [];
    const requiredTagsArray = requiredTags ? requiredTags.split(',') : [];
    const monthCondition = selectedMonth
        ? `AND strftime('%m', dateTaken) = '${String(selectedMonth).padStart(2, '0')}'`
        : '';

    // Base query
    let query = `
        SELECT images.* 
        FROM images
        LEFT JOIN tags ON images.id = tags.imageId
        WHERE 1=1
    `;

    // Include images containing at least one of the includeTags
    if (includeTagsArray.length > 0) {
        query += ` AND images.id IN (
            SELECT imageId 
            FROM tags 
            WHERE tag IN (${includeTagsArray.map(() => '?').join(',')})
        )`;
    }

    // Exclude images containing any of the excludeTags
    if (excludeTagsArray.length > 0) {
        query += ` AND images.id NOT IN (
            SELECT imageId 
            FROM tags 
            WHERE tag IN (${excludeTagsArray.map(() => '?').join(',')})
        )`;
    }

    // Include only images containing all requiredTags
    if (requiredTagsArray.length > 0) {
        query += requiredTagsArray
            .map(() => `
                AND images.id IN (
                    SELECT imageId 
                    FROM tags 
                    WHERE tag = ?
                )
            `)
            .join('');
    }

    // Add month condition
    query += ` ${monthCondition} GROUP BY images.id ORDER BY images.dateTaken`;

    // Parameters for the query
    const params = [...includeTagsArray, ...excludeTagsArray, ...requiredTagsArray];

    // Execute query
    db.all(query, params, (err, rows) => {
        if (err) {
            console.error('Error filtering images:', err.message);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(rows);
    });
});

// Get tags for a specific image
app.get('/api/images/:id/tags', (req, res) => {
    const { id } = req.params;

    db.all(
        'SELECT tag FROM tags WHERE imageId = ?',
        [id],
        (err, rows) => {
            if (err) {
                res.status(500).json({ error: 'Database error' });
            } else {
                const tags = rows.map(row => row.tag);
                res.json(tags);
            }
        }
    );
});

// Add tags to an image
app.post('/api/images/:id/tags', (req, res) => {
    const { id } = req.params;
    const { tags } = req.body;

    if (!Array.isArray(tags)) {
        return res.status(400).json({ error: 'Tags must be an array' });
    }

    const insertTags = db.prepare('INSERT OR IGNORE INTO tags (imageId, tag) VALUES (?, ?)');
    tags.forEach((tag) => {
        tag = tag
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9\s]/g, '')
            .replace(/\s/g, '-');
        insertTags.run(id, tag, (err) => {
            if (err) {
                console.error('Error inserting tag:', err.message);
            }
        });
    });
    insertTags.finalize(() => res.status(200).send('Tags added successfully (duplicates ignored)'));
});

// Remove a tag from an image
app.delete('/api/images/:id/tags', (req, res) => {
    const { id } = req.params;
    const { tag } = req.body;

    if (!tag) {
        return res.status(400).json({ error: 'Tag must be provided' });
    }

    db.run(
        'DELETE FROM tags WHERE imageId = ? AND tag = ?',
        [id, tag],
        (err) => {
            if (err) {
                res.status(500).json({ error: 'Database error' });
            } else {
                res.status(200).send('Tag removed successfully');
            }
        }
    );
});

// Get all distinct tags
app.get('/api/tags', (req, res) => {
    db.all('SELECT tag, COUNT(id) FROM tags GROUP BY tag ORDER BY COUNT(id) DESC', [], (err, rows) => {
        if (err) {
            res.status(500).json({ error: 'Database error' });
        } else {
            const tags = rows.map(row => row.tag);
            res.json(tags);
        }
    });
});

// Get all images with no tags
app.get('/api/images/no-tags', (req, res) => {
    const query = `
        SELECT images.*
        FROM images
        LEFT JOIN tags ON images.id = tags.imageId
        WHERE tags.imageId IS NULL
    `;

    db.all(query, [], (err, rows) => {
        if (err) {
            console.error('Error fetching images with no tags:', err.message);
            return res.status(500).json({ error: 'Database error' });
        }

        res.json(rows);
    });
});

// Initialize the database and start the watcher
app.listen(PORT, async () => {
    await validateDatabaseAndFiles();
    watchDirectory();
    console.log(`Server is running on http://localhost:${PORT}`);
});
