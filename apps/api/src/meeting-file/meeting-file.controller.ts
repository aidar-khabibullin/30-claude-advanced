import { createReadStream } from 'fs'
import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import type { MultipartFile } from '@fastify/multipart'
import { FastifyReply, FastifyRequest } from 'fastify'
import { JwtGuard } from '../auth/guards/jwt.guard'
import { DeleteFileCommand } from './commands/delete-file.command'
import { UploadFileCommand } from './commands/upload-file.command'
import { GetFileQuery } from './queries/get-file.query'
import { GetMeetingFilesQuery } from './queries/get-meeting-files.query'

type AuthRequest = FastifyRequest & { user: { id: string; email: string } }

@Controller('meetings/:id/files')
@UseGuards(JwtGuard)
export class MeetingFileController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post()
  async upload(@Req() req: AuthRequest, @Param('id') meetingId: string) {
    let data: MultipartFile | undefined

    try {
      data = await req.file()
    } catch {
      throw new BadRequestException('Invalid multipart request')
    }

    if (!data) {
      throw new BadRequestException('File is required')
    }

    return this.commandBus.execute(new UploadFileCommand(meetingId, req.user.id, data))
  }

  @Get()
  findAll(@Req() req: AuthRequest, @Param('id') meetingId: string) {
    return this.queryBus.execute(new GetMeetingFilesQuery(meetingId, req.user.id))
  }

  @Get(':fileId/download')
  async download(
    @Req() req: AuthRequest,
    @Param('id') meetingId: string,
    @Param('fileId') fileId: string,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const file = await this.queryBus.execute(new GetFileQuery(meetingId, fileId, req.user.id))

    const encodedName = encodeURIComponent(file.originalName)
    res.header(
      'Content-Disposition',
      `attachment; filename="${encodedName}"; filename*=UTF-8''${encodedName}`,
    )
    res.header('Content-Type', file.mimeType)

    return new StreamableFile(createReadStream(file.filePath))
  }

  @Delete(':fileId')
  async deleteFile(
    @Req() req: AuthRequest,
    @Param('id') meetingId: string,
    @Param('fileId') fileId: string,
  ) {
    await this.commandBus.execute(new DeleteFileCommand(meetingId, fileId, req.user.id))
  }
}
