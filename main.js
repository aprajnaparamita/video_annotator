const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const fs = require("fs");
const path = require("path");

// Store the main window reference
let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 900,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false,
      allowRunningInsecureContent: true,
      sandbox: false
    },
    title: 'Video Annotator'
  });

  mainWindow.loadFile("index.html");
  return mainWindow;
}

app.whenReady().then(() => {
  createWindow();
});

// ----------------------------------------------------
// USER SELECTS VIDEO FILE
// ----------------------------------------------------
ipcMain.handle("select-video", async () => {
  const result = await dialog.showOpenDialog({
    filters: [
      { name: "Video", extensions: ["mp4", "mpg", "mov"] }
    ],
    properties: ["openFile"]
  });

  if (result.canceled) return null;

  const filePath = result.filePaths[0];
  const folder = path.dirname(filePath);
  const baseName = path.basename(filePath, path.extname(filePath));

  const annotationDir = path.join(folder, baseName + "_annotations");

  // Update window title to include the folder name
  const folderName = path.basename(folder);
  if (mainWindow) {
    mainWindow.setTitle(`Video Annotator: ${folderName}`);
  }

  return {
    filePath,
    folder,
    baseName,
    annotationDir
  };
});

// ----------------------------------------------------
// SAVE JSON
// ----------------------------------------------------
ipcMain.handle("save-json", async (event, args) => {
  const { annotationDir, data } = args;
  const filename = args.filename || `${args.timestamp}.json`;
  
  if (!annotationDir) {
    throw new Error('No annotation directory specified');
  }

  // Create the folder if it doesn't exist
  if (!fs.existsSync(annotationDir)) {
    fs.mkdirSync(annotationDir);
  }

  const fullPath = path.join(annotationDir, filename);
  fs.writeFileSync(fullPath, JSON.stringify(data, null, 2));
  return true;
});


// ----------------------------------------------------
// LOAD ALL JSON OBJECTS
// ----------------------------------------------------
ipcMain.handle("load-json-list", (event, annotationDir) => {
  if (!fs.existsSync(annotationDir)) return [];

  return fs.readdirSync(annotationDir)
    .filter(f => f.endsWith(".json") && f !== 'meta.json') // Exclude meta.json from the list
    .map(f => ({
      name: f,
      timestamp: parseInt(f.replace(".json", ""))
    }))
    .sort((a, b) => a.timestamp - b.timestamp);
});

// ----------------------------------------------------
// LOAD SPECIFIC JSON FILE
// ----------------------------------------------------
ipcMain.handle("load-json", (event, args) => {
  const { annotationDir, filename } = args;
  
  if (!annotationDir) {
    throw new Error('No annotation directory specified');
  }

  const fullPath = path.join(annotationDir, filename);
  
  if (!fs.existsSync(fullPath)) {
    return null;
  }
  
  const content = fs.readFileSync(fullPath, "utf8");
  return JSON.parse(content);
});

// ----------------------------------------------------
// DELETE JSON
// ----------------------------------------------------
ipcMain.handle("delete-json", (event, args) => {
  const { annotationDir, filename } = args;

  const fullPath = path.join(annotationDir, filename);
  fs.unlinkSync(fullPath);

  return true;
});

