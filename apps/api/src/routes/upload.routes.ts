import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { createUpload } from "../controllers/upload.controller";

const uploadDir = path.resolve(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const safeName = `${Date.now()}-${file.originalname.replace(/\s+/g, "-")}`;
    cb(null, safeName);
  }
});

const upload = multer({ storage });

export const uploadRouter = Router();

uploadRouter.post("/", upload.single("file"), createUpload);
