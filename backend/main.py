from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import yt_dlp
import os

app = FastAPI()

# ---------- CORS (allows requests from other devices) ----------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------- Download Folder ----------
DOWNLOAD_DIR = "downloads"
os.makedirs(DOWNLOAD_DIR, exist_ok=True)


# ---------- Request Model ----------
class VideoRequest(BaseModel):
    url: str


# ---------- Convert Endpoint ----------
@app.post("/convert")
def convert_video(data: VideoRequest):

    try:
        ydl_opts = {
            "format": "bestaudio/best",
            "outtmpl": os.path.join(DOWNLOAD_DIR, "%(id)s.%(ext)s"),
            "noplaylist": True,
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(data.url, download=True)

        filename = f"{info['id']}.{info['ext']}"

        return {
            "status": "success",
            "title": info.get("title"),
            "file": filename,
            "format": info["ext"],
            "download_url": f"/download/{filename}"
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ---------- Download File Endpoint ----------
@app.get("/download/{filename}")
def download_file(filename: str):

    file_path = os.path.join(DOWNLOAD_DIR, filename)

    if os.path.exists(file_path):
        return FileResponse(file_path, filename=filename)

    raise HTTPException(status_code=404, detail="File not found")

# ---------- Default Endpoint ----------
@app.get("/")
def defaultpath():
    return {
        "message": "YouTube Audio API is running 🚀",
        "docs": "/docs",
        "convert_endpoint": "/convert"
    }