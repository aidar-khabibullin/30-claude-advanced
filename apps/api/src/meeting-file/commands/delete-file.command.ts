export class DeleteFileCommand {
  constructor(
    public readonly meetingId: string,
    public readonly fileId: string,
    public readonly ownerId: string,
  ) {}
}
