import { NotFoundException } from '@nestjs/common'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { PrismaService } from '../../prisma/prisma.service'
import { getOwnedMeeting } from '../get-owned-meeting'
import { GetFileQuery } from '../queries/get-file.query'

@QueryHandler(GetFileQuery)
export class GetFileHandler implements IQueryHandler<GetFileQuery> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: GetFileQuery) {
    await getOwnedMeeting(this.prisma, query.meetingId, query.ownerId)

    const file = await this.prisma.meetingFile.findFirst({
      where: { id: query.fileId, meetingId: query.meetingId },
    })

    if (!file) {
      throw new NotFoundException('File not found')
    }

    return file
  }
}
