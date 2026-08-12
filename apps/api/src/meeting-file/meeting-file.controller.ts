import { BadRequestException, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import type {} from '@fastify/multipart'
import { FastifyRequest } from 'fastify'
import { JwtGuard } from '../auth/guards/jwt.guard'
import { UploadFileCommand } from './commands/upload-file.command'
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
    const data = await req.file()

    if (!data) {
      throw new BadRequestException('File is required')
    }

    return this.commandBus.execute(new UploadFileCommand(meetingId, req.user.id, data))
  }

  @Get()
  findAll(@Req() req: AuthRequest, @Param('id') meetingId: string) {
    return this.queryBus.execute(new GetMeetingFilesQuery(meetingId, req.user.id))
  }
}
