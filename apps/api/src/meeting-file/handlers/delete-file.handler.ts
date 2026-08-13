import * as fs from 'fs'
import * as path from 'path'
import { NotFoundException } from '@nestjs/common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { PrismaService } from '../../prisma/prisma.service'
import { DeleteFileCommand } from '../commands/delete-file.command'
import { getOwnedMeeting } from '../get-owned-meeting'

@CommandHandler(DeleteFileCommand)
export class DeleteFileHandler implements ICommandHandler<DeleteFileCommand> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: DeleteFileCommand) {
    const { meetingId, fileId, ownerId } = command

    await getOwnedMeeting(this.prisma, meetingId, ownerId)

    const file = await this.prisma.meetingFile.findFirst({
      where: { id: fileId, meetingId },
    })

    if (!file) {
      throw new NotFoundException('File not found')
    }

    await this.prisma.meetingFile.delete({ where: { id: file.id } })
    await fs.promises.rm(path.dirname(file.filePath), { recursive: true, force: true })
  }
}
