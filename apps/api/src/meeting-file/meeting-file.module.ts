import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { AppJwtModule } from '../auth/jwt-config.module'
import { JwtGuard } from '../auth/guards/jwt.guard'
import { GetMeetingFilesHandler } from './handlers/get-meeting-files.handler'
import { UploadFileHandler } from './handlers/upload-file.handler'
import { MeetingFileController } from './meeting-file.controller'

@Module({
  imports: [CqrsModule, AppJwtModule],
  controllers: [MeetingFileController],
  providers: [JwtGuard, UploadFileHandler, GetMeetingFilesHandler],
})
export class MeetingFileModule {}
