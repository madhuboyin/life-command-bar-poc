import { Request, Response } from "express";
import { fail, ok } from "../utils/api-response";
import { UploadService } from "../services/upload.service";
import { handleControllerError } from "../utils/handle-controller-error";
import { getRequiredUserId } from "../utils/request-user";

const service = new UploadService();

export async function createUpload(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    if (!req.file) {
      return fail(res, "VALIDATION_ERROR", "File is required", 400);
    }

    const { upload, ingestion, extraction } = await service.createUploadAndIngest({
      userId,
      fileName: req.file.originalname,
      fileType: req.file.mimetype,
      fileSize: req.file.size,
      storagePath: req.file.path
    });

    return ok(
      res,
      {
        uploadId: upload.id,
        jobTriggered: false,
        extraction,
        ingestion
      },
      201
    );
  } catch (error) {
    return handleControllerError(res, error, "Could not upload file");
  }
}
