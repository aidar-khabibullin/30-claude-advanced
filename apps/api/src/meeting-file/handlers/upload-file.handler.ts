import { randomUUID } from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import { pipeline } from 'stream/promises'
import { BadRequestException } from '@nestjs/common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { UPLOAD_DIR } from '../../config/upload-dir'
import { PrismaService } from '../../prisma/prisma.service'
import { ALLOWED_MIME_TYPES } from '../allowed-mime-types'
import { UploadFileCommand } from '../commands/upload-file.command'
import { getOwnedMeeting } from '../get-owned-meeting'

@CommandHandler(UploadFileCommand)
export class UploadFileHandler implements ICommandHandler<UploadFileCommand> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: UploadFileCommand) {
    const { meetingId, ownerId, file } = command

    try {
      await getOwnedMeeting(this.prisma, meetingId, ownerId)
    } catch (err) {
      await file.file.resume()
      throw err
    }

    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      await file.file.resume()
      throw new BadRequestException(`File type ${file.mimetype} is not allowed`)
    }

    const dir = path.join(UPLOAD_DIR, 'meetings', meetingId, randomUUID())
    await fs.promises.mkdir(dir, { recursive: true })
    const filePath = path.join(dir, path.basename(file.filename))

    try {
      await pipeline(file.file, fs.createWriteStream(filePath))
    } catch (err) {
      await fs.promises.rm(dir, { recursive: true, force: true })
      if ((err as { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE') {
        throw new BadRequestException('File is too large')
      }
      throw err
    }

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
