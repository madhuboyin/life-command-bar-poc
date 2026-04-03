import path from "path";
import { Request, Response } from "express";
import { fail, ok } from "../utils/api-response";
import { UploadService } from "../services/upload.service";

const service = new UploadService();
const DEFAULT_USER_ID = "usr_demo_001";

export async function createUpload(req: Request, res: Response) {
  try {
    if (!req.file) {
      return fail(res, "VALIDATION_ERROR", "File is required", 400);
    }

    const uploadDir = service.ensureUploadDir(
      process.env.UPLOAD_DIR || path.resolve(process.cwd(), "uploads")
    );

    const storagePath = path.join(uploadDir, req.file.filename);

    const upload = await service.createUpload({
      userId: DEFAULT_USER_ID,
      fileName: req.file.originalname,
      fileType: req.file.mimetype,
      fileSize: req.file.size,
      storagePath
    });

    return ok(
      res,
      {
        uploadId: upload.id,
        jobTriggered: false
      },
      201
    );
  } catch (error) {
    console.error(error);
    return fail(res, "INTERNAL_ERROR", "Could not upload file", 500);
  }
}
