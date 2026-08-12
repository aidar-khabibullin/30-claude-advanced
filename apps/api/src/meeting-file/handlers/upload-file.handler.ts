import { randomUUID } from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import { pipeline } from 'stream/promises'
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { PrismaService } from '../../prisma/prisma.service'
import { ALLOWED_MIME_TYPES } from '../allowed-mime-types'
import { UploadFileCommand } from '../commands/upload-file.command'

@CommandHandler(UploadFileCommand)
export class UploadFileHandler implements ICommandHandler<UploadFileCommand> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: UploadFileCommand) {
    const { meetingId, ownerId, file } = command

    const meeting = await this.prisma.meeting.findFirst({
      where: { id: meetingId, ownerId },
    })

    if (!meeting) {
      await file.file.resume()
      throw new NotFoundException('Meeting not found')
    }

    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      await file.file.resume()
      throw new BadRequestException(`File type ${file.mimetype} is not allowed`)
    }

    const uploadDir = process.env['UPLOAD_DIR'] ?? './uploads'
    const dir = path.join(uploadDir, 'meetings', meetingId, randomUUID())
    await fs.promises.mkdir(dir, { recursive: true })
    const filePath = path.join(dir, file.filename)

    await pipeline(file.file, fs.createWriteStream(filePath))

    if (file.file.truncated) {
      await fs.promises.rm(dir, { recursive: true, force: true })
      throw new BadRequestException('File is too large')
    }

    try {
      return await this.prisma.meetingFile.create({
        data: {
          meetingId,
          originalName: file.filename,
          mimeType: file.mimetype,
          size: file.file.bytesRead,
          filePath,
        },
      })
    } catch (err) {
      await fs.promises.rm(dir, { recursive: true, force: true })
      throw err
    }
  }
}
