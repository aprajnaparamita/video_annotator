const { ipcRenderer } = require("electron");

let annotationDir = "";
let baseName = "";
let videoPath = "";
let drawingMode = false;
let strokes = [];
let currentStroke = null;
let isDrawing = false;

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const video = document.getElementById("video");
const notesBox = document.getElementById("notes");
const colorPicker = document.getElementById("colorPicker");
const timestampList = document.getElementById("timestampList");
const deleteBtn = document.getElementById("deleteBtn");

// -----------------------------------------------------
// SELECT VIDEO FILE
// -----------------------------------------------------
async function chooseVideo() {
  const info = await ipcRenderer.invoke("select-video");
  if (!info) return;

  videoPath = info.filePath;
  annotationDir = info.annotationDir;
  baseName = info.baseName;

  video.src = `file://${encodeURI(videoPath)}`;
  video.load();

  video.addEventListener("error", (e) => console.log("Video error", e));
  video.addEventListener("canplay", () => console.log("Video ready"));

  await loadTimestamps();
  await loadMetaData();
}
chooseVideo();

// -----------------------------------------------------
// REDRAW CANVAS
// -----------------------------------------------------
function redrawCanvas() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (const stroke of strokes) {
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = 3;
    ctx.beginPath();

    stroke.points.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });

    ctx.stroke();
  }
}

// -----------------------------------------------------
// TOGGLE DRAWING MODE
// -----------------------------------------------------
function enableDrawingMode(enable, { fromLoad = false } = {}) {
  drawingMode = enable;

  const editBtn = document.getElementById('editBtn');
  const saveBtn = document.getElementById('saveBtn');

  if (enable) {
    // Entering edit mode
    editBtn.disabled = true;
    saveBtn.disabled = false;
    
    canvas.style.pointerEvents = "auto";
    video.style.pointerEvents = "none";
    video.pause();

    if (!fromLoad) { 
      strokes = [];
      redrawCanvas();
      notesBox.value = "";
    }
  } else {
    // Exiting edit mode (saving)
    editBtn.disabled = false;
    saveBtn.disabled = true;
    
    canvas.style.pointerEvents = "none";
    video.style.pointerEvents = "auto";
    
    if (!fromLoad) {
      saveCurrentAnnotation().then(() => {
        strokes = [];
        redrawCanvas();
        notesBox.value = "";
      });
    }
  }
}



document.getElementById("editBtn").addEventListener("click", () => {
  enableDrawingMode(!drawingMode);
});
document.getElementById("saveBtn").addEventListener("click", () => {
  enableDrawingMode(!drawingMode);
});

// -----------------------------------------------------
// DRAWING EVENTS
// -----------------------------------------------------
canvas.addEventListener("mousedown", e => {
  if (!drawingMode) return;
  isDrawing = true;
  currentStroke = { color: colorPicker.value, points: [] };
  strokes.push(currentStroke);

  const rect = canvas.getBoundingClientRect();
  currentStroke.points.push({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  redrawCanvas();
});

canvas.addEventListener("mousemove", e => {
  if (!isDrawing || !drawingMode) return;

  const rect = canvas.getBoundingClientRect();
  currentStroke.points.push({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  redrawCanvas();
});

canvas.addEventListener("mouseup", () => { if (drawingMode) isDrawing = false; });
canvas.addEventListener("mouseleave", () => { isDrawing = false; });

// -----------------------------------------------------
// SAVE META DATA
// -----------------------------------------------------
async function saveMetaData() {
  const title = document.getElementById('annotationTitle').value;
  const weldType = document.getElementById('weldType').value;
  
  if (annotationDir) {
    await ipcRenderer.invoke("save-json", {
      annotationDir,
      filename: 'meta.json',  // Fixed filename for meta data
      data: { title, weldType }
    });
  }
}

// -----------------------------------------------------
// LOAD META DATA
// -----------------------------------------------------
async function loadMetaData() {
  try {
    const meta = await ipcRenderer.invoke("load-json", {
      annotationDir,
      filename: 'meta.json'
    });
    
    if (meta) {
      document.getElementById('annotationTitle').value = meta.title || '';
      const weldTypeSelect = document.getElementById('weldType');
      if (weldTypeSelect.querySelector(`option[value="${meta.weldType}"]`)) {
        weldTypeSelect.value = meta.weldType;
      } else {
        weldTypeSelect.value = 'Other';
      }
    }
  } catch (e) {
    // Meta file doesn't exist yet, use defaults
    console.log('No meta data found, using defaults');
  }
}

// -----------------------------------------------------
// SAVE ANNOTATION
// -----------------------------------------------------
async function saveAnnotation(timestamp, notes, strokes) {
  // Save the annotation
  await ipcRenderer.invoke("save-json", {
    annotationDir,
    timestamp,
    data: { timestamp, notes, strokes }
  });
  
  // Save meta data
  await saveMetaData();
}

async function saveCurrentAnnotation() {
  if (strokes.length === 0 && notesBox.value.trim() === "") return;

  const timestamp = Math.floor(video.currentTime * 1000);
  await saveAnnotation(timestamp, notesBox.value, strokes);
  await loadTimestamps();
}

// -----------------------------------------------------
// LOAD TIMESTAMPS
// -----------------------------------------------------
async function loadTimestamps() {
  const list = await ipcRenderer.invoke("load-json-list", annotationDir);

  timestampList.innerHTML = "";
  for (const item of list) {
    const seconds = (item.timestamp / 1000).toFixed(2);
    const opt = document.createElement("option");
    opt.value = item.name;
    opt.textContent = seconds + "s";
    timestampList.appendChild(opt);
  }
}

// -----------------------------------------------------
// LOAD SELECTED ANNOTATION
// -----------------------------------------------------
timestampList.addEventListener("change", async () => {
  const filename = timestampList.value;
  if (!filename) return;

  const data = await ipcRenderer.invoke("load-json", { annotationDir, filename });

  // Load saved strokes & notes
  strokes = data.strokes || [];
  notesBox.value = data.notes || "";

  // Position video to saved timestamp
  video.currentTime = data.timestamp / 1000;

  // Redraw strokes
  redrawCanvas();

  // Enter edit mode for this annotation without clearing canvas/notes
  enableDrawingMode(true, { fromLoad: true });
});

// -----------------------------------------------------
// DELETE SELECTED ANNOTATION
// -----------------------------------------------------
deleteBtn.addEventListener("click", async () => {
  const filename = timestampList.value;
  if (!filename) return;

  const confirmDelete = confirm("Are you sure you want to delete this annotation?");
  if (!confirmDelete) return;

  strokes = [];
  redrawCanvas();
  notesBox.value = "";
  const success = await ipcRenderer.invoke("delete-json", { annotationDir, filename });
  if (success) {
    // Reset to not editing mode if we were in edit mode
    if (drawingMode) {
      enableDrawingMode(false);
    }
    await loadTimestamps();
  }
});
