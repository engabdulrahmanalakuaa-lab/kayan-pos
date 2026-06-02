const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

let mainWindow;

const dbDir = app.getPath('userData');
const dbPath = path.join(dbDir, 'restaurant.db');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('خطأ أثناء فتح قاعدة البيانات:', err.message);
    } else {
        console.log('تم الاتصال بنجاح بقاعدة البيانات في المسار: ' + dbPath);
    }
});

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS inventory (
        material TEXT PRIMARY KEY,
        qty REAL,
        unit TEXT
    )`);

    db.get("SELECT COUNT(*) as count FROM inventory", [], (err, row) => {
        if (!err && row && row.count === 0) {
            db.run("INSERT INTO inventory VALUES ('chicken', 150, 'حبة')");
            db.run("INSERT INTO inventory VALUES ('rice', 100, 'كجم')");
            db.run("INSERT INTO inventory VALUES ('drinks', 200, 'علبة')");
        }
    });

    db.run(`CREATE TABLE IF NOT EXISTS menu_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        price REAL,
        recipe TEXT,
        category TEXT,
        img TEXT
    )`);

    db.get("SELECT COUNT(*) as count FROM menu_items", [], (err, row) => {
        if (!err && row && row.count === 0) {
            db.run("INSERT INTO menu_items (name, price, recipe, category, img) VALUES ('وجبة بروست حراق/عادي', 18, 'chicken_rice', 'popular', 'https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?w=200')");
            db.run("INSERT INTO menu_items (name, price, recipe, category, img) VALUES ('حبة شواية مع الرز', 35, 'chicken_rice', 'lunch', 'https://images.unsplash.com/photo-1610057099443-fde8c4d50f91?w=200')");
            db.run("INSERT INTO menu_items (name, price, recipe, category, img) VALUES ('نصف حبة شواية مع الرز', 18, 'half_chicken', 'lunch', 'https://images.unsplash.com/photo-1610057099443-fde8c4d50f91?w=200')");
            db.run("INSERT INTO menu_items (name, price, recipe, category, img) VALUES ('معصوب ملكي فاخر', 15, 'rice_only', 'maasoub', 'https://images.unsplash.com/photo-1541832676-9b763b0239ab?w=200')");
            db.run("INSERT INTO menu_items (name, price, recipe, category, img) VALUES ('معصوب عادي بالقشطة', 10, 'rice_only', 'maasoub', 'https://images.unsplash.com/photo-1541832676-9b763b0239ab?w=200')");
            db.run("INSERT INTO menu_items (name, price, recipe, category, img) VALUES ('مشروب غازي بارد', 3, 'drink', 'drinks', 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=200')");
        }
    });
});

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 1024,
        minHeight: 720,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    mainWindow.loadFile('index.html');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        db.close();
        app.quit();
    }
});

ipcMain.on('get-initial-data', (event) => {
    db.all("SELECT * FROM menu_items", [], (err, menuRows) => {
        db.all("SELECT * FROM inventory", [], (err, invRows) => {
            event.reply('initial-data-response', { menu: menuRows || [], inventory: invRows || [] });
        });
    });
});

ipcMain.on('add-menu-item', (event, item) => {
    db.run("INSERT INTO menu_items (name, price, recipe, category, img) VALUES (?, ?, ?, ?, ?)", 
        [item.name, item.price, item.recipe, item.category, item.img], function(err) {
            if (!err) event.reply('menu-updated');
    });
});

ipcMain.on('delete-menu-item', (event, id) => {
    db.run("DELETE FROM menu_items WHERE id = ?", [id], function(err) {
        if (!err) event.reply('menu-updated');
    });
});

ipcMain.on('update-inventory-stock', (event, data) => {
    db.run("UPDATE inventory SET qty = qty + ? WHERE material = ?", [data.qty, data.material], function(err) {
        if (!err) event.reply('inventory-updated');
    });
});

ipcMain.on('deduct-stock-on-sale', (event, cart) => {
    db.serialize(() => {
        cart.forEach(item => {
            const qty = item.qty;
            if (item.recipe === 'chicken_rice') {
                db.run("UPDATE inventory SET qty = qty - ? WHERE material = 'chicken'", [1 * qty]);
                db.run("UPDATE inventory SET qty = qty - ? WHERE material = 'rice'", [0.5 * qty]);
            } else if (item.recipe === 'half_chicken') {
                db.run("UPDATE inventory SET qty = qty - ? WHERE material = 'chicken'", [0.5 * qty]);
                db.run("UPDATE inventory SET qty = qty - ? WHERE material = 'rice'", [0.25 * qty]);
            } else if (item.recipe === 'rice_only') {
                db.run("UPDATE inventory SET qty = qty - ? WHERE material = 'rice'", [0.5 * qty]);
            } else if (item.recipe === 'drink') {
                db.run("UPDATE inventory SET qty = qty - ? WHERE material = 'drinks'", [1 * qty]);
            }
        });
        event.reply('inventory-updated');
    });
});

ipcMain.on('print-receipt', (event) => {
    if (mainWindow) {
        mainWindow.webContents.print({
            silent: true,
            printBackground: true,
            margins: { marginType: 'none' }
        }, (success, failureReason) => {
            if (!success) console.log('فشلت عملية الطباعة بسبب:', failureReason);
        });
    }
});
