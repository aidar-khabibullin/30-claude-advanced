import { NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

export async function getOwnedMeeting(prisma: PrismaService, meetingId: string, ownerId: string) {
  const meeting = await prisma.meeting.findFirst({ where: { id: meetingId, ownerId } })

  if (!meeting) {
    throw new NotFoundException('Meeting not found')
  }

  return meeting
}
