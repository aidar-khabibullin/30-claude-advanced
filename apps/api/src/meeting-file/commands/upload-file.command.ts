import type { MultipartFile } from '@fastify/multipart'

export class UploadFileCommand {
  constructor(
    public readonly meetingId: string,
    public readonly ownerId: string,
    public readonly file: MultipartFile,
  ) {}
}
