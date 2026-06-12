# LaTeX Document Converter Studio

A full-stack, responsive web application that extracts text from drafts and uploaded documents (`.txt` or `.docx`), translates the formatting structure into fully self-contained LaTeX code, and handles persistent project history using browser `localStorage`.

## 🌐 Features

1. **Dual Translation Modes**:
   - **AI Smart Mode (Gemini 3.5)**: Detects natural mathematical formulas (e.g. *integral of relative functions*), converts tabular structures into beautiful arrays, and constructs polished headers/subsections.
   - **Regex Rules Mode**: Instant rules-based translation mapping standard headlines, bold, italic, and numeric/bullet lists, while fully escaping raw LaTeX special sequences (e.g., `%`, `$`, `&`, `#`, `_`, `{`, `}`, `~`, `^`, `\`).

2. **Drag & Drop Upload Panel**:
   - Parses `.docx` Word Documents natively using Mammoth on the backend.
   - Parses `.txt` files directly.
   - Automatically populates the workspace and extracts clean titles.

3. **Workspace Features**:
   - **Past Sessions Sidebar**: Auto-saves current work into `localStorage`. Start new drafts, delete old records, and click to view past transcripts easily.
   - **Quick Actions Panel**: Direct "Copy to Clipboard" feedback and direct `.tex` file downloads on local filesystems.
   - **Overleaf Guideline Card**: Practical step-by-step documentation on pasting and compiling inside Overleaf with standard math, hyperref, and amsfonts packages.

---

## 🛠️ Tech Stack & Structure

- **Frontend**: React, Tailwind CSS (v4), Lucide Icons, typography settings.
- **Backend**: Express Node.js, `multer` (multipart/form-data upload buffers), `mammoth` (document parsing engine), and `@google/genai` (SDK for modern Gemini Pro actions).
- **TypeScript**: Full static typing and schema verification.

### File Structure
```
├── server.ts                 # Full-stack backend hosting & translation router
├── package.json              # Script runners and server-side package manifests
├── metadata.json             # AI Studio Application details
├── src/
│   ├── App.tsx               # Master React typesetting editor
│   ├── index.css             # Tailwind v4 structure & typography font setups
│   ├── types.ts              # TypeScript interfaces for SavedProjects
│   └── main.tsx              # React entry point
└── README.md                 # Project starter and developer guides
```

---

## 🚀 Setting Up Locally

Follow these steps to run the application on your computer:

### 1. Prerequisites
Ensure you have Node.js (version 18 or above) and npm installed.

### 2. Enter Environment Secret
To unlock AI Smart conversions, copy `.env.example` into a new `.env` file and define your Gemini API key:
```env
GEMINI_API_KEY="YOUR_ACTUAL_GEMINI_API_KEY"
```

### 3. Install Package Dependencies
```bash
npm install
```

### 4. Live Developer Mode
Runs the local Vite dynamic server and Express app:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 5. Production Compiling & Building
To package and build the production static files and compile typescript:
```bash
npm run build
```

Then start the production build directly:
```bash
npm start
```
