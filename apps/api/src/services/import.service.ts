import { IngestionService } from "./ingestion.service";

export class ImportService {
  private readonly ingestionService = new IngestionService();

  async importEmailForward(payload: unknown) {
    return this.ingestionService.ingestEmailForward(payload);
  }
}
