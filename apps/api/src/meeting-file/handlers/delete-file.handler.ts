import * as fs from 'fs'
import * as path from 'path'
import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { PrismaService } from '../../prisma/prisma.service'
import { DeleteFileCommand } from '../commands/delete-file.command'

@CommandHandler(DeleteFileCommand)
export class DeleteFileHandler implements ICommandHandler<DeleteFileCommand> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: DeleteFileCommand) {
    const { meetingId, fileId, ownerId } = command

    const file = await this.prisma.meetingFile.findFirst({
      where: { id: fileId, meetingId },
      include: { meeting: true },
    })

    if (!file) {
      throw new NotFoundException('File not found')
    }

    if (file.meeting.ownerId !== ownerId) {
      throw new ForbiddenException()
    }

    await this.prisma.meetingFile.delete({ where: { id: file.id } })
    await fs.promises.rm(path.dirname(file.filePath), { recursive: true, force: true })
  }
}
