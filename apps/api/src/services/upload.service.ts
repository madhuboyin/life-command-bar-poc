import fs from "fs";
import path from "path";
import { prisma } from "../clients/prisma.client";

type CreateUploadInput = {
  userId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  storagePath: string;
};

export class UploadService {
  async createUpload(input: CreateUploadInput) {
    const upload = await prisma.upload.create({
      data: {
        userId: input.userId,
        fileName: input.fileName,
        fileType: input.fileType,
        fileSize: input.fileSize,
        storagePath: input.storagePath,
        status: "UPLOADED"
      }
    });

    await prisma.auditEvent.create({
      data: {
        userId: input.userId,
        eventType: "upload_created",
        metadata: {
          uploadId: upload.id,
          fileName: input.fileName
        }
      }
    });

    return upload;
  }

  ensureUploadDir(uploadDir: string) {
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    return path.resolve(uploadDir);
  }
}
