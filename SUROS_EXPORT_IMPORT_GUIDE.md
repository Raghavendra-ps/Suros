# Suros Sites Export/Import Feature

## Overview

Easily backup and transfer your monitored sites list between Suros instances.

## Features

✅ **Export** - Download all monitored sites to a JSON file  
✅ **Import** - Upload sites from a previously exported file  
✅ **Merge or Replace** - Choose whether to merge with existing sites or replace entirely  
✅ **Duplicate Detection** - Automatically skips duplicate URLs during import  
✅ **Validation** - Ensures all imported sites have valid names and URLs  

## How to Use

### Export Sites

1. Go to the **Dashboard** tab
2. Find the "**Monitored Sites**" card
3. Click the **"↓ Export"** button
4. A JSON file will download: `suros-sites-YYYY-MM-DD.json`

**File Format:**
```json
{
  "export_date": "2026-09-02T14:30:00.000000",
  "site_count": 3,
  "sites": [
    {
      "name": "My Portfolio",
      "url": "https://example.com",
      "icon": "Globe"
    },
    {
      "name": "API Server",
      "url": "https://api.example.com",
      "icon": "Code"
    }
  ]
}
```

### Import Sites

1. Go to the **Dashboard** tab
2. Find the "**Monitored Sites**" card
3. Click the **"↑ Import"** button
4. Select a previously exported `.json` file
5. A dialog will ask:
   - **"OK"** = Clear all existing sites and import the new ones
   - **"Cancel"** = Keep existing sites and merge with imported ones
6. Results will show how many sites were imported and any warnings

## Use Cases

### Backup Your Sites
Export regularly to have a backup of your monitored sites list.

### Transfer Between Instances
1. Export from one Suros instance
2. Import into another Suros instance
3. All sites and their icons are preserved

### Bulk Edit
1. Export sites
2. Edit the JSON file (change names, URLs, icons)
3. Clear existing and re-import

### Share Configuration
Export your site list and share with team members.

## Tips

- **Export regularly** - Keep backups in case of data loss
- **Name your files** - Use descriptive names like `suros-sites-production.json`
- **Edit carefully** - If editing the JSON, ensure proper JSON syntax
- **Check duplicates** - Importing will skip sites with duplicate URLs

## API Endpoints

### GET /api/sites/export
Returns all monitored sites in JSON format.

**Response:**
```json
{
  "export_date": "2026-09-02T14:30:00.000000",
  "site_count": 2,
  "sites": [...]
}
```

### POST /api/sites/import
Import sites from JSON data.

**Request Body:**
```json
{
  "sites": [
    {
      "name": "Site Name",
      "url": "https://example.com",
      "icon": "Globe"
    }
  ],
  "clear_existing": false
}
```

**Response:**
```json
{
  "imported": 2,
  "skipped": 0,
  "errors": [],
  "message": "Imported 2 sites, skipped 0"
}
```

## Troubleshooting

### Import shows "Check file format" error
- Ensure the file is valid JSON
- Check that it has a `"sites"` array
- Each site must have `name` and `url` fields

### Import shows "Site already exists"
- This site URL is already monitored
- Choose "Cancel" instead of "OK" to merge, or remove the duplicate manually first

### Missing icons after import
- Icons default to "Globe" if not specified
- You can edit individual sites to change the icon

---

Ready to try it? Go to the Dashboard and look for the **Export/Import** buttons! 🚀
