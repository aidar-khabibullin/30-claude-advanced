import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { PrismaService } from '../../prisma/prisma.service'
import { getOwnedMeeting } from '../get-owned-meeting'
import { GetMeetingFilesQuery } from '../queries/get-meeting-files.query'

@QueryHandler(GetMeetingFilesQuery)
export class GetMeetingFilesHandler implements IQueryHandler<GetMeetingFilesQuery> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: GetMeetingFilesQuery) {
    await getOwnedMeeting(this.prisma, query.meetingId, query.ownerId)

    return this.prisma.meetingFile.findMany({
      where: { meetingId: query.meetingId },
      orderBy: { uploadedAt: 'asc' },
    })
  }
}
